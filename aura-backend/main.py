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

# --- THƯ VIỆN AI ---
from tensorflow.keras.models import load_model 
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

# --- KHỞI TẠO AI MODEL (CHẠY 1 LẦN KHI START SERVER) ---
print("⏳ Đang tải Model AI...")
try:
    # Load model đã train từ file .keras
    model = load_model("aura_retinal_model_final.keras")
    print("✅ Đã tải Model AI thành công!")
except Exception as e:
    print(f"❌ LỖI TẢI MODEL: {e}")
    model = None # Đánh dấu là chưa có model

# Danh sách nhãn bệnh (Phải khớp thứ tự lúc train)
CLASS_NAMES = {
    0: "Bình thường (No DR)",
    1: "Nhẹ (Mild)",
    2: "Trung bình (Moderate)",
    3: "Nặng (Severe)",
    4: "Tăng sinh (Proliferative)"
}

# --- HÀM XỬ LÝ ẢNH (BEN GRAHAM) ---
def preprocess_image_ben_graham(image_bytes):
    # 1. Chuyển bytes thành ảnh OpenCV
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # 2. Resize về 224x224 (Kích thước model yêu cầu)
    img = cv2.resize(img, (224, 224))
    
    # 3. Kỹ thuật Ben Graham (Làm rõ mạch máu)
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0,0), 10), -4, 128)
    
    # 4. Chuẩn hóa theo chuẩn EfficientNet
    img = preprocess_input(img)
    
    # 5. Thêm chiều batch (Model nhận đầu vào là lô ảnh: 1, 224, 224, 3)
    img_batch = np.expand_dims(img, axis=0)
    
    return img_batch

# --- HÀM VẼ CHÚ THÍCH (MÔ PHỎNG DỰA TRÊN KẾT QUẢ PHÂN LOẠI) ---
def generate_annotated_image(image_bytes: bytes, class_name: str) -> bytes:
    """Tạo ra ảnh có chú thích (chủ yếu là khung và text) dựa trên kết quả phân loại."""
    # 1. Đọc ảnh gốc bằng OpenCV
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Không thể đọc bytes hình ảnh bằng OpenCV.")

    # 2. Tạo một bản sao để vẽ lên
    h, w, _ = img.shape
    annotated_img = img.copy()

    # 3. MÔ PHỎNG VẼ CHÚ THÍCH
    
    # Thiết lập màu sắc và text
    text = f"Diagnosis: {class_name}"
    color = (0, 255, 0) # Xanh lá cho bình thường
    if "Nặng" in class_name or "Tăng sinh" in class_name:
        color = (0, 0, 255) # Đỏ cho trường hợp nặng

    # Vẽ hộp text ở góc trên bên trái
    cv2.putText(annotated_img, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2, cv2.LINE_AA)
    
    # MÔ PHỎNG VẼ KHUNG/KHOANH VÙNG
    if "DR" in class_name or "Nhẹ" in class_name or "Trung bình" in class_name:
        cv2.circle(annotated_img, (w - 50, h - 50), 30, color, -1) # Vẽ chấm tròn

    # 4. Mã hóa ảnh đã vẽ thành bytes để upload
    is_success, buffer = cv2.imencode(".png", annotated_img)
    if not is_success:
        raise Exception("Lỗi mã hóa ảnh đã vẽ thành PNG bytes.")
        
    return buffer.tobytes()

# --- TÁC VỤ NGẦM: AI PHÂN TÍCH THỰC TẾ ---
async def real_ai_analysis(record_id: str, image_url: str):
    print(f"🤖 AI đang bắt đầu phân tích hồ sơ: {record_id}...")
    
    if model is None:
        print("⚠️ Model chưa được tải. Không thể phân tích.")
        return

    try:
        # 1. Tải ảnh từ Cloudinary về bộ nhớ RAM (bytes)
        response = requests.get(image_url)
        if response.status_code != 200:
            raise Exception("Không thể tải ảnh từ Cloudinary")
        
        image_bytes = response.content

        # 2. Xử lý ảnh (Preprocessing) & Dự đoán
        processed_image = preprocess_image_ben_graham(image_bytes)
        predictions = model.predict(processed_image)
        
        # 3. Lấy kết quả chẩn đoán
        class_idx = np.argmax(predictions[0]) 
        confidence = float(np.max(predictions[0]))
        result_text = CLASS_NAMES[class_idx]

        final_result = f"{result_text} ({confidence*100:.2f}%)"
        
        # --- BƯỚC MỚI: TẠO ẢNH CÓ CHÚ THÍCH (ANNOTATION) ---
        annotated_image_bytes = generate_annotated_image(image_bytes, result_text)
        
        # 4. Upload ảnh có chú thích lên Cloudinary
        annotated_file_object = io.BytesIO(annotated_image_bytes) 
        
        upload_result = cloudinary.uploader.upload(
            file=annotated_file_object, 
            public_id=f"annotated_{record_id}", 
            folder="aura_annotated",
            resource_type="image"
        )
        annotated_url = upload_result.get("secure_url")
        print(f"✅ Ảnh chú thích đã được lưu: {annotated_url}")
        
        # 5. Cập nhật vào MongoDB (LƯU KẾT QUẢ CHẨN ĐOÁN VÀ URL MỚI)
        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {
                "$set": {
                    "ai_analysis_status": "COMPLETED",
                    "ai_result": final_result,
                    "ai_confidence": confidence, 
                    "ai_raw_class": int(class_idx),
                    "annotated_image_url": annotated_url
                }
            }
        )
        print(f"✅ Hồ sơ {record_id} đã được cập nhật hoàn tất.")
    
    except Exception as e:
        print(f"❌ Lỗi khi AI phân tích: {e}")
        # Cập nhật trạng thái lỗi vào DB
        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {
                "$set": {
                    "ai_analysis_status": "FAILED",
                    "ai_result": "Lỗi phân tích. Vui lòng thử lại ảnh khác."
                }
            }
        )

# --- CÁC HÀM HỖ TRỢ ---

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

    # Tìm user theo userName
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
        "assigned_doctor_id": user.get("assigned_doctor_id", None) # TRẢ VỀ ID BÁC SĨ ĐÃ ĐƯỢC GÁN
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

# --- API UPLOAD (GỌI AI THẬT) ---
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

        # 3. Gửi Task cho AI thật xử lý ngầm (Truyền ID và URL ảnh)
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
        # Bác sĩ có thể xem bất kỳ hồ sơ nào, User chỉ xem của mình
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
            "annotated_image_url": record.get("annotated_image_url"), # Ảnh chú thích
            "doctor_note": record.get("doctor_note", "") 
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=400, detail="ID không hợp lệ")

# --- API LƯU GHI CHÚ BÁC SĨ ---
@app.put("/api/medical-records/{record_id}/note")
async def update_doctor_note(record_id: str, data: DoctorNoteRequest, current_user: dict = Depends(get_current_user)):
    # Chỉ Doctor mới được sửa
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
        print(f"Lỗi lưu note: {e}")
        raise HTTPException(status_code=500, detail="Lỗi server.")

# --- API PHÂN CÔNG BÁC SĨ ---
@app.post("/api/admin/assign-doctor")
async def assign_doctor(data: AssignDoctorRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN" and current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Bạn không có quyền phân công bác sĩ.")

    try:
        doctor = await users_collection.find_one({"_id": ObjectId(data.doctor_id), "role": "DOCTOR"})
        if not doctor:
            raise HTTPException(status_code=404, detail="ID bác sĩ không tồn tại.")
        
        result = await users_collection.update_one(
            {"_id": ObjectId(data.patient_id)},
            {"$set": {"assigned_doctor_id": data.doctor_id}}
        )

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy bệnh nhân.")

        return {"message": "Phân công bác sĩ thành công.", "doctor_name": doctor["userName"]}

    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        print(f"Lỗi phân công: {e}")
        raise HTTPException(status_code=400, detail="Lỗi server.")

# --- API GOOGLE LOGIN ---
@app.post("/api/google-login")
async def google_login(data: GoogleLoginRequest):
    google_response = requests.get(f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={data.token}")
    if google_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Token Google không hợp lệ")
        
    google_user = google_response.json()
    email = google_user.get('email')
    name = google_user.get('name', 'Google User')
    
    if not email:
        raise HTTPException(status_code=400, detail="Không lấy được email")

    user = await users_collection.find_one({"email": email})
    is_new_user = False
    
    if not user:
        new_user = {
            "userName": email, 
            "email": email,
            "password": "", 
            "role": "USER",
            "auth_provider": "google",
            "full_name": name,
            "created_at": datetime.utcnow()
        }
        result = await users_collection.insert_one(new_user)
        user = new_user 
        user["_id"] = result.inserted_id
        is_new_user = True
    else:
        if user.get("userName") == email:
            is_new_user = True
            
    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    access_token = create_access_token(token_data)
    
    return {
        "message": "Đăng nhập Google thành công",
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "userName": user["userName"],
            "role": user.get("role", "USER"),
            "email": user.get("email")
        },
        "is_new_user": is_new_user
    }

# --- API ĐỔI TÊN ---
@app.put("/api/users/set-username")
async def set_username(data: UpdateUsernameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_username = data.new_username.strip()
    
    if len(new_username) < 3:
        raise HTTPException(status_code=400, detail="Tên quá ngắn")
    
    existing_user = await users_collection.find_one({"userName": new_username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Tên đã tồn tại")

    await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"userName": new_username}})
    
    new_token_data = {"sub": new_username, "role": current_user["role"]}
    new_access_token = create_access_token(new_token_data)

    return {"message": "Cập nhật thành công", "new_access_token": new_access_token, "new_username": new_username}

# --- API PROFILE ---
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
    except Exception as e:
        print(f"Lỗi update profile: {e}")
        raise HTTPException(status_code=500, detail="Lỗi server")

# --- API DOCTOR: MY PATIENTS ---
@app.get("/api/doctor/my-patients")
async def get_doctor_assigned_patients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Quyền bị từ chối.")

    doctor_id = current_user["id"]
    patient_cursor = users_collection.find({"assigned_doctor_id": doctor_id}).sort("userName", 1)
    
    patients_list = []
    async for patient in patient_cursor:
        patient_id = str(patient["_id"])
        latest_record = await medical_records_collection.find_one({"user_id": patient_id}, sort=[("upload_date", -1)])
        
        patients_list.append({
            "id": patient_id,
            "userName": patient["userName"],
            "email": patient.get("email", "N/A"),
            "phone": patient.get("phone", "N/A"),
            "status": patient.get("status", "ACTIVE"),
            "latest_scan": {
                "record_id": str(latest_record["_id"]) if latest_record else None,
                "date": latest_record["upload_date"].strftime("%d/%m/%Y") if latest_record else "Chưa có",
                "result": latest_record["ai_result"] if latest_record else "Chưa có dữ liệu",
                "ai_status": latest_record["ai_analysis_status"] if latest_record else "NA"
            }
        })
        
    return {"patients": patients_list}

# --- API ADMIN: ALL USERS ---
@app.get("/api/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Quyền bị từ chối.")
    
    user_cursor = users_collection.find() 
    users_list = []
    
    async for user in user_cursor:
        users_list.append({
            "id": str(user["_id"]),
            "userName": user["userName"],
            "email": user.get("email", ""),
            "role": user.get("role", "USER"),
            "status": user.get("status", "ACTIVE"),
            "assigned_doctor_id": user.get("assigned_doctor_id", None)
        })
        
    return {"users": users_list}

# --- API CHATS (ĐÃ SỬA: QUERY DB THẬT) ---
@app.get("/api/chats")
async def get_chats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    user_role = current_user["role"]
    chats = []

    # CASE 1: BÁC SĨ (Tìm bệnh nhân được gán cho mình)
    if user_role == "DOCTOR":
        patients_cursor = users_collection.find({"assigned_doctor_id": user_id})
        async for patient in patients_cursor:
            chats.append({
                "id": str(patient["_id"]),
                "sender": patient["userName"],
                "preview": "Bác sĩ ơi, tôi đã có kết quả chụp mới...",
                "time": "Vừa xong",
                "unread": True,
                "interlocutor_id": str(patient["_id"])
            })

    # CASE 2: BỆNH NHÂN (Tìm bác sĩ phụ trách mình)
    elif user_role == "USER":
        assigned_doc_id = current_user.get("assigned_doctor_id")
        if assigned_doc_id:
            try:
                doctor = await users_collection.find_one({"_id": ObjectId(assigned_doc_id)})
                if doctor:
                    chats.append({
                        "id": str(doctor["_id"]),
                        "sender": f"BS. {doctor['userName']}",
                        "preview": "Chào bạn, hãy thường xuyên cập nhật tình trạng nhé.",
                        "time": "Hôm nay",
                        "unread": True,
                        "interlocutor_id": str(doctor["_id"])
                    })
            except:
                pass
        
        # Tin nhắn hệ thống mặc định
        chats.append({
            "id": "system_01",
            "sender": "Hệ thống AURA",
            "preview": "Chào mừng bạn! Hãy chụp ảnh đáy mắt để bắt đầu.",
            "time": "Hôm qua",
            "unread": False,
            "interlocutor_id": "system"
        })

    return {"chats": chats}