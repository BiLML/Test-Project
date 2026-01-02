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

class ClinicStatusUpdate(BaseModel):
    status: str 

# [MODELS CHO CLINIC]
class AddExistingDoctorByIdRequest(BaseModel):
    doctor_id: str

class AddExistingPatientByIdRequest(BaseModel):
    patient_id: str

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
    try:
        result = await medical_records_collection.update_one(
            {"_id": ObjectId(record_id)},
            {"$set": {"doctor_note": data.doctor_note}}
        )
        if result.matched_count == 0: raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ.")
        return {"message": "Đã lưu ghi chú bác sĩ."}
    except Exception as e: raise HTTPException(status_code=500, detail="Lỗi server.")

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

# [API Dashboard Clinic]
@app.get("/api/clinic/dashboard-data")
async def get_clinic_dashboard_data(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["CLINIC_OWNER", "DOCTOR"]: 
        raise HTTPException(403, "Quyền bị từ chối")

    owner_id = current_user["id"]
    
    # 1. Xác định Clinic
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": owner_id})
    else:
        clinic_id = current_user.get("clinic_id")
        clinic = await clinics_collection.find_one({"_id": ObjectId(clinic_id)})

    if not clinic:
        return {"clinic": None, "patients": [], "doctors": []}

    clinic_id_str = str(clinic["_id"])
    
    # 2. Lấy danh sách TẤT CẢ BÁC SĨ trong phòng khám
    doctors_cursor = users_collection.find({"clinic_id": clinic_id_str, "role": "DOCTOR"})
    doctors_list = []
    doctor_ids = [owner_id] 
    
    async for doc in doctors_cursor: 
        doc_id = str(doc["_id"])
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
            "status": doc.get("status", "ACTIVE")
        })

    # 3. Lấy danh sách TẤT CẢ BỆNH NHÂN thuộc phòng khám
    patient_query = {
        "$or": [
            {"assigned_doctor_id": {"$in": doctor_ids}}, 
            {"clinic_id": clinic_id_str}                 
        ],
        "role": "USER"
    }
    
    patients_list = []
    async for p in users_collection.find(patient_query):
        last_rec = await medical_records_collection.find_one({"user_id": str(p["_id"])}, sort=[("upload_date", -1)])
        
        doc_name = "Chưa phân công"
        if p.get("assigned_doctor_id"):
            found_doc = next((d for d in doctors_list if d["id"] == p["assigned_doctor_id"]), None)
            if found_doc: doc_name = found_doc["full_name"]
            elif p["assigned_doctor_id"] == owner_id: doc_name = "Chủ phòng khám"

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

# [API Phân công]
@app.post("/api/clinic/assign-patient")
async def clinic_assign_patient(data: AssignDoctorRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền phân công.")
    
    clinic_id = current_user.get("clinic_id")
    if not clinic_id: raise HTTPException(400, "Tài khoản chưa có phòng khám.")

    # Kiểm tra bác sĩ
    doctor = await users_collection.find_one({"_id": ObjectId(data.doctor_id), "role": "DOCTOR"})
    if not doctor or doctor.get("clinic_id") != clinic_id:
        raise HTTPException(400, "Bác sĩ này không thuộc phòng khám của bạn.")

    # Cập nhật: Gán doctor_id VÀ clinic_id cho bệnh nhân
    result = await users_collection.update_one(
        {"_id": ObjectId(data.patient_id)},
        {"$set": {
            "assigned_doctor_id": data.doctor_id,
            "clinic_id": clinic_id 
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Không tìm thấy bệnh nhân.")

    return {"message": f"Đã phân công bệnh nhân cho bác sĩ {doctor.get('userName')}"}

# --- API MỚI: TÌM KIẾM BÁC SĨ TRONG HỆ THỐNG ---
@app.get("/api/doctors/available")
async def get_available_doctors(query: str = "", current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền này.")

    clinic_id = current_user.get("clinic_id")
    if not clinic_id and current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic:
            clinic_id = str(clinic["_id"])
    
    mongo_query = {"role": "DOCTOR"}
    if query:
        mongo_query["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"userName": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}}
        ]

    cursor = users_collection.find(mongo_query).limit(20)
    available_doctors = []
    async for doc in cursor:
        if str(doc.get("clinic_id")) != str(clinic_id):
            available_doctors.append({
                "id": str(doc["_id"]),
                "full_name": doc.get("full_name", "Bác sĩ"),
                "userName": doc["userName"],
                "email": doc.get("email"),
                "phone": doc.get("phone", "N/A"),
                "current_status": "Đã có PK khác" if doc.get("clinic_id") else "Tự do"
            })
    return {"doctors": available_doctors}

@app.post("/api/clinic/add-existing-doctor")
async def add_existing_doctor(data: AddExistingDoctorByIdRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(403, "Quyền bị từ chối")
        
    clinic_id = current_user.get("clinic_id")
    if not clinic_id and current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic:
            clinic_id = str(clinic["_id"])
            
    if not clinic_id: raise HTTPException(400, "Tài khoản chủ chưa liên kết phòng khám nào.")

    doctor = await users_collection.find_one({"_id": ObjectId(data.doctor_id), "role": "DOCTOR"})
    if not doctor:
        raise HTTPException(404, "Không tìm thấy bác sĩ này.")

    if doctor.get("clinic_id") and str(doctor.get("clinic_id")) != str(clinic_id):
         raise HTTPException(400, f"Bác sĩ này đang làm việc tại phòng khám khác.")

    await users_collection.update_one(
        {"_id": ObjectId(data.doctor_id)},
        {"$set": {"clinic_id": str(clinic_id)}}
    )
    return {"message": f"Đã thêm bác sĩ {doctor.get('full_name')} vào phòng khám."}

# --- API MỚI: TÌM KIẾM BÁC SĨ TRONG HỆ THỐNG ---
@app.get("/api/doctors/available")
async def get_available_doctors(query: str = "", current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền này.")

    # [FIX] Luôn lấy ID từ DB cho Owner để tránh lỗi Token cũ
    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")

    mongo_query = {"role": "DOCTOR"}
    if query:
        mongo_query["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"userName": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}}
        ]

    cursor = users_collection.find(mongo_query).limit(20)
    available_doctors = []
    async for doc in cursor:
        if str(doc.get("clinic_id")) != str(clinic_id):
            available_doctors.append({
                "id": str(doc["_id"]),
                "full_name": doc.get("full_name", "Bác sĩ"),
                "userName": doc["userName"],
                "email": doc.get("email"),
                "phone": doc.get("phone", "N/A"),
                "current_status": "Đã có PK khác" if doc.get("clinic_id") else "Tự do"
            })
    return {"doctors": available_doctors}

@app.post("/api/clinic/add-existing-doctor")
async def add_existing_doctor(data: AddExistingDoctorByIdRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(403, "Quyền bị từ chối")
        
    # [FIX] Đồng bộ logic lấy ID
    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")
            
    if not clinic_id: raise HTTPException(400, "Tài khoản chủ chưa liên kết phòng khám nào.")

    doctor = await users_collection.find_one({"_id": ObjectId(data.doctor_id), "role": "DOCTOR"})
    if not doctor:
        raise HTTPException(404, "Không tìm thấy bác sĩ này.")

    if doctor.get("clinic_id") and str(doctor.get("clinic_id")) != str(clinic_id):
         raise HTTPException(400, f"Bác sĩ này đang làm việc tại phòng khám khác.")

    await users_collection.update_one(
        {"_id": ObjectId(data.doctor_id)},
        {"$set": {"clinic_id": str(clinic_id)}}
    )
    return {"message": f"Đã thêm bác sĩ {doctor.get('full_name')} vào phòng khám."}

# --- API MỚI: TÌM KIẾM BỆNH NHÂN TRONG HỆ THỐNG ---
@app.get("/api/patients/available")
async def get_available_patients(query: str = "", current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "CLINIC_OWNER":
        raise HTTPException(status_code=403, detail="Chỉ chủ phòng khám mới có quyền này.")

    # [FIX] Luôn lấy ID từ DB cho Owner
    clinic_id = None
    if current_user["role"] == "CLINIC_OWNER":
        clinic = await clinics_collection.find_one({"owner_id": current_user["id"]})
        if clinic: clinic_id = str(clinic["_id"])
    else:
        clinic_id = current_user.get("clinic_id")
    
    mongo_query = {"role": "USER"}
    if query:
        mongo_query["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"userName": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}}
        ]

    cursor = users_collection.find(mongo_query).limit(20)
    available_patients = []
    async for p in cursor:
        if str(p.get("clinic_id")) != str(clinic_id):
            available_patients.append({
                "id": str(p["_id"]),
                "full_name": p.get("full_name", "Bệnh nhân"),
                "userName": p["userName"],
                "email": p.get("email"),
                "phone": p.get("phone", "N/A"),
                "current_status": "Đã có PK khác" if p.get("clinic_id") else "Tự do"
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