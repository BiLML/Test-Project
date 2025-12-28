import os
import io
import requests # type: ignore
from datetime import datetime, timedelta
import uuid
import unicodedata
import asyncio

# --- THIRD PARTY LIBS ---
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List # List cho kiểu dữ liệu Pydantic
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import cloudinary
import cloudinary.uploader
from bson.objectid import ObjectId
from pydantic import BaseModel, EmailStr
import cv2 
import bcrypt

# --- IMPORT MODULES CỦA DỰ ÁN ---
from databases import db, init_db
from ai.inference import run_aura_inference
from models import User, UserProfile, Message 

# Import thư viện gửi mail
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

# Thư viện xuất file ảnh
import csv
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fastapi.responses import StreamingResponse

# --- CẤU HÌNH ---
load_dotenv()
app = FastAPI()
ai_lock = asyncio.Semaphore(2) # CHỐNG NỔ MÁY

# --- CẤU HÌNH GỬI MAIL (Chỉ khai báo 1 lần ở đây) ---
conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD"),
    MAIL_FROM = os.getenv("MAIL_FROM"),
    MAIL_PORT = 587,
    MAIL_SERVER = "smtp.gmail.com",
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True
)

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()

# KẾT NỐI DATABASE
users_collection = db.users
medical_records_collection = db.medical_records
messages_collection = db.messages

# Cấu hình Bảo mật
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    print("⚠️ CẢNH BÁO: Đang dùng SECRET_KEY mặc định!") 
    SECRET_KEY = "secret_mac_dinh_aura_project"
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# Cấu hình Cloudinary
cloudinary.config( 
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
    api_key = os.getenv("CLOUDINARY_API_KEY"), 
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure = True
)

# --- MODELS REQUEST (Pydantic) ---
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
    full_name: str = None

class UpdateUsernameRequest(BaseModel):
    new_username: str
    new_password: str = None 

class AssignDoctorRequest(BaseModel):
    patient_id: str
    doctor_id: str

class DoctorNoteRequest(BaseModel):
    doctor_note: str

class SendMessageRequest(BaseModel):
    receiver_id: str
    content: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr 

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# --- HÀM XỬ LÝ TIẾNG VIỆT ---
def remove_accents(input_str):
    if not input_str: return ""
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)])

# --- HÀM AUTH HELPER ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_password(plain_password, hashed_password):
    # Chuyển cả 2 về bytes để so sánh
    password_byte_enc = plain_password.encode('utf-8')
    hashed_password_byte_enc = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_byte_enc, hashed_password_byte_enc)

def get_password_hash(password):
    # Chuyển password sang bytes, tạo salt và hash
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8') # Trả về chuỗi để lưu vào DB

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token không hợp lệ",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        userName: str = payload.get("sub")
        if userName is None: raise credentials_exception
    except JWTError: raise credentials_exception

    user = await users_collection.find_one({"userName": userName})
    if user is None: raise credentials_exception
    
    user_info = user.copy()
    user_info["id"] = str(user["_id"])
    del user_info["_id"]
    if "password" in user_info: del user_info["password"]
    return user_info

# --- AI LOGIC (Background Task) ---
# HÀM AI WRAPPER MỚI (CHỐNG LAG)
async def real_ai_analysis(record_id: str, image_url: str):
    async with ai_lock: # Xếp hàng chờ nếu server đang bận
        print(f"🤖 AI AURA bắt đầu phân tích: {record_id}")
        try:
            response = requests.get(image_url)
            if response.status_code != 200: raise Exception("Lỗi tải ảnh Cloudinary")
            image_bytes = response.content

            # Chạy AI trong Thread Pool để không chặn API
            loop = asyncio.get_running_loop()
            overlay_img, diagnosis_result, detailed_risk = await loop.run_in_executor(
                None, run_aura_inference, image_bytes
            )
            
            # Encode ảnh kết quả
            is_success, buffer = cv2.imencode(".png", overlay_img)
            annotated_file = io.BytesIO(buffer.tobytes())
            
            # Upload kết quả
            upload_result = await loop.run_in_executor(None, lambda: cloudinary.uploader.upload(
                file=annotated_file, public_id=f"aura_scan_{record_id}", folder="aura_results", resource_type="image"
            ))
            annotated_url = upload_result.get("secure_url")
            
            await medical_records_collection.update_one(
                {"_id": ObjectId(record_id)},
                {"$set": {"ai_analysis_status": "COMPLETED", "ai_result": diagnosis_result, "doctor_note": detailed_risk, "annotated_image_url": annotated_url}}
            )
            print(f"✅ Hồ sơ {record_id} hoàn tất.")
        except Exception as e:
            print(f"❌ Lỗi AI ({record_id}): {e}")
            await medical_records_collection.update_one(
                {"_id": ObjectId(record_id)}, {"$set": {"ai_analysis_status": "FAILED", "ai_result": "Lỗi phân tích"}}
            )
# --- API ENDPOINTS ---

@app.post("/api/register")
async def register(data: RegisterRequest):
    # 1. Check user tồn tại
    existing_user = await users_collection.find_one({"userName": data.userName})
    if existing_user: 
        raise HTTPException(status_code=400, detail="Tên tài khoản đã được sử dụng")
    
    # 2. Hash password bằng Passlib
    hashed_password = get_password_hash(data.password)
    
    # 3. Tạo User Model
    new_user_model = User(
        userName=data.userName,
        email=data.userName if "@" in data.userName else f"{data.userName}@example.com",
        password=hashed_password, 
        role=data.role,
        profile=UserProfile(full_name="New User")
    )
    
    # 4. Lưu DB
    user_dict = new_user_model.model_dump(by_alias=True, exclude={"id"})
    await users_collection.insert_one(user_dict)
    
    return {"message": "Tạo tài khoản thành công!"}

@app.post("/api/login")
async def login(data: LoginRequest):
    user = await users_collection.find_one({"userName": data.userName})
    if not user: 
        raise HTTPException(status_code=400, detail="Tên tài khoản không tồn tại")
    
    if not verify_password(data.password, user["password"]):
         raise HTTPException(status_code=400, detail="Sai mật khẩu")

    token_data = {"sub": user["userName"], "role": user["role"]}
    return {
        "message": "Đăng nhập thành công",
        "access_token": create_access_token(token_data),
        "token_type": "bearer",
        "user_info": {"role": user.get("role"), "userName": user["userName"]}
    }

@app.get("/api/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {"message": "Dữ liệu người dùng", "user_info": current_user}

@app.get("/api/medical-records")
async def get_medical_records(current_user: dict = Depends(get_current_user)):
    cursor = medical_records_collection.find({"user_id": current_user["id"]}).sort("upload_date", -1)
    results = []
    async for doc in cursor:
        results.append({
            "id": str(doc["_id"]),
            "date": doc["upload_date"].strftime("%d/%m/%Y"), 
            "time": doc["upload_date"].strftime("%H:%M"),     
            "result": doc["ai_result"],
            "status": "Hoàn thành" if doc["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": doc["image_url"]
        })
    return {"history": results}

@app.get("/api/medical-records/{record_id}")
async def get_single_record(record_id: str, current_user: dict = Depends(get_current_user)):
    try:
        query = {"_id": ObjectId(record_id)}
        if current_user["role"] != "DOCTOR": 
            query["user_id"] = current_user["id"]
            
        record = await medical_records_collection.find_one(query)
        if not record: raise HTTPException(404, "Không tìm thấy hồ sơ")
            
        return {
            "id": str(record["_id"]),
            "date": record["upload_date"].strftime("%d/%m/%Y"),
            "result": record["ai_result"],
            "status": "Hoàn thành" if record["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": record["image_url"],
            "annotated_image_url": record.get("annotated_image_url"),
            "doctor_note": record.get("doctor_note", "")
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=400, detail="ID không hợp lệ hoặc lỗi server")

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
    fb_url = f"https://graph.facebook.com/me?fields=id,name,email,picture&access_token={data.accessToken}"
    try:
        fb_response = requests.get(fb_url)
        fb_data = fb_response.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Không thể kết nối tới Facebook")

    if "error" in fb_data:
        raise HTTPException(status_code=400, detail="Token Facebook không hợp lệ")

    email = fb_data.get("email")
    name = fb_data.get("name", "Facebook User")
    fb_id = fb_data.get("id")
    if not email: email = f"{fb_id}@facebook.com"

    user = await users_collection.find_one({"email": email})
    is_new_user = False

    if not user:
        new_user = {
            "userName": email, "email": email, "password": "", "role": "USER",
            "auth_provider": "facebook", "full_name": name, "created_at": datetime.utcnow(),
            "avatar": fb_data.get("picture", {}).get("data", {}).get("url")
        }
        result = await users_collection.insert_one(new_user)
        user = new_user; user["_id"] = result.inserted_id; is_new_user = True
    else:
        if user.get("userName") == email: is_new_user = True

    token_data = {"sub": user["userName"], "role": user.get("role", "USER")}
    return {
        "message": "Đăng nhập Facebook thành công",
        "access_token": create_access_token(token_data),
        "token_type": "bearer",
        "user_info": {"userName": user["userName"], "role": user.get("role", "USER"), "email": user.get("email"), "full_name": user.get("full_name")},
        "is_new_user": is_new_user
    }

@app.put("/api/users/set-username")
async def set_username(data: UpdateUsernameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    new_username = data.new_username.strip()
    
    if len(new_username) < 3: 
        raise HTTPException(status_code=400, detail="Tên quá ngắn")
    
    existing_user = await users_collection.find_one({
        "userName": new_username, 
        "_id": {"$ne": ObjectId(user_id)}
    })
    if existing_user: 
        raise HTTPException(status_code=400, detail="Tên đã tồn tại")

    update_data = {"userName": new_username}
    if data.new_password:
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="Mật khẩu phải từ 6 ký tự trở lên")
        update_data["password"] = get_password_hash(data.new_password)

    await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    
    new_token_data = {"sub": new_username, "role": current_user["role"]}
    return {
        "message": "Cập nhật thành công", 
        "new_access_token": create_access_token(new_token_data), 
        "new_username": new_username
    }

@app.put("/api/users/profile")
async def update_user_profile(data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["id"]
        # Validate unique email/phone if needed
        if data.email:
            exist = await users_collection.find_one({"email": data.email, "_id": {"$ne": ObjectId(user_id)}})
            if exist: raise HTTPException(status_code=400, detail="Email đã dùng")
            
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
        return {"message": "Cập nhật hồ sơ thành công", "data": update_data}
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

# --- CHAT APIs ---
@app.post("/api/chat/send")
async def send_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    if data.receiver_id == "system":
         return {"message": "Đã gửi tới hệ thống (Auto reply)"}
    try:
        receiver_oid = ObjectId(data.receiver_id)
        receiver = await users_collection.find_one({"_id": receiver_oid})
        if not receiver: raise HTTPException(status_code=404, detail="Người nhận không tồn tại")

        new_message = {
            "sender_id": current_user["id"],
            "sender_name": current_user["userName"], 
            "receiver_id": data.receiver_id,
            "content": data.content,
            "timestamp": datetime.utcnow(),
            "is_read": False
        }
        await messages_collection.insert_one(new_message)
        return {"message": "Đã gửi tin nhắn"}
    except Exception as e: raise HTTPException(status_code=500, detail="Lỗi server nội bộ")

@app.get("/api/chat/history/{other_user_id}")
async def get_chat_history(other_user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    if other_user_id == "system":
        return {"messages": [{"id": "sys_welcome", "content": "Chào mừng bạn đến với AURA! Hãy chụp ảnh đáy mắt để bắt đầu.", "is_me": False, "time": datetime.now().strftime("%H:%M %d/%m")}]}

    cursor = messages_collection.find({
        "$or": [{"sender_id": user_id, "receiver_id": other_user_id}, {"sender_id": other_user_id, "receiver_id": user_id}]
    }).sort("timestamp", 1)
    
    messages = []
    async for msg in cursor:
        messages.append({
            "id": str(msg["_id"]), "sender_id": msg["sender_id"], "content": msg["content"],
            "time": (msg["timestamp"] + timedelta(hours=7)).strftime("%H:%M %d/%m"),
            "is_me": msg["sender_id"] == user_id
        })
    await messages_collection.update_many({"sender_id": other_user_id, "receiver_id": user_id, "is_read": False}, {"$set": {"is_read": True}})
    return {"messages": messages}

@app.get("/api/chats")
async def get_chats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    role = current_user["role"]
    chats = []

    async def get_chat_info(partner_id, partner_name):
        unread = await messages_collection.count_documents({"sender_id": partner_id, "receiver_id": user_id, "is_read": False})
        last_msg = await messages_collection.find_one({"$or": [{"sender_id": user_id, "receiver_id": partner_id}, {"sender_id": partner_id, "receiver_id": user_id}]}, sort=[("timestamp", -1)])
        preview = last_msg["content"] if last_msg else "Bắt đầu cuộc trò chuyện..."
        time_str = (last_msg["timestamp"] + timedelta(hours=7)).strftime("%H:%M") if last_msg else ""
        return {"id": partner_id, "sender": partner_name, "preview": preview, "time": time_str, "unread": unread > 0, "unread_count": unread}

    if role == "USER":
        assigned_doc_id = current_user.get("assigned_doctor_id")
        if assigned_doc_id:
            try:
                doctor = await users_collection.find_one({"_id": ObjectId(assigned_doc_id)})
                if doctor:
                    name = f"BS. {doctor.get('full_name') or doctor['userName']}"
                    chats.append(await get_chat_info(str(doctor["_id"]), name))
            except Exception: pass
    elif role == "DOCTOR":
        async for p in users_collection.find({"assigned_doctor_id": user_id}):
            name = p.get("full_name") or p.get("userName")
            chats.append(await get_chat_info(str(p["_id"]), name))

    chats.append({"id": "system", "sender": "Hệ thống AURA", "preview": "Thông báo hệ thống", "time": "", "unread": False, "interlocutor_id": "system"})
    return {"chats": chats}

# --- FORGOT PASSWORD APIs (Đã thêm hàm gửi mail) ---

@app.post("/api/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, bt: BackgroundTasks):
    # 1. Tìm user
    user = await users_collection.find_one({"email": request.email})
    if not user:
        raise HTTPException(status_code=404, detail="Email không tồn tại trong hệ thống")

    # 2. Tạo Token
    reset_token = str(uuid.uuid4())
    expiration_time = datetime.utcnow() + timedelta(minutes=15)

    # 3. Lưu vào DB
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"reset_token": reset_token, "reset_token_exp": expiration_time}}
    )

    # 4. Gửi Email
    reset_link = f"http://localhost:5173/reset-password?token={reset_token}"
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4CAF50;">Yêu cầu đặt lại mật khẩu AURA</h2>
        <p>Xin chào <strong>{user.get('userName', 'Bạn')}</strong>,</p>
        <p>Chúng tôi vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Vui lòng nhấp vào nút bên dưới để tạo mật khẩu mới (Link hết hạn sau 15 phút):</p>
        <a href="{reset_link}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Đặt lại mật khẩu ngay</a>
        <p style="margin-top: 20px;">Hoặc copy đường dẫn này: <br>{reset_link}</p>
        <p><i>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</i></p>
    </div>
    """

    message = MessageSchema(
        subject="[AURA] Đặt lại mật khẩu của bạn",
        recipients=[request.email],
        body=html_content,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    bt.add_task(fm.send_message, message)

    return {"message": "Email hướng dẫn đã được gửi. Vui lòng kiểm tra hộp thư."}

@app.post("/api/reset-password")
async def reset_password(request: ResetPasswordRequest):
    # 1. Tìm user bằng token
    user = await users_collection.find_one({"reset_token": request.token})
    if not user:
        raise HTTPException(status_code=400, detail="Token không hợp lệ hoặc đã sử dụng.")

    # 2. Check hạn
    token_exp = user.get("reset_token_exp")
    if token_exp and token_exp < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token đã hết hạn.")

    # 3. Hash pass mới
    hashed_password = get_password_hash(request.new_password)

    # 4. Update DB & Xóa token
    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"password": hashed_password}, 
            "$unset": {"reset_token": "", "reset_token_exp": ""}
        }
    )

    return {"message": "Mật khẩu đã được đặt lại thành công!"}

# --- EXPORT API ---
@app.get("/api/medical-records/{record_id}/export")
async def export_record(
    record_id: str, 
    format: str = "pdf", 
    current_user: dict = Depends(get_current_user)
):
    # 1. Get Record Data
    try:
        record = await medical_records_collection.find_one({"_id": ObjectId(record_id)})
        if not record:
            raise HTTPException(404, "Medical record not found")
        
        # Check permission
        if current_user["role"] != "DOCTOR" and str(record["user_id"]) != current_user["id"]:
             raise HTTPException(403, "Permission denied")
             
        # Get Patient Info
        patient = await users_collection.find_one({"_id": ObjectId(record["user_id"])})
        
        # Lấy tên gốc và chuyển thành không dấu
        raw_name = patient.get("full_name", record.get("userName", "N/A"))
        patient_name = remove_accents(raw_name) # <--- SỬA DÒNG NÀY
        
    except Exception:
        raise HTTPException(400, "Error retrieving data")

    # 2. PROCESS CSV EXPORT
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        
        # English Headers
        writer.writerow(["Record ID", "Patient Name", "Scan Date", "Result", "Doctor Note", "Image Link"])
        # Data Row
        writer.writerow([
            str(record["_id"]),
            patient_name,
            record["upload_date"].strftime("%Y-%m-%d %H:%M:%S"),
            record["ai_result"],
            record.get("doctor_note", "").replace("\n", " "),
            record.get("annotated_image_url", record["image_url"])
        ])
        
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=AURA_Report_{record_id}.csv"}
        )

    # 3. PROCESS PDF EXPORT
    elif format == "pdf":
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        
        # Use Standard Fonts (No need for external .ttf files for English)
        # Note: If patient names have accents (e.g., José, Nguyễn), standard Helvetica might glitch.
        # Ideally still use a Unicode font like Arial if names are non-English.
        font_bold = "Helvetica-Bold"
        font_regular = "Helvetica"
        
        # Header
        p.setFont(font_bold, 20)
        p.drawString(50, height - 50, "AURA - RETINAL ANALYSIS REPORT")
        
        p.setFont(font_regular, 10)
        p.drawString(50, height - 70, f"Report ID: {record_id}")
        p.drawString(50, height - 85, f"Date: {record['upload_date'].strftime('%Y-%m-%d %H:%M')}")
        
        p.line(50, height - 95, width - 50, height - 95)
        
        # Patient Info
        p.setFont(font_bold, 12)
        p.drawString(50, height - 120, "PATIENT INFORMATION:")
        p.setFont(font_regular, 12)
        p.drawString(50, height - 140, f"Name: {patient_name}")
        p.drawString(50, height - 160, f"User ID: {record['user_id']}")
        
        # Diagnosis Result
        p.setFont(font_bold, 12)
        p.drawString(50, height - 200, "DIAGNOSIS RESULT:")
        
        # Color logic based on severity
        result_text = record["ai_result"]
        if "Severe" in result_text or "Proliferative" in result_text:
            p.setFillColorRGB(0.8, 0, 0) # Red
        elif "Moderate" in result_text or "Suspected" in result_text:
            p.setFillColorRGB(1, 0.5, 0) # Orange
        else:
            p.setFillColorRGB(0, 0.5, 0) # Green
            
        p.setFont(font_bold, 14)
        p.drawString(50, height - 225, result_text)
        p.setFillColorRGB(0, 0, 0) # Reset to black
        
        # Doctor Note / Details
        p.setFont(font_bold, 12)
        p.drawString(50, height - 260, "DETAILED ANALYSIS / DOCTOR NOTE:")
        
        p.setFont(font_regular, 10)
        text = p.beginText(50, height - 280)
        note_content = record.get("doctor_note", "No details available.")
        
        # Simple text wrapping
        import textwrap
        lines = textwrap.wrap(note_content, width=90)
        for line in lines[:15]: 
            text.textLine(line)
        p.drawText(text)
        
        # Insert Image
        img_url = record.get("annotated_image_url", record["image_url"])
        if img_url:
            try:
                img_data = requests.get(img_url, timeout=5).content
                img = ImageReader(io.BytesIO(img_data))
                # Draw image at the bottom half
                p.drawImage(img, 100, 100, width=400, height=400, preserveAspectRatio=True, mask='auto')
            except Exception as e:
                p.drawString(50, 200, f"[Cannot load image: {e}]")

        # Footer
        p.setFont("Helvetica-Oblique", 8)
        p.drawString(50, 30, "This report is generated by AURA AI System. Please consult a doctor for final conclusion.")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        return StreamingResponse(
            buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=AURA_Report_{record_id}.pdf"}
        )
    
    else:
        raise HTTPException(400, "Unsupported format")

# API UPLOAD NHIỀU ẢNH
@app.post("/api/upload-eye-image")
async def upload_eye_images(
    bg_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...),  # <--- Hỗ trợ list
    current_user: dict = Depends(get_current_user)
):
    if not files: raise HTTPException(400, "Chưa chọn file")
    
    results = []
    for file in files:
        if not file.content_type.startswith("image/"): continue
        try:
            res = cloudinary.uploader.upload(file.file, folder="aura_retina")
            img_url = res.get("secure_url")
            
            record = {
                "user_id": current_user["id"], "userName": current_user["userName"],
                "image_url": img_url, "upload_date": datetime.utcnow(),
                "ai_analysis_status": "PENDING", "ai_result": "Đang chờ phân tích..." 
            }
            new_rec = await medical_records_collection.insert_one(record)
            
            # Đẩy task vào hàng đợi
            bg_tasks.add_task(real_ai_analysis, str(new_rec.inserted_id), img_url)
            
            results.append({"url": img_url, "record_id": str(new_rec.inserted_id)})
        except Exception as e: print(f"Lỗi upload: {e}")
            
    return {"message": f"Đã nhận {len(results)} ảnh", "data": results}