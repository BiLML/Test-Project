# backend/main.py
import requests
import os
import asyncio # <--- MỚI: Để đếm giây
import random  # <--- MỚI: Để random bệnh
from dotenv import load_dotenv

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
# --- THÊM BackgroundTasks VÀO DÒNG DƯỚI ĐÂY ---
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
import cloudinary
import cloudinary.uploader
from bson.objectid import ObjectId # <--- MỚI: Để tìm ID trong MongoDB


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

# --- TÁC VỤ NGẦM: GIẢ LẬP AI ---
async def fake_ai_analysis(record_id: str):
    print(f"🤖 AI đang bắt đầu phân tích hồ sơ: {record_id}...")
    
    # Đợi 4 giây (theo yêu cầu của bạn)
    await asyncio.sleep(4) 
    
    # Random kết quả
    ket_qua_mau = [
        "Bình thường - Không phát hiện bất thường",
        "Nguy cơ thấp - Cần theo dõi thêm",
        "Nguy cơ cao - Võng mạc tiểu đường (DR)",
        "Nguy cơ cao - Thoái hóa điểm vàng (AMD)",
        "Nguy cơ trung bình - Tăng nhãn áp"
    ]
    ai_result = random.choice(ket_qua_mau)
    
    # Cập nhật vào MongoDB
    await db.medical_records.update_one(
        {"_id": ObjectId(record_id)},
        {
            "$set": {
                "ai_analysis_status": "COMPLETED",
                "ai_result": ai_result
            }
        }
    )
    print(f"✅ AI đã phân tích xong hồ sơ {record_id}: {ai_result}")

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

    user = await users_collection.find_one({"userName": userName})
    if user is None:
        raise credentials_exception
        
    return {
        "userName": user["userName"], 
        "role": user.get("role"),
        "id": str(user["_id"])
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

@app.get("/api/doctor/patients")
async def read_doctor_patients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập")
    return {"message": "Danh sách bệnh nhân (Chỉ bác sĩ mới thấy)"}

# --- API UPLOAD ĐÃ CẬP NHẬT BACKGROUND TASKS ---
@app.post("/api/upload-eye-image")
async def upload_eye_image(
    background_tasks: BackgroundTasks, # <--- MỚI: Nhận tác vụ ngầm
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File không hợp lệ. Vui lòng tải ảnh.")

    try:
        # Upload lên Cloudinary
        upload_result = cloudinary.uploader.upload(file.file, folder="aura_retina")
        image_url = upload_result.get("secure_url")
        
        # Lưu vào DB với trạng thái Đang phân tích...
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

        # --- KÍCH HOẠT AI CHẠY NGẦM ---
        background_tasks.add_task(fake_ai_analysis, new_id)

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
    # 1. Tìm tất cả bệnh án của user hiện tại
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
        # Tìm bản ghi theo ID và user_id (để bảo mật)
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
            "doctor_note": record.get("doctor_note", "Chưa có ghi chú từ bác sĩ.") # Dự phòng cho tương lai
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=400, detail="ID không hợp lệ")
    
@app.post("/api/google-login")
async def google_login(data: GoogleLoginRequest):
    # Bước A: Dùng token nhận được từ Frontend để hỏi Google thông tin người dùng
    google_response = requests.get(
        f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={data.token}"
    )
    
    if google_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Token Google không hợp lệ hoặc đã hết hạn")
        
    google_user = google_response.json()
    
    # Lấy thông tin quan trọng
    email = google_user.get('email')
    name = google_user.get('name', 'Google User')
    
    if not email:
        raise HTTPException(status_code=400, detail="Không lấy được email từ Google")

    # Bước B: Kiểm tra xem user này đã có trong Database chưa
    user = await users_collection.find_one({"userName": email})
    
    if not user:
        # Nếu chưa có -> Tự động tạo tài khoản mới
        new_user = {
            "userName": email,
            "password": "", # Không cần mật khẩu vì dùng Google
            "role": "USER",
            "auth_provider": "google",
            "full_name": name
        }
        await users_collection.insert_one(new_user)
        user = new_user # Gán lại để dùng bên dưới
            
    # Bước C: Tạo Token đăng nhập của hệ thống AURA (JWT)
    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    access_token = create_access_token(token_data)
    
    return {
        "message": "Đăng nhập Google thành công",
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "userName": user["userName"],
            "role": user.get("role", "USER")
        }
    }