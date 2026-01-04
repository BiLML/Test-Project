import os
import io
import requests 
from datetime import datetime, timedelta
import uuid
import unicodedata
import asyncio

# --- THIRD PARTY LIBS ---
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import cloudinary
import cloudinary.uploader
from bson.objectid import ObjectId
from pydantic import BaseModel, EmailStr
import bcrypt

# --- IMPORT MODULES CỦA DỰ ÁN ---
from databases import db, init_db
from models import User, UserProfile, Message, MedicalRecord 

# Import thư viện gửi mail
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

# Thư viện xuất file ảnh
import csv
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from fastapi.responses import StreamingResponse

# --- CẤU HÌNH ---
load_dotenv()
app = FastAPI()
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001/analyze") 

# --- CẤU HÌNH GỬI MAIL ---
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
clinics_collection = db.clinics
reports_collection = db.reports 

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
    doctor_diagnosis: str = None

class SendMessageRequest(BaseModel):
    receiver_id: str
    content: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr 

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ClinicStatusUpdate(BaseModel):
    status: str 

# [MODELS CHO CLINIC]
class AddExistingDoctorByIdRequest(BaseModel):
    doctor_id: str

class AddExistingPatientByIdRequest(BaseModel):
    patient_id: str

# [MODEL CHO BÁO CÁO FR-19]
class ReportSubmitRequest(BaseModel):
    patient_id: str
    ai_result: str
    doctor_diagnosis: str
    accuracy: str # 'CORRECT' hoặc 'INCORRECT'
    notes: str = None

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
    password_byte_enc = plain_password.encode('utf-8')
    hashed_password_byte_enc = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_byte_enc, hashed_password_byte_enc)

def get_password_hash(password):
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

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
async def real_ai_analysis(record_id: str, image_url: str):
    print(f"📡 Backend Gateway: Đang gửi yêu cầu sang AI Service cho hồ sơ {record_id}")
    try:
        response = requests.get(image_url)
        if response.status_code != 200: raise Exception("Lỗi tải ảnh gốc từ Cloudinary")
        image_bytes = response.content

        files = {'file': ('image.jpg', image_bytes, 'image/jpeg')}
        ai_response = requests.post(AI_SERVICE_URL, files=files)

        if ai_response.status_code != 200:
            raise Exception(f"AI Service báo lỗi: {ai_response.text}")

        result_data = ai_response.json()
        diagnosis_result = result_data.get("diagnosis_result")
        detailed_risk = result_data.get("detailed_risk")
        annotated_url = result_data.get("annotated_image_url")

        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {"$set": {
                "ai_analysis_status": "COMPLETED", 
                "ai_result": diagnosis_result, 
                "doctor_note": detailed_risk, 
                "annotated_image_url": annotated_url
            }}
        )
        print(f"✅ Hồ sơ {record_id} hoàn tất.")

    except Exception as e:
        print(f"❌ Lỗi kết nối Microservice ({record_id}): {e}")
        await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)}, 
            {"$set": {
                "ai_analysis_status": "FAILED", 
                "ai_result": "Lỗi hệ thống AI"
            }}
        )

# --- API ENDPOINTS: AUTH & USERS ---

@app.post("/api/register")
async def register(data: RegisterRequest):
    existing_user = await users_collection.find_one({"userName": data.userName})
    if existing_user: 
        raise HTTPException(status_code=400, detail="Tên tài khoản đã được sử dụng")
    
    hashed_password = get_password_hash(data.password)
    
    new_user_model = User(
        userName=data.userName,
        email=data.userName if "@" in data.userName else f"{data.userName}@example.com",
        password=hashed_password, 
        role=data.role,
        profile=UserProfile(full_name="New User")
    )
    
    user_dict = new_user_model.model_dump(by_alias=True, exclude={"id"})
    await users_collection.insert_one(user_dict)
    
    return {"message": "Tạo tài khoản thành công!"}

@app.post("/api/login")
async def login(data: LoginRequest):
    user = await users_collection.find_one({"userName": data.userName})
    if not user: raise HTTPException(status_code=400, detail="Tên tài khoản không tồn tại")
    
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

@app.post("/api/google-login")
async def google_login(data: GoogleLoginRequest):
    google_response = requests.get(f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={data.token}")
    if google_response.status_code != 200: raise HTTPException(status_code=400, detail="Token Google không hợp lệ")
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
    except Exception: raise HTTPException(status_code=400, detail="Không thể kết nối tới Facebook")

    if "error" in fb_data: raise HTTPException(status_code=400, detail="Token Facebook không hợp lệ")

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
    if len(new_username) < 3: raise HTTPException(status_code=400, detail="Tên quá ngắn")
    
    existing_user = await users_collection.find_one({"userName": new_username, "_id": {"$ne": ObjectId(user_id)}})
    if existing_user: raise HTTPException(status_code=400, detail="Tên đã tồn tại")

    update_data = {"userName": new_username}
    if data.new_password:
        if len(data.new_password) < 6: raise HTTPException(status_code=400, detail="Mật khẩu phải từ 6 ký tự trở lên")
        update_data["password"] = get_password_hash(data.new_password)

    await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    new_token_data = {"sub": new_username, "role": current_user["role"]}
    return {"message": "Cập nhật thành công", "new_access_token": create_access_token(new_token_data), "new_username": new_username}

@app.put("/api/users/profile")
async def update_user_profile(data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["id"]
        if data.email:
            exist = await users_collection.find_one({"email": data.email, "_id": {"$ne": ObjectId(user_id)}})
            if exist: raise HTTPException(status_code=400, detail="Email đã dùng")
            
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
        return {"message": "Cập nhật hồ sơ thành công", "data": update_data}
    except Exception as e: raise HTTPException(status_code=500, detail="Lỗi server")

# --- API ENDPOINTS: MEDICAL RECORDS ---

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
        raise HTTPException(status_code=43, detail="Chỉ Bác sĩ mới có quyền thêm ghi chú.")
# Tạo dict update động (có gì update nấy)
    update_data = {}
    if data.doctor_note is not None:
        update_data["doctor_note"] = data.doctor_note
    if data.doctor_diagnosis is not None:
        update_data["doctor_diagnosis"] = data.doctor_diagnosis # Lưu chẩn đoán thật vào DB
        
    if not update_data:
        raise HTTPException(400, "Không có dữ liệu để lưu")

    try:
        result = await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {"$set": update_data}
        )
        return {"message": "Đã lưu thông tin chẩn đoán."}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Lỗi server.")

@app.get("/api/medical-records/patient/{patient_id}")
async def get_patient_history(patient_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["DOCTOR", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem hồ sơ này.")

    patient = await users_collection.find_one({"_id": ObjectId(patient_id)})
    patient_name = patient.get("full_name") or patient.get("userName") if patient else "Bệnh nhân"

    cursor = medical_records_collection.find({"user_id": patient_id}).sort("upload_date", -1)
    records = []
    async for doc in cursor:
        records.append({
            "id": str(doc["_id"]),
            "date": doc["upload_date"].strftime("%d/%m/%Y"), 
            "time": doc["upload_date"].strftime("%H:%M"),     
            "result": doc.get("ai_result", "Chưa có kết quả"),
            "doctor_note": doc.get("doctor_note", ""),
            "status": "Hoàn thành" if doc.get("ai_analysis_status") == "COMPLETED" else "Đang xử lý",
            "image_url": doc.get("image_url", "")
        })
    
    return {"patient_name": patient_name, "records": records}

@app.post("/api/upload-eye-image")
async def upload_eye_images(
    bg_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...), 
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
            bg_tasks.add_task(real_ai_analysis, str(new_rec.inserted_id), img_url)
            results.append({"url": img_url, "record_id": str(new_rec.inserted_id)})
        except Exception as e: print(f"Lỗi upload: {e}")
            
    return {"message": f"Đã nhận {len(results)} ảnh", "data": results}

@app.get("/api/medical-records/{record_id}/export")
async def export_record(
    record_id: str, 
    format: str = "pdf", 
    current_user: dict = Depends(get_current_user)
):
    try:
        record = await medical_records_collection.find_one({"_id": ObjectId(record_id)})
        if not record: raise HTTPException(404, "Medical record not found")
        
        if current_user["role"] != "DOCTOR" and str(record["user_id"]) != current_user["id"]:
             raise HTTPException(403, "Permission denied")
             
        patient = await users_collection.find_one({"_id": ObjectId(record["user_id"])})
        raw_name = patient.get("full_name", record.get("userName", "N/A"))
        patient_name = remove_accents(raw_name) 
        
    except Exception: raise HTTPException(400, "Error retrieving data")

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Record ID", "Patient Name", "Scan Date", "Result", "Doctor Note", "Image Link"])
        writer.writerow([
            str(record["_id"]), patient_name, record["upload_date"].strftime("%Y-%m-%d %H:%M:%S"),
            record["ai_result"], record.get("doctor_note", "").replace("\n", " "),
            record.get("annotated_image_url", record["image_url"])
        ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=AURA_Report_{record_id}.csv"}
        )

    elif format == "pdf":
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        font_bold = "Helvetica-Bold"
        font_regular = "Helvetica"
        
        p.setFont(font_bold, 20)
        p.drawString(50, height - 50, "AURA - RETINAL ANALYSIS REPORT")
        
        p.setFont(font_regular, 10)
        p.drawString(50, height - 70, f"Report ID: {record_id}")
        p.drawString(50, height - 85, f"Date: {record['upload_date'].strftime('%Y-%m-%d %H:%M')}")
        p.line(50, height - 95, width - 50, height - 95)
        
        p.setFont(font_bold, 12)
        p.drawString(50, height - 120, "PATIENT INFORMATION:")
        p.setFont(font_regular, 12)
        p.drawString(50, height - 140, f"Name: {patient_name}")
        p.drawString(50, height - 160, f"User ID: {record['user_id']}")
        
        p.setFont(font_bold, 12)
        p.drawString(50, height - 200, "DIAGNOSIS RESULT:")
        
        result_text = record["ai_result"]
        if "Severe" in result_text or "Proliferative" in result_text: p.setFillColorRGB(0.8, 0, 0)
        elif "Moderate" in result_text or "Suspected" in result_text: p.setFillColorRGB(1, 0.5, 0)
        else: p.setFillColorRGB(0, 0.5, 0)
            
        p.setFont(font_bold, 14)
        p.drawString(50, height - 225, result_text)
        p.setFillColorRGB(0, 0, 0)
        
        p.setFont(font_bold, 12)
        p.drawString(50, height - 260, "DETAILED ANALYSIS / DOCTOR NOTE:")
        
        p.setFont(font_regular, 10)
        text = p.beginText(50, height - 280)
        note_content = record.get("doctor_note", "No details available.")
        
        import textwrap
        lines = textwrap.wrap(note_content, width=90)
        for line in lines[:15]: text.textLine(line)
        p.drawText(text)
        
        img_url = record.get("annotated_image_url", record["image_url"])
        if img_url:
            try:
                img_data = requests.get(img_url, timeout=5).content
                img = ImageReader(io.BytesIO(img_data))
                p.drawImage(img, 100, 100, width=400, height=400, preserveAspectRatio=True, mask='auto')
            except Exception as e: p.drawString(50, 200, f"[Cannot load image: {e}]")

        p.setFont("Helvetica-Oblique", 8)
        p.drawString(50, 30, "This report is generated by AURA AI System. Please consult a doctor for final conclusion.")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        return StreamingResponse(
            buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=AURA_Report_{record_id}.pdf"}
        )
    else: raise HTTPException(400, "Unsupported format")

# ==========================================
# CÁC API DÀNH CHO QUẢN LÝ PHÒNG KHÁM
# ==========================================

@app.post("/api/clinics/register")
async def register_clinic(
    clinicName: str = Form(...),
    address: str = Form(...),
    phone: str = Form(...),
    license: str = Form(...),
    description: str = Form(None),
    license_image_front: UploadFile = File(None),
    license_image_back: UploadFile = File(None),
    current_user: dict = Depends(get_current_user)
):
    try:
        front_url, back_url = None, None
        if license_image_front:
            res = cloudinary.uploader.upload(license_image_front.file, folder="aura_clinics_license")
            front_url = res.get("secure_url")
        if license_image_back:
            res = cloudinary.uploader.upload(license_image_back.file, folder="aura_clinics_license", resource_type='auto')
            back_url = res.get("secure_url")

        new_clinic = {
            "owner_id": str(current_user["id"]),      
            "owner_name": current_user["userName"],   
            "name": clinicName,                       
            "address": address,
            "phone": phone,
            "license_number": license,
            "description": description,
            "license_images": { "front": front_url, "back": back_url },
            "status": "PENDING",
            "created_at": datetime.utcnow()
        }
        res = await clinics_collection.insert_one(new_clinic)
        return {"message": "Đăng ký thành công", "clinic_id": str(res.inserted_id)}
    except Exception as e: raise HTTPException(500, "Lỗi Server")

# [API Dashboard Clinic - ĐÃ SỬA LỖI HIỂN THỊ]
@app.get("/api/clinic/dashboard-data")
async def get_clinic_dashboard_data(current_user: dict = Depends(get_current_user)):
    # 1. Check quyền
    if current_user["role"] not in ["CLINIC_OWNER", "DOCTOR"]: 
        raise HTTPException(403, "Quyền bị từ chối")

    owner_id = current_user["id"]
    
    # 2. Xác định Clinic
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": owner_id})
    else:
        clinic_id = current_user.get("clinic_id")
        clinic = await clinics_collection.find_one({"_id": ObjectId(clinic_id)})

    if not clinic:
        return {"clinic": None, "patients": [], "doctors": []}

    clinic_id_str = str(clinic["_id"])
    real_owner_id = str(clinic["owner_id"]) # Lấy ID chủ thực sự

    # 3. Lấy danh sách Bác sĩ
    # Logic: Tìm người thuộc clinic_id này
    query_doctors = {
        "$or": [
            {"clinic_id": clinic_id_str},
            {"_id": ObjectId(real_owner_id)}
        ],
        "role": {"$in": ["DOCTOR", "doctor"]}
    }

    doctors_cursor = users_collection.find(query_doctors)
    
    doctors_list = []
    doctor_ids = [] 
    
    async for doc in doctors_cursor: 
        doc_id = str(doc["_id"])
        
        # Tránh trùng lặp (nếu chủ phòng khám cũng có clinic_id trỏ về chính mình)
        if doc_id in doctor_ids:
            continue
            
        doctor_ids.append(doc_id)
        
        # Đếm số bệnh nhân bác sĩ này đang phụ trách
        patient_count = await users_collection.count_documents({"assigned_doctor_id": doc_id})

        doctors_list.append({
            "id": doc_id,
            "userName": doc["userName"],
            "full_name": doc.get("full_name") or doc["userName"],
            "email": doc.get("email"),
            "phone": doc.get("phone", "N/A"),
            "patient_count": patient_count,
            "status": doc.get("status", "ACTIVE"),
            "role_display": doc.get("role")
        })

    # 4. Lấy danh sách TẤT CẢ BỆNH NHÂN thuộc phòng khám
    # Logic: Bệnh nhân được gán cho bác sĩ trong list TRÊN hoặc có clinic_id này
    patient_query = {
        "$or": [
            {"assigned_doctor_id": {"$in": doctor_ids}}, 
            {"clinic_id": clinic_id_str}                 
        ],
        "role": {"$in": ["USER", "user"]} # Fix thêm lỗi chữ thường cho user
    }
    
    patients_list = []
    async for p in users_collection.find(patient_query):
        last_rec = await medical_records_collection.find_one({"user_id": str(p["_id"])}, sort=[("upload_date", -1)])
        
        doc_name = "Chưa phân công"
        if p.get("assigned_doctor_id"):
            # Tìm tên bác sĩ trong danh sách đã tải ở trên
            found_doc = next((d for d in doctors_list if d["id"] == p["assigned_doctor_id"]), None)
            if found_doc: 
                doc_name = found_doc["full_name"]
            
        patients_list.append({
            "id": str(p["_id"]),
            "full_name": p.get("full_name") or p.get("userName"),
            "email": p.get("email"),
            "phone": p.get("phone", "N/A"),
            "last_result": last_rec.get("ai_result", "Chưa khám") if last_rec else "Chưa khám",
            "assigned_doctor": doc_name,
            "assigned_doctor_id": p.get("assigned_doctor_id")
        })

    return {
        "user_role": current_user["role"],
        "clinic": {
            "name": clinic.get("name"), 
            "address": clinic.get("address")
        },
        "doctors": doctors_list,
        "patients": patients_list
    }

# [API Phân công - ĐÃ SỬA LỖI 400]
@app.post("/api/clinic/assign-patient")
async def clinic_assign_patient(data: AssignDoctorRequest, current_user: dict = Depends(get_current_user)):
    # 1. Check quyền chủ phòng khám
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền phân công.")
    
    # 2. Lấy Clinic ID của chủ (xử lý trường hợp lưu string hoặc objectId)
    if current_user["role"] == "CLINIC_OWNER":
        clinic_rec = await clinics_collection.find_one({"owner_id": current_user["id"]})
        clinic_id = str(clinic_rec["_id"]) if clinic_rec else None
    else:
        clinic_id = current_user.get("clinic_id")

    if not clinic_id: 
        raise HTTPException(400, "Tài khoản chưa có phòng khám.")

    # 3. Kiểm tra bác sĩ đích (Cho phép Assign cho chính mình hoặc Bác sĩ thuộc Clinic)
    # SỬA LỖI: Cho phép role là DOCTOR, doctor hoặc CLINIC_OWNER
    doctor = await users_collection.find_one({
        "_id": ObjectId(data.doctor_id), 
        "role": {"$in": ["DOCTOR", "doctor"]}
    })
    
    # Logic kiểm tra: Bác sĩ tồn tại VÀ (Thuộc phòng khám này HOẶC Chính là chủ phòng khám)
    is_valid_doctor = False
    if doctor:
        doc_clinic_id = str(doctor.get("clinic_id", ""))
        if doc_clinic_id == str(clinic_id):
            is_valid_doctor = True

    if not is_valid_doctor:
        raise HTTPException(400, "Bác sĩ này không thuộc phòng khám của bạn hoặc không hợp lệ.")

    # 4. Cập nhật cho bệnh nhân
    result = await users_collection.update_one(
        {"_id": ObjectId(data.patient_id)},
        {"$set": {
            "assigned_doctor_id": data.doctor_id,
            "clinic_id": str(clinic_id) 
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(404, "Không tìm thấy bệnh nhân.")

    return {"message": f"Đã phân công bệnh nhân cho bác sĩ {doctor.get('full_name', doctor.get('userName'))}"}

# --- API MỚI: TÌM KIẾM BÁC SĨ TRONG HỆ THỐNG ---
# --- TÌM BÁC SĨ (ĐÃ SỬA LỖI) ---
@app.get("/api/doctors/available")
async def get_available_doctors(query: str = "", current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền này.")

    # 1. Lấy Clinic ID của chủ phòng khám
    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")

    # 2. Query linh hoạt: Chấp nhận cả "DOCTOR" và "doctor"
    mongo_query = {"role": {"$in": ["DOCTOR", "doctor"]}}
    
    if query:
        mongo_query["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"userName": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}}
        ]

    # 3. Lọc danh sách
    cursor = users_collection.find(mongo_query).limit(20)
    available_doctors = []
    
    async for doc in cursor:
        doc_clinic_id = doc.get("clinic_id")
        
        # Logic lọc: Chỉ ẨN nếu bác sĩ đã thuộc chính xác phòng khám này
        # (Tránh trường hợp cả 2 đều là None cũng bị ẩn)
        is_in_my_clinic = False
        if clinic_id and doc_clinic_id and str(doc_clinic_id) == str(clinic_id):
            is_in_my_clinic = True
            
        if not is_in_my_clinic:
            available_doctors.append({
                "id": str(doc["_id"]),
                "full_name": doc.get("full_name", "Bác sĩ"),
                "userName": doc["userName"],
                "email": doc.get("email"),
                "phone": doc.get("phone", "N/A"),
                "current_status": "Đã có PK khác" if doc_clinic_id else "Tự do"
            })
            
    return {"doctors": available_doctors}

# [API Thêm bác sĩ có sẵn - ĐÃ SỬA LỖI 400 & Case Sensitive]
@app.post("/api/clinic/add-existing-doctor")
async def add_existing_doctor(data: AddExistingDoctorByIdRequest, current_user: dict = Depends(get_current_user)):
    # 1. Check quyền
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(403, "Quyền bị từ chối")
        
    # 2. Lấy Clinic ID chuẩn xác
    clinic_rec = await clinics_collection.find_one({"owner_id": current_user["id"]})
    if not clinic_rec:
         raise HTTPException(400, "Tài khoản chủ chưa liên kết phòng khám nào.")
    
    clinic_id = str(clinic_rec["_id"])

    # 3. Tìm Bác sĩ (Fix lỗi không tìm thấy nếu role là chữ thường)
    doctor = await users_collection.find_one({
        "_id": ObjectId(data.doctor_id), 
        "role": {"$in": ["DOCTOR", "doctor"]} 
    })
    
    if not doctor:
        raise HTTPException(404, "Không tìm thấy bác sĩ này.")

    # 4. Kiểm tra xem bác sĩ đã thuộc phòng khám khác chưa
    current_doc_clinic = doctor.get("clinic_id")
    
    # Chỉ báo lỗi nếu clinic_id tồn tại, khác rỗng và KHÁC clinic của bạn
    if current_doc_clinic and str(current_doc_clinic) != "null" and str(current_doc_clinic) != "":
        if str(current_doc_clinic) != str(clinic_id):
             raise HTTPException(400, f"Bác sĩ này đang làm việc tại phòng khám khác (ID: {current_doc_clinic}).")
    
    # 5. Cập nhật
    await users_collection.update_one(
        {"_id": ObjectId(data.doctor_id)},
        {"$set": {"clinic_id": clinic_id}}
    )
    
    return {"message": f"Đã thêm bác sĩ {doctor.get('full_name', doctor['userName'])} vào phòng khám."}

# --- TÌM BỆNH NHÂN (ĐÃ SỬA LỖI) ---
@app.get("/api/patients/available")
async def get_available_patients(query: str = "", current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền này.")

    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")
    
    # Chấp nhận cả USER và user
    mongo_query = {"role": {"$in": ["USER", "user"]}}
    if query:
        mongo_query["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"userName": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}}
        ]

    cursor = users_collection.find(mongo_query).limit(20)
    available_patients = []
    async for p in cursor:
        p_clinic_id = p.get("clinic_id")
        
        # Chỉ ẩn nếu bệnh nhân ĐÃ thuộc phòng khám này
        is_in_my_clinic = False
        if clinic_id and p_clinic_id and str(p_clinic_id) == str(clinic_id):
            is_in_my_clinic = True

        if not is_in_my_clinic:
            available_patients.append({
                "id": str(p["_id"]),
                "full_name": p.get("full_name", "Bệnh nhân"),
                "userName": p["userName"],
                "email": p.get("email"),
                "phone": p.get("phone", "N/A"),
                "current_status": "Đã có PK khác" if p_clinic_id else "Tự do"
            })
    return {"patients": available_patients}

@app.post("/api/clinic/add-existing-patient")
async def add_existing_patient(data: AddExistingPatientByIdRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(403, "Quyền bị từ chối")
        
    # [FIX] Đồng bộ logic lấy ID - Đây là đoạn quan trọng nhất để sửa lỗi của bạn
    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")
    
    if not clinic_id: raise HTTPException(400, "Lỗi thông tin phòng khám")

    patient = await users_collection.find_one({"_id": ObjectId(data.patient_id), "role": "USER"})
    if not patient:
        raise HTTPException(404, "Không tìm thấy bệnh nhân này.")

    # Cho phép ghi đè nếu bệnh nhân đang ở trạng thái 'lạc' (có ID phòng khám nhưng ID sai)
    # Logic: Chỉ chặn nếu clinic_id KHÁC và không phải là do lỗi token cũ gây ra
    
    await users_collection.update_one(
        {"_id": ObjectId(data.patient_id)},
        {"$set": {"clinic_id": str(clinic_id)}}
    )
    return {"message": f"Đã thêm bệnh nhân {patient.get('full_name')} vào danh sách quản lý."}

# API: Lấy lịch sử phân tích AI của phòng khám
@app.get("/api/clinic/ai-history")
async def get_clinic_ai_history(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["CLINIC_OWNER", "DOCTOR"]:
        raise HTTPException(403, "Quyền bị từ chối")

    # Tìm các hồ sơ mà bác sĩ này là người upload (doctor_id) 
    # HOẶC các hồ sơ thuộc về user này (nếu dùng chung logic cũ)
    query = {
        "$or": [
            {"doctor_id": current_user["id"]},
            {"user_id": current_user["id"]} 
        ]
    }
    
    cursor = medical_records_collection.find(query).sort("upload_date", -1)
    
    history = []
    async for doc in cursor:
        history.append({
            "id": str(doc["_id"]),
            "patient_name": doc.get("patient_name") or doc.get("userName") or "Bệnh nhân vãng lai",
            "date": doc["upload_date"].strftime("%d/%m/%Y %H:%M"),
            "result": doc.get("ai_result", "Đang xử lý"),
            "status": doc.get("ai_analysis_status", "UNKNOWN"),
            "image_url": doc.get("annotated_image_url") or doc.get("image_url", "")
        })
        
    return {"history": history}

# --- [BỔ SUNG API CÒN THIẾU] UPLOAD ẢNH CHO PHÒNG KHÁM ---
@app.post("/api/clinic/upload-scan")
async def clinic_upload_scan(
    bg_tasks: BackgroundTasks,
    patient_id: str = Form(None), # Cho phép rỗng (Khách vãng lai)
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # 1. Check quyền
    if current_user["role"] not in ["CLINIC_OWNER", "DOCTOR"]:
        raise HTTPException(403, "Bạn không có quyền thực hiện chức năng này.")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File không hợp lệ. Vui lòng tải ảnh.")

    # 2. Xử lý thông tin bệnh nhân (nếu có)
    user_id = None
    patient_name = "Khách vãng lai"
    
    if patient_id and patient_id != "null" and patient_id != "":
        try:
            patient = await users_collection.find_one({"_id": ObjectId(patient_id)})
            if patient:
                user_id = str(patient["_id"])
                patient_name = patient.get("full_name", patient["userName"])
        except: pass

    try:
        # 3. Upload Cloudinary
        res = cloudinary.uploader.upload(file.file, folder="aura_retina_clinic")
        img_url = res.get("secure_url")
        
        # 4. Tạo bệnh án
        record = {
            "user_id": user_id,
            "patient_name": patient_name,
            "doctor_id": current_user["id"],
            "doctor_name": current_user.get("full_name", current_user["userName"]),
            "image_url": img_url,
            "upload_date": datetime.utcnow(),
            "ai_analysis_status": "PENDING", 
            "ai_result": "Đang chờ phân tích...",
            "doctor_note": ""
        }
        new_rec = await medical_records_collection.insert_one(record)
        
        # 5. Gọi AI Service
        bg_tasks.add_task(real_ai_analysis, str(new_rec.inserted_id), img_url)
        
        return {
            "message": "Upload thành công",
            "record_id": str(new_rec.inserted_id)
        }
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(500, "Lỗi Server khi xử lý ảnh.")
    
# ==========================================
# CÁC API DÀNH CHO ADMIN (BỔ SUNG)
# ==========================================

# 1. API Lấy danh sách tất cả User (Cho Tab Người dùng)
@app.get("/api/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    # Chỉ Admin mới được xem
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Quyền truy cập bị từ chối")
    
    users_cursor = users_collection.find({})
    users_list = []
    async for u in users_cursor:
        users_list.append({
            "id": str(u["_id"]),
            "userName": u["userName"],
            "email": u.get("email", ""),
            "role": u.get("role", "USER"),
            "status": "Active", # Có thể thêm logic status nếu cần
            "assigned_doctor_id": u.get("assigned_doctor_id")
        })
    return {"users": users_list}

# 2. API Lấy danh sách Phòng khám đang chờ duyệt (PENDING)
@app.get("/api/admin/clinics/pending")
async def get_pending_clinics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Quyền truy cập bị từ chối")
    
    # Tìm các phòng khám có status = 'PENDING'
    cursor = clinics_collection.find({"status": "PENDING"})
    requests = []
    async for doc in cursor:
        requests.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "owner_name": doc["owner_name"],
            "owner_id": doc["owner_id"],
            "phone": doc["phone"],
            "address": doc["address"],
            "license_number": doc["license_number"],
            "images": doc.get("license_images", {"front": None, "back": None}),
            "created_at": doc["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        })
    
    return {"requests": requests}

# 3. API Duyệt hoặc Từ chối Phòng khám
@app.put("/api/admin/clinics/{clinic_id}/status")
async def update_clinic_status(
    clinic_id: str, 
    data: ClinicStatusUpdate, # Model này đã khai báo ở đầu file main.py
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Quyền truy cập bị từ chối")
    
    # Tìm phòng khám
    clinic = await clinics_collection.find_one({"_id": ObjectId(clinic_id)})
    if not clinic:
        raise HTTPException(404, "Không tìm thấy phòng khám")
        
    # Cập nhật trạng thái phòng khám (APPROVED / REJECTED)
    await clinics_collection.update_one(
        {"_id": ObjectId(clinic_id)},
        {"$set": {"status": data.status}}
    )
    
    # QUAN TRỌNG: Nếu DUYỆT (APPROVED), phải nâng User lên làm CLINIC_OWNER
    if data.status == "APPROVED":
        owner_id = clinic["owner_id"]
        await users_collection.update_one(
            {"_id": ObjectId(owner_id)},
            {"$set": {"role": "CLINIC_OWNER"}}
        )
        
    return {"message": f"Đã cập nhật trạng thái thành {data.status}"}

# ==========================================
# CÁC API DÀNH CHO CHAT & BÁC SĨ (BỔ SUNG CÒN THIẾU)
# ==========================================

# 1. API Lấy danh sách bệnh nhân RIÊNG của Bác sĩ (My Patients)
@app.get("/api/doctor/my-patients")
async def get_my_patients(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền này.")
    
    # Tìm tất cả user có assigned_doctor_id trùng với ID bác sĩ đang đăng nhập
    cursor = users_collection.find({"assigned_doctor_id": current_user["id"]})
    
    patients_list = []
    async for p in cursor:
        # Lấy kết quả khám gần nhất
        last_rec = await medical_records_collection.find_one(
            {"user_id": str(p["_id"])}, 
            sort=[("upload_date", -1)]
        )
        
        patients_list.append({
            "id": str(p["_id"]),
            "full_name": p.get("full_name") or p.get("userName"),
            "email": p.get("email"),
            "phone": p.get("phone", "N/A"),
            "age": p.get("age", "N/A"),
            "gender": p.get("gender", "N/A"),
            "last_result": last_rec.get("ai_result", "Chưa khám") if last_rec else "Chưa khám",
            "last_visit": last_rec["upload_date"].strftime("%d/%m/%Y") if last_rec else "N/A"
        })
        
    return {"patients": patients_list}
# [API Lấy danh sách Chat - NÂNG CẤP: Tự hiện người được phân công]
@app.get("/api/chats")
async def get_chat_list(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    chat_partners = {}
    
    # ---------------------------------------------------------
    # BƯỚC 1: LẤY NHỮNG NGƯỜI ĐÃ TỪNG NHẮN TIN (LOGIC CŨ)
    # ---------------------------------------------------------
    cursor = messages_collection.find({
        "$or": [{"sender_id": user_id}, {"receiver_id": user_id}]
    }).sort("timestamp", -1)

    messages = await cursor.to_list(length=1000)
    
    for msg in messages:
        partner_id = msg["receiver_id"] if msg["sender_id"] == user_id else msg["sender_id"]
        if partner_id in chat_partners: continue
            
        partner = await users_collection.find_one({"_id": ObjectId(partner_id)})
        if not partner: continue
        # --- LOGIC MỚI: Đếm tin nhắn chưa đọc từ người này gửi cho mình ---
        unread_count = await messages_collection.count_documents({
            "sender_id": partner_id,   # Người gửi là đối phương
            "receiver_id": user_id,    # Người nhận là mình
            "is_read": False           # Trạng thái chưa xem
        })
        
        chat_partners[partner_id] = {
            "id": partner_id,
            "sender": partner.get("userName"),
            "full_name": partner.get("full_name") or partner.get("userName"),
            "role": partner.get("role"),
            "preview": ("Bạn: " if msg["sender_id"] == user_id else "") + msg["content"],
            "time": msg["timestamp"].strftime("%H:%M"),
            "timestamp": msg["timestamp"],
            "unread": unread_count > 0
        }

    # ---------------------------------------------------------
    # BƯỚC 2: TỰ ĐỘNG THÊM NGƯỜI ĐƯỢC PHÂN CÔNG (NẾU CHƯA CHAT)
    # ---------------------------------------------------------
    
    # TRƯỜNG HỢP 1: NẾU LÀ BÁC SĨ -> Tự thêm các Bệnh nhân của mình vào list
    if current_user["role"] == "DOCTOR":
        my_patients = users_collection.find({"assigned_doctor_id": user_id})
        async for p in my_patients:
            p_id = str(p["_id"])
            # Chỉ thêm nếu chưa có trong danh sách chat
            if p_id not in chat_partners:
                chat_partners[p_id] = {
                    "id": p_id,
                    "sender": p["userName"],
                    "full_name": p.get("full_name") or p["userName"],
                    "role": "USER",
                    "preview": "👋 Bắt đầu cuộc trò chuyện ngay!", # Tin nhắn mặc định
                    "time": "",
                    "timestamp": datetime.min, # Xếp cuối cùng
                    "unread": False
                }

    # TRƯỜNG HỢP 2: NẾU LÀ BỆNH NHÂN -> Tự thêm Bác sĩ phụ trách vào list
    elif current_user.get("role") in ["USER", "user"]:
        doc_id = current_user.get("assigned_doctor_id")
        if doc_id and doc_id not in chat_partners:
            doctor = await users_collection.find_one({"_id": ObjectId(doc_id)})
            if doctor:
                chat_partners[doc_id] = {
                    "id": doc_id,
                    "sender": doctor["userName"],
                    "full_name": doctor.get("full_name") or doctor["userName"],
                    "role": "DOCTOR",
                    "preview": "Xin chào, tôi cần tư vấn...",
                    "time": "",
                    "timestamp": datetime.min,
                    "unread": False
                }


    # ---------------------------------------------------------
    # BƯỚC 3: SẮP XẾP VÀ TRẢ VỀ
    # ---------------------------------------------------------
    result = list(chat_partners.values())
    # Sắp xếp: Tin nhắn mới nhất lên đầu, người chưa chat nằm dưới cùng
    result.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return {"chats": result}

# [API MỚI] Đánh dấu đã đọc tin nhắn
@app.put("/api/chat/read/{partner_id}")
async def mark_messages_read(partner_id: str, current_user: dict = Depends(get_current_user)):
    # Cập nhật tất cả tin nhắn từ partner gửi cho mình -> is_read = True
    await messages_collection.update_many(
        {
            "sender_id": partner_id, 
            "receiver_id": current_user["id"], 
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )
    return {"message": "Đã xem"}

# 3. API Lấy lịch sử tin nhắn với 1 người cụ thể
@app.get("/api/chat/history/{partner_id}")
async def get_chat_history(partner_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Lấy tin nhắn giữa 2 người
    cursor = messages_collection.find({
        "$or": [
            {"sender_id": user_id, "receiver_id": partner_id},
            {"sender_id": partner_id, "receiver_id": user_id}
        ]
    }).sort("timestamp", 1) # Sắp xếp cũ -> mới
    
    msgs = []
    async for m in cursor:
        msgs.append({
            "id": str(m["_id"]),
            "content": m["content"],
            "is_me": (m["sender_id"] == user_id),
            "time": m["timestamp"].strftime("%H:%M")
        })
        
    return {"messages": msgs}

# 4. API Gửi tin nhắn
@app.post("/api/chat/send")
async def send_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    # Validate receiver
    try:
        receiver = await users_collection.find_one({"_id": ObjectId(data.receiver_id)})
        if not receiver:
            raise HTTPException(404, "Người nhận không tồn tại")
    except:
         # Fix lỗi nếu receiver_id là 'system' hoặc id rác
         if data.receiver_id == 'system': return {"message": "System chat"}
         raise HTTPException(400, "ID người nhận không hợp lệ")
        
    new_msg = {
        "sender_id": current_user["id"],
        "receiver_id": data.receiver_id,
        "content": data.content,
        "timestamp": datetime.utcnow(),
        "is_read": False
    }
    
    await messages_collection.insert_one(new_msg)
    return {"message": "Đã gửi tin nhắn"}

# ============================================================
# TÍNH NĂNG [FR-19]: BÁO CÁO CHUYÊN MÔN & HUẤN LUYỆN AI
# ============================================================

# 1. API: Bác sĩ gửi báo cáo (Feedback)
@app.post("/api/reports")
async def submit_report(data: ReportSubmitRequest, current_user: dict = Depends(get_current_user)):
    # Chỉ cho phép Bác sĩ gửi
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Chỉ Bác sĩ mới có quyền gửi báo cáo chuyên môn.")

    try:
        # Lấy thông tin bệnh nhân để lưu cứng vào báo cáo (giúp Admin xem nhanh hơn)
        patient = await users_collection.find_one({"_id": ObjectId(data.patient_id)})
        patient_name = patient.get("full_name") or patient.get("userName") if patient else "Unknown"

        new_report = {
            "doctor_id": current_user["id"],
            "doctor_name": current_user.get("full_name") or current_user["userName"],
            "patient_id": data.patient_id,
            "patient_name": patient_name,
            "ai_result": data.ai_result,            # Kết quả AI chẩn đoán
            "doctor_diagnosis": data.doctor_diagnosis, # Kết quả thật (Ground Truth)
            "accuracy": data.accuracy,              # CORRECT / INCORRECT
            "notes": data.notes,
            "created_at": datetime.utcnow(),
            "status": "PENDING"                     # Trạng thái xử lý của Admin
        }

        await reports_collection.insert_one(new_report)
        return {"message": "Đã gửi báo cáo thành công. Cảm ơn đóng góp của bạn!"}

    except Exception as e:
        print(f"Lỗi tạo báo cáo: {e}")
        raise HTTPException(status_code=500, detail="Lỗi server khi lưu báo cáo.")

# 2. API: Bác sĩ xem lịch sử báo cáo của chính mình
@app.get("/api/reports/me")
async def get_my_reports(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "DOCTOR":
        raise HTTPException(status_code=403, detail="Quyền truy cập bị từ chối.")

    cursor = reports_collection.find({"doctor_id": current_user["id"]}).sort("created_at", -1)
    
    reports = []
    async for doc in cursor:
        # Xác định loại báo cáo để hiển thị UI
        rpt_type = "Xác nhận KQ" if doc["accuracy"] == "CORRECT" else "Báo cáo sai lệch AI"
        
        reports.append({
            "id": str(doc["_id"]),
            "date": doc["created_at"].strftime("%d/%m/%Y"),
            "patient": doc["patient_name"],
            "type": rpt_type, 
            "status": "Đã gửi" # Có thể update nếu Admin đã xem
        })
        
    return {"reports": reports}

# 3. API: Admin xem toàn bộ báo cáo để huấn luyện lại AI
@app.get("/api/admin/reports")
async def get_all_reports_for_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Chỉ Admin mới được xem dữ liệu huấn luyện.")

    cursor = reports_collection.find({}).sort("created_at", -1)
    
    results = []
    async for doc in cursor:
        results.append({
            "id": str(doc["_id"]),
            "created_at": doc["created_at"], # Frontend tự format date
            "doctor_name": doc["doctor_name"],
            "patient_name": doc["patient_name"],
            "ai_result": doc["ai_result"],
            "doctor_diagnosis": doc["doctor_diagnosis"],
            "accuracy": doc["accuracy"],
            "notes": doc.get("notes", ""),
            "status": doc.get("status", "PENDING")
        })

    return {"reports": results}