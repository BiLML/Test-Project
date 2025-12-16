# backend/main.py
import requests
import os
import asyncio
import numpy as np
import cv2 
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
import cloudinary
import cloudinary.uploader
from bson.objectid import ObjectId
import io
import tensorflow as tf
# Import để xử lý ảnh cho model cũ (nếu dùng EfficientNet)
from tensorflow.keras.applications.efficientnet import preprocess_input

# 1. Load biến môi trường
load_dotenv()

# 2. Khởi tạo App
app = FastAPI()

# 3. Cấu hình CORS
origins = ["http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Kết nối Database
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.aura_db
users_collection = db.users
medical_records_collection = db.medical_records

# 5. Cấu hình Bảo mật
SECRET_KEY = os.getenv("SECRET_KEY", "secret_mac_dinh")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# 6. Cấu hình Cloudinary
cloudinary.config( 
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
    api_key = os.getenv("CLOUDINARY_API_KEY"), 
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure = True
)

# ==============================================================================
# 🧠 KHỞI TẠO HỆ THỐNG AURA AI (HYBRID ENSEMBLE: SEGMENTATION + CLASSIFICATION)
# ==============================================================================

# Cấu hình danh sách model
MODEL_PATHS = {
    # --- ĐỘI QUÂN MỚI (Segmentation - Chuyên gia chi tiết) ---
    'EX': 'unet_mega_fusion.keras',      # Xuất tiết cứng
    'HE': 'unet_hemorrhages.keras',      # Xuất huyết
    'SE': 'unet_soft_exudates.keras',    # Xuất tiết mềm
    'MA': 'unet_microaneurysms.keras',   # Vi phình mạch
    'OD': 'unet_optic_disc.keras',       # Đĩa thị
    'Vessels': 'unet_vessels_pro.keras', # Mạch máu Pro
    
    # --- LÃO TƯỚNG (Classification - Chuyên gia tổng quan) ---
    'CLASSIFIER': 'aura_retinal_model_final.keras' 
}

loaded_models = {}

print("⏳ ĐANG KHỞI ĐỘNG HỆ THỐNG AURA AI (CHẾ ĐỘ LAI)...")
for name, path in MODEL_PATHS.items():
    if os.path.exists(path):
        try:
            # compile=False để tránh lỗi hàm loss tùy chỉnh khi load
            loaded_models[name] = tf.keras.models.load_model(path, compile=False)
            print(f"   ✅ Đã tải Module: {name}")
        except Exception as e:
            print(f"   ❌ Lỗi tải {name}: {e}")
    else:
        print(f"   ⚠️ Không tìm thấy file model: {path}")

print(f"🚀 AURA SẴN SÀNG! ({len(loaded_models)}/{len(MODEL_PATHS)} modules hoạt động)")

# --- CÁC HÀM XỬ LÝ ẢNH ---

def preprocess_for_segmentation(img_array, target_size=256):
    """Chuẩn hóa ảnh cho các model tổn thương (EX, HE, SE, MA, OD)"""
    img = cv2.resize(img_array, (target_size, target_size))
    img = img / 255.0  # Chuẩn hóa về [0, 1]
    img = np.expand_dims(img, axis=0) # Thêm chiều batch
    return img

def preprocess_for_vessels_pro(img_array):
    """Xử lý đặc biệt cho Mạch máu (Kênh xanh + CLAHE + 512px)"""
    img = cv2.resize(img_array, (512, 512))
    green_channel = img[:, :, 1]
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced_img = clahe.apply(green_channel)
    enhanced_img = enhanced_img / 255.0
    enhanced_img = np.expand_dims(enhanced_img, axis=-1)
    enhanced_img = np.expand_dims(enhanced_img, axis=0)
    return enhanced_img

def preprocess_for_classifier(img_array):
    """Xử lý cho model phân loại cũ (Ben Graham + 224px)"""
    img = cv2.resize(img_array, (224, 224))
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0,0), 10), -4, 128)
    img = preprocess_input(img) # Chuẩn của EfficientNet
    img = np.expand_dims(img, axis=0)
    return img

# --- HÀM LỌC NHIỄU (MỚI) ---
def clean_mask(mask_array, min_size=20):
    """
    Loại bỏ các đốm trắng nhỏ hơn min_size pixel (coi là nhiễu).
    Giữ lại các cụm lớn (tổn thương thật).
    """
    # Mask đầu vào là float [0,1], cần chuyển về uint8 [0,255]
    mask_uint8 = (mask_array * 255).astype(np.uint8)
    
    # Tìm các vùng liên thông (Connected Components)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    
    # Tạo mask sạch
    cleaned_mask = np.zeros_like(mask_uint8)
    
    # Duyệt qua các vùng (bỏ qua label 0 là nền đen)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_size: # Chỉ giữ lại đốm lớn hơn ngưỡng
            cleaned_mask[labels == i] = 255
            
    # Trả về dạng float [0,1] như cũ
    return cleaned_mask.astype(np.float32) / 255.0

# --- HÀM INFERENCE V2 (ĐÃ UPDATE LOGIC CHỐNG NHIỄU) ---
def run_aura_inference(image_bytes):
    # 1. Đọc ảnh
    nparr = np.frombuffer(image_bytes, np.uint8)
    original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
    
    OUT_SIZE = 256
    
    # Preprocess
    input_standard = preprocess_for_segmentation(original_rgb, target_size=OUT_SIZE)
    input_vessels = preprocess_for_vessels_pro(original_rgb)
    input_classifier = preprocess_for_classifier(original_rgb)
    
    findings = {}
    combined_mask = np.zeros((OUT_SIZE, OUT_SIZE, 3))
    
    # --- PHẦN 1: CHẠY SEGMENTATION & LỌC NHIỄU ---
    
    # 1. Mạch máu
    if 'Vessels' in loaded_models:
        pred = loaded_models['Vessels'].predict(input_vessels, verbose=0)[0]
        pred = cv2.resize(pred, (OUT_SIZE, OUT_SIZE))
        mask = (pred > 0.5).astype(np.float32) # Không lọc nhiễu mạch máu vì nó vốn mảnh
        findings['Vessels_Density'] = np.sum(mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask) 

    # 2. Đĩa thị
    if 'OD' in loaded_models:
        pred = loaded_models['OD'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.5).astype(np.float32)
        findings['OD_Area'] = np.sum(mask)
        combined_mask[:,:,2] = np.maximum(combined_mask[:,:,2], mask)

    # 3. Tổn thương Đỏ (HE, MA) - CẦN LỌC NHIỄU KỸ
    if 'HE' in loaded_models:
        pred = loaded_models['HE'].predict(input_standard, verbose=0)[0,:,:,0]
        raw_mask = (pred > 0.5).astype(np.float32)
        mask = clean_mask(raw_mask, min_size=15) # Lọc đốm < 15px
        findings['HE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    if 'MA' in loaded_models:
        pred = loaded_models['MA'].predict(input_standard, verbose=0)[0,:,:,0]
        # MA rất nhỏ, nên ngưỡng mask thấp (0.2) nhưng lọc size phải khéo
        raw_mask = (pred > 0.2).astype(np.float32)
        mask = clean_mask(raw_mask, min_size=5) # Giữ đốm nhỏ nhưng phải rõ nét
        findings['MA_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    # 4. Tổn thương Vàng (EX, SE)
    if 'EX' in loaded_models:
        pred = loaded_models['EX'].predict(input_standard, verbose=0)[0,:,:,0]
        raw_mask = (pred > 0.5).astype(np.float32)
        mask = clean_mask(raw_mask, min_size=20)
        findings['EX_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    if 'SE' in loaded_models:
        pred = loaded_models['SE'].predict(input_standard, verbose=0)[0,:,:,0]
        raw_mask = (pred > 0.3).astype(np.float32)
        mask = clean_mask(raw_mask, min_size=20)
        findings['SE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    # --- PHẦN 2: CHẠY CLASSIFICATION ---
    classifier_result = "Không xác định"
    classifier_confidence = 0.0
    
    if 'CLASSIFIER' in loaded_models:
        preds = loaded_models['CLASSIFIER'].predict(input_classifier, verbose=0)
        class_idx = np.argmax(preds[0])
        classifier_confidence = float(np.max(preds[0]))
        CLASS_MAP = {0: "Bình thường (No DR)", 1: "Nhẹ (Mild)", 2: "Trung bình (Moderate)", 3: "Nặng (Severe)", 4: "Tăng sinh (Proliferative)"}
        classifier_result = CLASS_MAP.get(class_idx, "Không xác định")

    # --- PHẦN 3: LOGIC HỘI CHẨN THÔNG MINH (SMART ENSEMBLE) ---
    
    he_count = findings.get('HE_Count', 0)
    ma_count = findings.get('MA_Count', 0)
    se_count = findings.get('SE_Count', 0)
    ex_count = findings.get('EX_Count', 0)
    vessels_density = findings.get('Vessels_Density', 5000)
    od_area = findings.get('OD_Area', 0)

    # Logic đếm số lượng (Đã nâng ngưỡng an toàn)
    seg_diagnosis = "Bình thường (No DR)"
    dr_score = 0

    if he_count > 800 or se_count > 200: 
        seg_diagnosis = "Nặng (Severe NPDR)"; dr_score = 3
    elif he_count > 80 or ex_count > 150: 
        seg_diagnosis = "Trung bình (Moderate NPDR)"; dr_score = 2
    elif ma_count > 20 or he_count > 20: 
        seg_diagnosis = "Nhẹ (Mild NPDR)"; dr_score = 1
    
    # --- LOGIC QUYẾT ĐỊNH CUỐI CÙNG (QUAN TRỌNG) ---
    final_diagnosis = seg_diagnosis
    warning_note = ""
    
    # 1. Nếu Model cũ cực kỳ tự tin là BÌNH THƯỜNG (>85%)
    if "Bình thường" in classifier_result and classifier_confidence > 0.85:
        # Mà Model mới chỉ thấy "Nhẹ" (do nhiễu hoặc quá nhạy)
        if seg_diagnosis == "Nhẹ (Mild NPDR)":
            # => ÉP VỀ BÌNH THƯỜNG (Coi là nhiễu dương tính giả)
            final_diagnosis = "Bình thường (No DR)"
            dr_score = 0
            warning_note = "\n✅ Đã lọc nhiễu: Các vi tổn thương phát hiện được đánh giá là không đáng kể."
    
    # 2. Ngược lại, nếu Model cũ thấy "Nặng" mà Segmentation không thấy gì
    elif "Nặng" in classifier_result and seg_diagnosis == "Bình thường (No DR)":
        final_diagnosis = f"Nghi ngờ {classifier_result}"
        warning_note = "\n⚠️ CẢNH BÁO: AI tổng quan thấy dấu hiệu bệnh nặng dù tổn thương chưa rõ ràng trên bản đồ."
        dr_score = 3

    # --- TỔNG HỢP BÁO CÁO Y KHOA ---
    risk_report = []
    
    # A. TIỂU ĐƯỜNG
    if dr_score >= 1:
        risk_report.append(f"🩸 TIỂU ĐƯỜNG: Phát hiện biến chứng ({final_diagnosis}).")
        if dr_score >= 3: risk_report.append("   ➜ CẢNH BÁO: Kiểm soát đường huyết kém. Nguy cơ biến chứng thận/thần kinh.")
        elif dr_score == 2: risk_report.append("   ➜ Bệnh đang tiến triển. Cần điều chỉnh lối sống.")
        else: risk_report.append("   ➜ Giai đoạn đầu. Theo dõi định kỳ.")
    else:
        risk_report.append("🩸 TIỂU ĐƯỜNG: Võng mạc khỏe mạnh (Chưa phát hiện bệnh lý).")

    # B. TIM MẠCH
    risk_report.append("\n❤️ TIM MẠCH & HUYẾT ÁP:")
    if vessels_density < 2000: risk_report.append("⚠️ CẢNH BÁO: Mạch máu thưa/hẹp. Nguy cơ Cao huyết áp.")
    elif vessels_density > 15000: risk_report.append("⚠️ CẢNH BÁO: Mạch máu giãn bất thường.")
    else: risk_report.append("✅ Hệ thống mạch máu ổn định.")

    # C. GLOCOM
    if od_area > 4500: risk_report.append("\n👁️ GLOCOM: ⚠️ Kích thước đĩa thị lớn, nghi ngờ lõm gai.")

    # Tạo ảnh Overlay
    img_resized = cv2.resize(original_rgb, (OUT_SIZE, OUT_SIZE)).astype(np.float32) / 255.0
    overlay = img_resized * (1 - combined_mask * 0.4) + combined_mask * 0.5
    overlay = np.clip(overlay * 255, 0, 255).astype(np.uint8)
    overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    
    diagnosis_text = final_diagnosis
    detailed_risk_text = "\n".join(risk_report) + warning_note
    detailed_risk_text += f"\n\n--- THÔNG SỐ KỸ THUẬT ---\n• HE: {int(he_count)} | MA: {int(ma_count)} | EX+SE: {int(ex_count+se_count)}"

    return overlay_bgr, diagnosis_text, detailed_risk_text

# ==============================================================================

# --- TÁC VỤ NGẦM: AI PHÂN TÍCH THỰC TẾ ---
async def real_ai_analysis(record_id: str, image_url: str):
    print(f"🤖 AI AURA đang phân tích hồ sơ: {record_id}...")
    
    if not loaded_models:
        print("⚠️ Không có model nào được tải. Hủy phân tích.")
        return

    try:
        # 1. Tải ảnh từ Cloudinary
        response = requests.get(image_url)
        if response.status_code != 200: raise Exception("Lỗi tải ảnh Cloudinary")
        image_bytes = response.content

        # 2. CHẠY AURA INFERENCE (HYBRID MODE)
        overlay_img, diagnosis_result, detailed_risk = run_aura_inference(image_bytes)
        
        # 3. Upload ảnh kết quả (Overlay) lên Cloudinary
        is_success, buffer = cv2.imencode(".png", overlay_img)
        if not is_success: raise Exception("Lỗi mã hóa ảnh kết quả.")
        annotated_file = io.BytesIO(buffer.tobytes())
        
        upload_result = cloudinary.uploader.upload(
            file=annotated_file, 
            public_id=f"aura_scan_{record_id}", 
            folder="aura_results",
            resource_type="image"
        )
        annotated_url = upload_result.get("secure_url")
        print(f"✅ Ảnh phân tích đã lưu: {annotated_url}")
        
        # 4. Cập nhật DB
        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {
                "$set": {
                    "ai_analysis_status": "COMPLETED",
                    "ai_result": diagnosis_result,
                    "doctor_note": detailed_risk,
                    "annotated_image_url": annotated_url
                }
            }
        )
        print(f"✅ Hồ sơ {record_id} hoàn tất.")
    
    except Exception as e:
        print(f"❌ Lỗi AI: {e}")
        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {"$set": {"ai_analysis_status": "FAILED", "ai_result": "Lỗi phân tích"}}
        )

# --- CÁC HÀM HỖ TRỢ & API AUTH (GIỮ NGUYÊN) ---

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token không hợp lệ hoặc đã hết hạn",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        userName: str = payload.get("sub")
        role: str = payload.get("role")
        if userName is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await users_collection.find_one({"userName": userName})
    if user is None:
        raise credentials_exception
        
    return {
       "userName": user["userName"], 
        "role": user.get("role"),
        "id": str(user["_id"]),
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
        "age": user.get("age", ""),
        "hometown": user.get("hometown", ""),
        "insurance_id": user.get("insurance_id", ""),
        "height": user.get("height", ""),
        "weight": user.get("weight", ""),
        "gender": user.get("gender", ""),
        "nationality": user.get("nationality", ""),
        "assigned_doctor_id": user.get("assigned_doctor_id", None)
    }

# --- MODELS ---
class LoginRequest(BaseModel):
    userName: str
    password: str

class RegisterRequest(BaseModel):
    userName: str
    password: str
    role: str = "USER"

class GoogleLoginRequest(BaseModel):
    token: str

class FacebookLoginRequest(BaseModel):
    accessToken: str
    userID: str

class UserProfileUpdate(BaseModel):
    email: str = None
    phone: str = None
    age: str = None       
    hometown: str = None
    insurance_id: str = None
    height: str = None
    weight: str = None
    gender: str = None
    nationality: str = None

class UpdateUsernameRequest(BaseModel):
    new_username: str
    new_password: str = None # Thêm trường password (optional)

class AssignDoctorRequest(BaseModel):
    patient_id: str
    doctor_id: str

class DoctorNoteRequest(BaseModel):
    doctor_note: str

# --- API ENDPOINTS ---

@app.post("/api/register")
async def register(data: RegisterRequest):
    existing_user = await users_collection.find_one({"userName": data.userName})
    if existing_user:
        raise HTTPException(status_code=400, detail="Tên tài khoản đã được sử dụng")
    
    hashed_password = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt())
    new_user = {
        "userName": data.userName,
        "password": hashed_password.decode('utf-8'),
        "role": data.role
    }

    await users_collection.insert_one(new_user)
    return {"message": "Tạo tài khoản thành công!"}

@app.post("/api/login")
async def login(data: LoginRequest):
    user = await users_collection.find_one({"userName": data.userName})
    if not user:
        raise HTTPException(status_code=400, detail="Tên tài khoản không tồn tại")
    
    try:
        password_input_bytes = data.password.encode('utf-8') 
        password_hash_bytes = user["password"].encode('utf-8')
        is_correct = bcrypt.checkpw(password_input_bytes, password_hash_bytes)
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=500, detail="Lỗi xử lý mật khẩu")

    if not is_correct:
          raise HTTPException(status_code=400, detail="Sai mật khẩu")

    token_data = {"sub": user["userName"], "role": user["role"]}
    access_token = create_access_token(token_data)
    
    return {
        "message": "Đăng nhập thành công",
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "role": user.get("role"),
            "userName": user["userName"]
        }
    }

@app.get("/api/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "message": "Đây là dữ liệu mật",
        "user_info": current_user
    }

# --- API UPLOAD ---
@app.post("/api/upload-eye-image")
async def upload_eye_image(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File không hợp lệ. Vui lòng tải ảnh.")

    try:
        # 1. Upload lên Cloudinary
        upload_result = cloudinary.uploader.upload(file.file, folder="aura_retina")
        image_url = upload_result.get("secure_url")
        
        # 2. Lưu vào DB (Trạng thái Pending)
        record = {
            "user_id": current_user["id"],
            "userName": current_user["userName"],
            "image_url": image_url,
            "upload_date": datetime.utcnow(),
            "ai_analysis_status": "PENDING",
            "ai_result": "Đang phân tích..." 
        }
        
        new_record = await medical_records_collection.insert_one(record)
        new_id = str(new_record.inserted_id)

        # 3. Gửi Task cho AI xử lý ngầm
        background_tasks.add_task(real_ai_analysis, new_id, image_url)

        return {
            "message": "Upload thành công! AI đang phân tích...",
            "url": image_url,
            "record_id": new_id
        }

    except Exception as e:
        print(f"Lỗi Upload: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi upload ảnh lên Cloudinary")

@app.get("/api/medical-records")
async def get_medical_records(current_user: dict = Depends(get_current_user)):
    cursor = medical_records_collection.find({"user_id": current_user["id"]}).sort("upload_date", -1)
    results = []
    async for document in cursor:
        results.append({
            "id": str(document["_id"]),
            "date": document["upload_date"].strftime("%d/%m/%Y"), 
            "time": document["upload_date"].strftime("%H:%M"),     
            "result": document["ai_result"],
            "status": "Hoàn thành" if document["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": document["image_url"]
        })
    return {"history": results}

@app.get("/api/medical-records/{record_id}")
async def get_single_record(record_id: str, current_user: dict = Depends(get_current_user)):
    try:
        query = {"_id": ObjectId(record_id)}
        if current_user["role"] != "DOCTOR":
            query["user_id"] = current_user["id"]

        record = await medical_records_collection.find_one(query)
        
        if not record:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ bệnh án")
            
        return {
            "id": str(record["_id"]),
            "date": record["upload_date"].strftime("%d/%m/%Y"),
            "time": record["upload_date"].strftime("%H:%M"),
            "result": record["ai_result"],
            "status": "Hoàn thành" if record["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": record["image_url"], # Ảnh gốc
            "annotated_image_url": record.get("annotated_image_url"), # Ảnh AURA Scan
            "doctor_note": record.get("doctor_note", "") # Chứa cả ghi chú bác sĩ và chi tiết AI
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=400, detail="ID không hợp lệ")

@app.put("/api/medical-records/{record_id}/note")
async def update_doctor_note(record_id: str, data: DoctorNoteRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Chỉ Bác sĩ mới có quyền thêm ghi chú.")
    try:
        result = await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {"$set": {"doctor_note": data.doctor_note}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ.")
        return {"message": "Đã lưu ghi chú bác sĩ."}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Lỗi server.")

@app.post("/api/admin/assign-doctor")
async def assign_doctor(data: AssignDoctorRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN" and current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Quyền bị từ chối.")
    try:
        doctor = await users_collection.find_one({"_id": ObjectId(data.doctor_id), "role": "DOCTOR"})
        if not doctor: raise HTTPException(status_code=404, detail="ID bác sĩ không tồn tại.")
        
        result = await users_collection.update_one(
            {"_id": ObjectId(data.patient_id)},
            {"$set": {"assigned_doctor_id": data.doctor_id}}
        )
        if result.modified_count == 0: raise HTTPException(status_code=404, detail="Không tìm thấy bệnh nhân.")
        return {"message": "Phân công bác sĩ thành công.", "doctor_name": doctor["userName"]}
    except HTTPException as http_err: raise http_err
    except Exception as e: raise HTTPException(status_code=400, detail="Lỗi server.")

@app.post("/api/google-login")
async def google_login(data: GoogleLoginRequest):
    google_response = requests.get(f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={data.token}")
    if google_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Token Google không hợp lệ")
    google_user = google_response.json()
    email = google_user.get('email')
    name = google_user.get('name', 'Google User')
    if not email: raise HTTPException(status_code=400, detail="Không lấy được email")

    user = await users_collection.find_one({"email": email})
    is_new_user = False
    if not user:
        new_user = {
            "userName": email, "email": email, "password": "", "role": "USER",
            "auth_provider": "google", "full_name": name, "created_at": datetime.utcnow()
        }
        result = await users_collection.insert_one(new_user)
        user = new_user; user["_id"] = result.inserted_id; is_new_user = True
    else:
        if user.get("userName") == email: is_new_user = True
            
    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    access_token = create_access_token(token_data)
    return {"message": "Đăng nhập Google thành công", "access_token": access_token, "token_type": "bearer", "user_info": {"userName": user["userName"], "role": user.get("role", "USER"), "email": user.get("email")}, "is_new_user": is_new_user}

@app.post("/api/facebook-login")
async def facebook_login(data: FacebookLoginRequest):
    # 1. Gọi sang Facebook để lấy thông tin người dùng từ token
    fb_url = f"https://graph.facebook.com/me?fields=id,name,email,picture&access_token={data.accessToken}"
    
    try:
        fb_response = requests.get(fb_url)
        fb_data = fb_response.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Không thể kết nối tới Facebook")

    if "error" in fb_data:
        raise HTTPException(status_code=400, detail="Token Facebook không hợp lệ hoặc đã hết hạn")

    # 2. Lấy thông tin
    email = fb_data.get("email")
    name = fb_data.get("name", "Facebook User")
    fb_id = fb_data.get("id")

    # Lưu ý: Một số acc Facebook đăng ký bằng SĐT sẽ không có email.
    # Ta sẽ dùng userID làm username thay thế nếu không có email.
    if not email:
        email = f"{fb_id}@facebook.com" # Email giả lập để hệ thống không lỗi

    # 3. Tìm hoặc Tạo User trong DB
    user = await users_collection.find_one({"email": email})
    is_new_user = False

    if not user:
        # Nếu chưa có -> Tạo mới
        new_user = {
            "userName": email, 
            "email": email,
            "password": "", # Không cần pass
            "role": "USER",
            "auth_provider": "facebook",
            "full_name": name,
            "created_at": datetime.utcnow(),
            "avatar": fb_data.get("picture", {}).get("data", {}).get("url")
        }
        result = await users_collection.insert_one(new_user)
        user = new_user
        user["_id"] = result.inserted_id
        is_new_user = True
    else:
        # Nếu đã có -> Cập nhật thông tin nếu cần
        if user.get("userName") == email:
            is_new_user = True # Đánh dấu để frontend biết (tùy logic)

    # 4. Tạo Token nội bộ (AURA Token)
    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    access_token = create_access_token(token_data)

    return {
        "message": "Đăng nhập Facebook thành công",
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "userName": user["userName"],
            "role": user.get("role", "USER"),
            "email": user.get("email"),
            "full_name": user.get("full_name")
        },
        "is_new_user": is_new_user
    }

@app.put("/api/users/set-username")
async def set_username(data: UpdateUsernameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_username = data.new_username.strip()
    
    # Validate Username
    if len(new_username) < 3: 
        raise HTTPException(status_code=400, detail="Tên quá ngắn")
    
    # Kiểm tra trùng tên (trừ chính mình ra)
    existing_user = await users_collection.find_one({
        "userName": new_username, 
        "_id": {"$ne": ObjectId(user_id)}
    })
    if existing_user: 
        raise HTTPException(status_code=400, detail="Tên đã tồn tại")

    # Chuẩn bị dữ liệu update
    update_data = {"userName": new_username}

    # Validate & Hash Password (Nếu có gửi lên)
    if data.new_password:
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="Mật khẩu phải từ 6 ký tự trở lên")
        
        # Mã hóa mật khẩu
        hashed_password = bcrypt.hashpw(data.new_password.encode('utf-8'), bcrypt.gensalt())
        update_data["password"] = hashed_password.decode('utf-8')

    # Thực hiện update vào DB
    await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    
    # Tạo token mới với tên mới
    new_token_data = {"sub": new_username, "role": current_user["role"]}
    new_access_token = create_access_token(new_token_data)
    
    return {
        "message": "Cập nhật thành công", 
        "new_access_token": new_access_token, 
        "new_username": new_username
    }

@app.put("/api/users/profile")
async def update_user_profile(data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["id"]
        if data.email:
            existing = await users_collection.find_one({"email": data.email, "_id": {"$ne": ObjectId(user_id)}})
            if existing: raise HTTPException(status_code=400, detail="Email đã dùng")
        if data.phone:
            existing = await users_collection.find_one({"phone": data.phone, "_id": {"$ne": ObjectId(user_id)}})
            if existing: raise HTTPException(status_code=400, detail="SĐT đã dùng")
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
        return {"message": "Cập nhật hồ sơ thành công", "data": update_data}
    except HTTPException as e: raise e
    except Exception as e: raise HTTPException(status_code=500, detail="Lỗi server")

@app.get("/api/doctor/my-patients")
async def get_doctor_assigned_patients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR": raise HTTPException(status_code=403, detail="Quyền bị từ chối.")
    doctor_id = current_user["id"]
    patient_cursor = users_collection.find({"assigned_doctor_id": doctor_id}).sort("userName", 1)
    patients_list = []
    async for patient in patient_cursor:
        patient_id = str(patient["_id"])
        latest_record = await medical_records_collection.find_one({"user_id": patient_id}, sort=[("upload_date", -1)])
        patients_list.append({
            "id": patient_id, "userName": patient["userName"], "email": patient.get("email", "N/A"), "phone": patient.get("phone", "N/A"), "status": patient.get("status", "ACTIVE"),
            "latest_scan": {"record_id": str(latest_record["_id"]) if latest_record else None, "date": latest_record["upload_date"].strftime("%d/%m/%Y") if latest_record else "Chưa có", "result": latest_record["ai_result"] if latest_record else "Chưa có dữ liệu", "ai_status": latest_record["ai_analysis_status"] if latest_record else "NA"}
        })
    return {"patients": patients_list}

@app.get("/api/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN": raise HTTPException(status_code=403, detail="Quyền bị từ chối.")
    user_cursor = users_collection.find() 
    users_list = []
    async for user in user_cursor:
        users_list.append({"id": str(user["_id"]), "userName": user["userName"], "email": user.get("email", ""), "role": user.get("role", "USER"), "status": user.get("status", "ACTIVE"), "assigned_doctor_id": user.get("assigned_doctor_id", None)})
    return {"users": users_list}

@app.get("/api/chats")
async def get_chats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    user_role = current_user["role"]
    chats = []
    if user_role == "DOCTOR":
        patients_cursor = users_collection.find({"assigned_doctor_id": user_id})
        async for patient in patients_cursor:
            chats.append({"id": str(patient["_id"]), "sender": patient["userName"], "preview": "Bác sĩ ơi, tôi đã có kết quả chụp mới...", "time": "Vừa xong", "unread": True, "interlocutor_id": str(patient["_id"])})
    elif user_role == "USER":
        assigned_doc_id = current_user.get("assigned_doctor_id")
        if assigned_doc_id:
            try:
                doctor = await users_collection.find_one({"_id": ObjectId(assigned_doc_id)})
                if doctor: chats.append({"id": str(doctor["_id"]), "sender": f"BS. {doctor['userName']}", "preview": "Chào bạn, hãy thường xuyên cập nhật tình trạng nhé.", "time": "Hôm nay", "unread": True, "interlocutor_id": str(doctor["_id"])})
            except: pass
        chats.append({"id": "system_01", "sender": "Hệ thống AURA", "preview": "Chào mừng bạn! Hãy chụp ảnh đáy mắt để bắt đầu.", "time": "Hôm qua", "unread": False, "interlocutor_id": "system"})
    return {"chats": chats}