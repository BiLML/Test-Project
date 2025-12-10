# backend/main.py
import requests
import os
import asyncio
import numpy as np # <--- MỚI: Xử lý mảng số
import cv2         # <--- MỚI: Xử lý ảnh (OpenCV)
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

# --- THƯ VIỆN AI ---
from tensorflow.keras.models import load_model # <--- MỚI: Để load model
from tensorflow.keras.applications.efficientnet import preprocess_input # <--- MỚI: Chuẩn hóa ảnh

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
    # Đây là bước quan trọng để model nhận diện đúng các tổn thương nhỏ
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0,0), 10), -4, 128)
    
    # 4. Chuẩn hóa theo chuẩn EfficientNet
    img = preprocess_input(img)
    
    # 5. Thêm chiều batch (Model nhận đầu vào là lô ảnh: 1, 224, 224, 3)
    img_batch = np.expand_dims(img, axis=0)
    
    return img_batch

# --- TÁC VỤ NGẦM: AI PHÂN TÍCH THỰC TẾ ---
async def real_ai_analysis(record_id: str, image_url: str):
    print(f"🤖 AI đang bắt đầu phân tích hồ sơ: {record_id}...")
    
    if model is None:
        print("⚠️ Model chưa được tải. Không thể phân tích.")
        return

    try:
        # 1. Tải ảnh từ Cloudinary về bộ nhớ RAM (không cần lưu ra file)
        response = requests.get(image_url)
        if response.status_code != 200:
            raise Exception("Không thể tải ảnh từ Cloudinary")
        
        image_bytes = response.content

        # 2. Xử lý ảnh (Preprocessing)
        processed_image = preprocess_image_ben_graham(image_bytes)

        # 3. Dự đoán (Inference)
        predictions = model.predict(processed_image)
        
        # 4. Lấy kết quả
        class_idx = np.argmax(predictions[0])       # Lấy vị trí có điểm cao nhất (ví dụ: 3)
        confidence = float(np.max(predictions[0]))  # Lấy điểm tin cậy (ví dụ: 0.95)
        result_text = CLASS_NAMES[class_idx]        # Lấy tên bệnh (ví dụ: Nặng)

        # Logic hiển thị: Nếu độ tin cậy quá thấp (< 50%), báo cần kiểm tra lại
        final_result = f"{result_text} - Độ tin cậy: {confidence*100:.2f}%"
        
        print(f"✅ Kết quả AI: {final_result}")

        # 5. Cập nhật vào MongoDB
        await db.medical_records.update_one(
            {"_id": ObjectId(record_id)},
            {
                "$set": {
                    "ai_analysis_status": "COMPLETED",
                    "ai_result": final_result,
                    "ai_confidence": confidence, # Lưu thêm chỉ số tin cậy để sau này dùng
                    "ai_raw_class": int(class_idx)
                }
            }
        )
    except Exception as e:
        print(f"❌ Lỗi khi AI phân tích: {e}")
        # Cập nhật trạng thái lỗi vào DB để User biết
        await db.medical_records.update_one(
            {"_id": ObjectId(record_id)},
            {
                "$set": {
                    "ai_analysis_status": "FAILED",
                    "ai_result": "Lỗi phân tích. Vui lòng thử lại ảnh khác."
                }
            }
        )

# --- CÁC HÀM HỖ TRỢ (GIỮ NGUYÊN) ---

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
        "id": str(user["_id"])
    }

# --- MODELS (GIỮ NGUYÊN) ---
class LoginRequest(BaseModel):
    userName: str
    password: str

class RegisterRequest(BaseModel):
    userName: str
    password: str
    role: str = "USER"

class GoogleLoginRequest(BaseModel):
    token: str

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
    standardized_role = user.get("role", "USER").lower()
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

@app.get("/api/doctor/patients")
async def read_doctor_patients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập")
    return {"message": "Danh sách bệnh nhân (Chỉ bác sĩ mới thấy)"}

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
        
        new_record = await db.medical_records.insert_one(record)
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
    cursor = db.medical_records.find({"user_id": current_user["id"]}).sort("upload_date", -1)
    
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
        record = await db.medical_records.find_one({
            "_id": ObjectId(record_id),
            "user_id": current_user["id"]
        })
        
        if not record:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ bệnh án")
            
        return {
            "id": str(record["_id"]),
            "date": record["upload_date"].strftime("%d/%m/%Y"),
            "time": record["upload_date"].strftime("%H:%M"),
            "result": record["ai_result"],
            "status": "Hoàn thành" if record["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": record["image_url"],
            "doctor_note": record.get("doctor_note", "Chưa có ghi chú từ bác sĩ.") 
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=400, detail="ID không hợp lệ")
    
@app.post("/api/google-login")
async def google_login(data: GoogleLoginRequest):
    google_response = requests.get(
        f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={data.token}"
    )
    
    if google_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Token Google không hợp lệ hoặc đã hết hạn")
        
    google_user = google_response.json()
    
    email = google_user.get('email')
    name = google_user.get('name', 'Google User')
    
    if not email:
        raise HTTPException(status_code=400, detail="Không lấy được email từ Google")

    user = await users_collection.find_one({"userName": email})
    
    if not user:
        new_user = {
            "userName": email,
            "password": "", 
            "role": "USER",
            "auth_provider": "google",
            "full_name": name
        }
        await users_collection.insert_one(new_user)
        user = new_user 
            
    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    access_token = create_access_token(token_data)
    standardized_role = user.get("role", "USER").lower()
    return {
        "message": "Đăng nhập Google thành công",
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "userName": user["userName"],
            "role": user.get("role", "USER")
        }
    }