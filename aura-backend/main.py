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
# 🧠 KHỞI TẠO HỆ THỐNG AURA AI (MULTI-MODELS)
# ==============================================================================

# Cấu hình danh sách model (Đảm bảo file .keras nằm cùng thư mục với main.py)
MODEL_PATHS = {
    'EX': 'unet_mega_fusion.keras',      # Xuất tiết cứng (Hard Exudates)
    'HE': 'unet_hemorrhages.keras',      # Xuất huyết (Hemorrhages)
    'SE': 'unet_soft_exudates.keras',    # Xuất tiết mềm (Soft Exudates)
    'MA': 'unet_microaneurysms.keras',   # Vi phình mạch (Microaneurysms)
    'OD': 'unet_optic_disc.keras',       # Đĩa thị (Optic Disc)
    'Vessels': 'unet_vessels_pro.keras'  # Mạch máu Pro (Vessels)
}

loaded_models = {}

print("⏳ ĐANG KHỞI ĐỘNG HỆ THỐNG AURA AI...")
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

# --- HÀM XỬ LÝ ẢNH CHUYÊN SÂU ---

def preprocess_for_segmentation(img_array, target_size=256):
    """Chuẩn hóa ảnh cho các model tổn thương thông thường (EX, HE, SE, MA, OD)"""
    img = cv2.resize(img_array, (target_size, target_size))
    img = img / 255.0  # Chuẩn hóa về [0, 1]
    img = np.expand_dims(img, axis=0) # Thêm chiều batch (1, 256, 256, 3)
    return img

def preprocess_for_vessels_pro(img_array):
    """Xử lý đặc biệt cho Mạch máu (Kênh xanh + CLAHE + 512px)"""
    # 1. Resize về 512 (Model Pro train ở 512)
    img = cv2.resize(img_array, (512, 512))
    
    # 2. Lấy kênh màu Xanh lá (Green Channel)
    green_channel = img[:, :, 1]
    
    # 3. Áp dụng CLAHE để tăng tương phản mạch máu
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced_img = clahe.apply(green_channel)
    
    # 4. Chuẩn hóa
    enhanced_img = enhanced_img / 255.0
    enhanced_img = np.expand_dims(enhanced_img, axis=-1) # (512, 512, 1)
    enhanced_img = np.expand_dims(enhanced_img, axis=0)  # (1, 512, 512, 1)
    
    return enhanced_img

def run_aura_inference(image_bytes):
    """Hàm cốt lõi: Chạy tất cả model và tổng hợp kết quả"""
    
    # 1. Đọc ảnh từ bytes
    nparr = np.frombuffer(image_bytes, np.uint8)
    original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
    
    # Kích thước chuẩn đầu ra để vẽ
    OUT_SIZE = 256
    
    # Preprocess inputs
    input_standard = preprocess_for_segmentation(original_rgb, target_size=OUT_SIZE)
    input_vessels = preprocess_for_vessels_pro(original_rgb) # Input riêng cho Vessels
    
    # Biến lưu kết quả
    findings = {}
    combined_mask = np.zeros((OUT_SIZE, OUT_SIZE, 3)) # RGB Mask
    
    # --- CHẠY TỪNG MODEL ---
    
    # 1. Mạch máu (Màu Xanh Lá)
    if 'Vessels' in loaded_models:
        pred = loaded_models['Vessels'].predict(input_vessels, verbose=0)[0]
        pred = cv2.resize(pred, (OUT_SIZE, OUT_SIZE)) # Resize về 256 để vẽ chung
        mask = (pred > 0.5).astype(np.float32)
        findings['Vessels_Density'] = np.sum(mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask) 

    # 2. Đĩa thị (Màu Xanh Dương)
    if 'OD' in loaded_models:
        pred = loaded_models['OD'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.5).astype(np.float32)
        findings['OD_Area'] = np.sum(mask)
        combined_mask[:,:,2] = np.maximum(combined_mask[:,:,2], mask)

    # 3. Xuất huyết (HE) & Vi phình mạch (MA) -> Màu Đỏ
    if 'HE' in loaded_models:
        pred = loaded_models['HE'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.5).astype(np.float32)
        findings['HE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    if 'MA' in loaded_models:
        pred = loaded_models['MA'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.2).astype(np.float32) # Ngưỡng thấp hơn cho MA
        findings['MA_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    # 4. Xuất tiết (EX, SE) -> Màu Vàng (Đỏ + Xanh lá)
    if 'EX' in loaded_models:
        pred = loaded_models['EX'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.5).astype(np.float32)
        findings['EX_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    if 'SE' in loaded_models:
        pred = loaded_models['SE'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.3).astype(np.float32)
        findings['SE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    # --- TẠO ẢNH OVERLAY (CHỒNG LỚP) ---
    img_resized = cv2.resize(original_rgb, (OUT_SIZE, OUT_SIZE)).astype(np.float32) / 255.0
    # Làm mờ ảnh gốc ở chỗ có tổn thương để màu hiện rõ hơn
    overlay = img_resized * (1 - combined_mask * 0.4) + combined_mask * 0.5
    overlay = np.clip(overlay * 255, 0, 255).astype(np.uint8)
    
    # Chuyển về BGR để lưu bằng OpenCV
    overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    
    # --- LOGIC CHẨN ĐOÁN Y KHOA (RULE-BASED AI) ---
    diagnosis_text = "Bình thường (No DR)"
    risk_text = "Sức khỏe mắt tốt."
    
    he_count = findings.get('HE_Count', 0)
    ma_count = findings.get('MA_Count', 0)
    se_count = findings.get('SE_Count', 0)
    ex_count = findings.get('EX_Count', 0)
    vessels_density = findings.get('Vessels_Density', 5000)

    # Logic phân loại DR
    if he_count > 500 or se_count > 100:
        diagnosis_text = "Nặng (Severe NPDR)"
        risk_text = "Cảnh báo: Phát hiện nhiều tổn thương nghiêm trọng. Cần khám ngay!"
    elif he_count > 50 or ex_count > 100:
        diagnosis_text = "Trung bình (Moderate NPDR)"
        risk_text = "Phát hiện mỡ máu và xuất huyết rải rác."
    elif ma_count > 10:
        diagnosis_text = "Nhẹ (Mild NPDR)"
        risk_text = "Phát hiện vi phình mạch giai đoạn sớm."
    
    # Logic Huyết áp (Dựa trên mật độ mạch máu)
    if vessels_density < 2000: # Mạch máu quá thưa/mảnh
        risk_text += " | ⚠️ Cảnh báo: Mạch máu hẹp (Nguy cơ Cao huyết áp)."

    return overlay_bgr, diagnosis_text, risk_text

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

        # 2. CHẠY AURA INFERENCE (CODE MỚI)
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
                    "ai_result": diagnosis_result, # Ví dụ: "Trung bình (Moderate)"
                    "doctor_note": detailed_risk,  # Lưu chi tiết vào note để user đọc
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

# --- CÁC HÀM HỖ TRỢ & API AUTH (GIỮ NGUYÊN NHƯ CŨ) ---

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

# --- CÁC API KHÁC (USER, DOCTOR, ADMIN, CHAT) GIỮ NGUYÊN ---
# (Bạn giữ nguyên phần code API User Profile, Change Password, Assign Doctor, Chat như file cũ nhé)
# ... [Phần code còn lại y hệt file cũ] ...

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

@app.put("/api/users/set-username")
async def set_username(data: UpdateUsernameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_username = data.new_username.strip()
    if len(new_username) < 3: raise HTTPException(status_code=400, detail="Tên quá ngắn")
    existing_user = await users_collection.find_one({"userName": new_username})
    if existing_user: raise HTTPException(status_code=400, detail="Tên đã tồn tại")
    await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"userName": new_username}})
    new_token_data = {"sub": new_username, "role": current_user["role"]}
    new_access_token = create_access_token(new_token_data)
    return {"message": "Cập nhật thành công", "new_access_token": new_access_token, "new_username": new_username}

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