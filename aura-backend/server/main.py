# aura-backend/main.py
import os
import io
import cv2
import bcrypt
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import cloudinary
import cloudinary.uploader
from bson.objectid import ObjectId

# --- IMPORT MODULES CỦA DỰ ÁN (STRUCTURE MỚI) ---
from databases import db, init_db  # Import DB từ folder databases
from ai.inference import run_aura_inference # Import logic AI từ folder ai
from models import User, UserProfile, Message, Payment # Import Models Pydantic
# ------------------------------------------------


load_dotenv()
app = FastAPI()

@app.on_event("startup")
async def startup_event():
    # Gọi hàm init giống hệt thầy
    await init_db()
# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# KẾT NỐI DATABASE (Lấy từ module databases)
users_collection = db.users
medical_records_collection = db.medical_records
messages_collection = db.messages

# Cấu hình Bảo mật
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Khi chạy local có thể tạm chấp nhận, nhưng cẩn thận
    print("⚠️ CẢNH BÁO: Đang dùng SECRET_KEY không an toàn!") 
    SECRET_KEY = "secret_mac_dinh"
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

# --- CÁC MODEL REQUEST (Pydantic cho API Input) ---
from pydantic import BaseModel
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

# --- HÀM AUTH ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

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
    
    # Trả về full info để tiện dùng
    user_info = user.copy()
    user_info["id"] = str(user["_id"])
    del user_info["_id"] # Xóa _id dạng object để tránh lỗi json
    if "password" in user_info: del user_info["password"]
    return user_info

# --- TÁC VỤ NGẦM: CHẠY AI (Đã gọi hàm từ module ai/inference.py) ---
async def real_ai_analysis(record_id: str, image_url: str):
    print(f"🤖 AI AURA đang phân tích hồ sơ: {record_id}...")
    try:
        # 1. Tải ảnh
        response = requests.get(image_url)
        if response.status_code != 200: raise Exception("Lỗi tải ảnh Cloudinary")
        image_bytes = response.content

        # 2. GỌI MODULE AI MỚI
        overlay_img, diagnosis_result, detailed_risk = run_aura_inference(image_bytes)
        
        # 3. Upload kết quả
        is_success, buffer = cv2.imencode(".png", overlay_img)
        annotated_file = io.BytesIO(buffer.tobytes())
        
        upload_result = cloudinary.uploader.upload(
            file=annotated_file, 
            public_id=f"aura_scan_{record_id}", 
            folder="aura_results",
            resource_type="image"
        )
        annotated_url = upload_result.get("secure_url")
        
        # 4. Update DB
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

# --- CÁC API ENDPOINTS ---

@app.post("/api/register")
async def register(data: RegisterRequest):
    existing_user = await users_collection.find_one({"userName": data.userName})
    if existing_user: raise HTTPException(status_code=400, detail="Tên tài khoản đã được sử dụng")
    
    hashed_password = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt())
    
    # SỬ DỤNG MODEL USER (ORM)
    new_user_model = User(
        username=data.userName,
        email=data.userName if "@" in data.userName else "no_email@example.com",
        password_hash=hashed_password.decode('utf-8'),
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
    
    if not bcrypt.checkpw(data.password.encode('utf-8'), user["password"].encode('utf-8')):
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

@app.post("/api/upload-eye-image")
async def upload_eye_image(bg_tasks: BackgroundTasks, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not file.content_type.startswith("image/"): raise HTTPException(400, "File không hợp lệ")
    try:
        res = cloudinary.uploader.upload(file.file, folder="aura_retina")
        img_url = res.get("secure_url")
        
        record = {
            "user_id": current_user["id"],
            "userName": current_user["userName"],
            "image_url": img_url,
            "upload_date": datetime.utcnow(),
            "ai_analysis_status": "PENDING",
            "ai_result": "Đang phân tích..." 
        }
        new_rec = await medical_records_collection.insert_one(record)
        bg_tasks.add_task(real_ai_analysis, str(new_rec.inserted_id), img_url)
        return {"message": "Upload thành công!", "url": img_url, "record_id": str(new_rec.inserted_id)}
    except Exception as e: raise HTTPException(500, f"Lỗi server: {e}")

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
    try:  # <--- THÊM TRY VÀO ĐÂY
        query = {"_id": ObjectId(record_id)}
        if current_user["role"] != "DOCTOR": 
            query["user_id"] = current_user["id"]
            
        record = await medical_records_collection.find_one(query)
        
        if not record: 
            raise HTTPException(404, "Không tìm thấy hồ sơ")
            
        return {
            "id": str(record["_id"]),
            "date": record["upload_date"].strftime("%d/%m/%Y"),
            "result": record["ai_result"],
            "status": "Hoàn thành" if record["ai_analysis_status"] == "COMPLETED" else "Đang xử lý",
            "image_url": record["image_url"],
            "annotated_image_url": record.get("annotated_image_url"),
            "doctor_note": record.get("doctor_note", "")
        }
    except Exception as e: # <--- BẮT LỖI TẠI ĐÂY
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
    print("📥 [DEBUG] Raw Data nhận được:", data.dict())
    print("📥 [DEBUG] Data sau khi lọc None:", {k: v for k, v in data.dict().items() if v is not None})
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

# --- CÁC API CHAT (CẬP NHẬT MỚI: ĐÃ FIX LỖI OBJECTID) ---

@app.post("/api/chat/send")
async def send_message(data: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    print(f"📩 DEBUG SEND: Từ {current_user['userName']} -> Tới {data.receiver_id} | Nội dung: {data.content}")

    try:
        # 1. Xử lý trường hợp gửi cho Hệ thống (Tránh lỗi 400)
        if data.receiver_id == "system":
             # Trả về thành công giả để Frontend không bị lỗi, nhưng không lưu vào DB
             return {"message": "Đã gửi tới hệ thống (Auto reply)"}
             
        # 2. Kiểm tra ID người nhận có hợp lệ không
        try:
            receiver_oid = ObjectId(data.receiver_id)
        except Exception as e:
            print(f"❌ Lỗi ID không hợp lệ: {data.receiver_id}")
            raise HTTPException(status_code=400, detail=f"ID người nhận không hợp lệ: {data.receiver_id}")

        receiver = await users_collection.find_one({"_id": receiver_oid})
        if not receiver:
            raise HTTPException(status_code=404, detail="Người nhận không tồn tại")

        # 3. Lưu tin nhắn vào DB
        new_message = {
            "sender_id": current_user["id"],
            "sender_name": current_user["userName"], 
            "receiver_id": data.receiver_id,
            "content": data.content,
            "timestamp": datetime.utcnow(),
            "is_read": False
        }
        
        await messages_collection.insert_one(new_message)
        print("✅ Đã lưu tin nhắn vào DB")
        return {"message": "Đã gửi tin nhắn"}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Lỗi Server: {e}")
        raise HTTPException(status_code=500, detail="Lỗi server nội bộ")

@app.get("/api/chat/history/{other_user_id}")
async def get_chat_history(other_user_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Xử lý chat với hệ thống
    if other_user_id == "system":
        return {
            "messages": [
                {
                    "id": "sys_welcome", 
                    "content": "Chào mừng bạn đến với AURA! Hãy chụp ảnh đáy mắt để bắt đầu.", 
                    "is_me": False, 
                    "time": datetime.now().strftime("%H:%M %d/%m")
                }
            ]
        }

    # Lấy tin nhắn 2 chiều (Tôi gửi HỌ hoặc HỌ gửi TÔI)
    cursor = messages_collection.find({
        "$or": [
            {"sender_id": user_id, "receiver_id": other_user_id},
            {"sender_id": other_user_id, "receiver_id": user_id}
        ]
    }).sort("timestamp", 1) # Sắp xếp cũ nhất -> mới nhất
    
    messages = []
    async for msg in cursor:
        messages.append({
            "id": str(msg["_id"]),
            "sender_id": msg["sender_id"],
            "content": msg["content"],
            # Chuyển giờ UTC về giờ địa phương đơn giản (+7)
            "time": (msg["timestamp"] + timedelta(hours=7)).strftime("%H:%M %d/%m"),
            "is_me": msg["sender_id"] == user_id
        })
        
    # Đánh dấu đã đọc các tin nhắn do người kia gửi cho mình
    await messages_collection.update_many(
        {"sender_id": other_user_id, "receiver_id": user_id, "is_read": False},
        {"$set": {"is_read": True}}
    )
        
    return {"messages": messages}

@app.get("/api/chats")
async def get_chats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    role = current_user["role"]
    chats = []

    # Hàm phụ để lấy thông tin chat (tin cuối, số tin chưa đọc)
    async def get_chat_info(partner_id, partner_name):
        unread = await messages_collection.count_documents({
            "sender_id": partner_id, "receiver_id": user_id, "is_read": False
        })
        last_msg = await messages_collection.find_one(
            {"$or": [{"sender_id": user_id, "receiver_id": partner_id}, 
                     {"sender_id": partner_id, "receiver_id": user_id}]},
            sort=[("timestamp", -1)]
        )
        preview = last_msg["content"] if last_msg else "Bắt đầu cuộc trò chuyện..."
        time_str = (last_msg["timestamp"] + timedelta(hours=7)).strftime("%H:%M") if last_msg else ""
        
        return {
            "id": partner_id,
            "sender": partner_name,
            "preview": preview,
            "time": time_str,
            "unread": unread > 0,
            "unread_count": unread
        }


    # 1. Nếu là Bệnh nhân -> Lấy Bác sĩ phụ trách
    if role == "USER":
        assigned_doc_id = current_user.get("assigned_doctor_id")
        if assigned_doc_id:
            try:
                doctor = await users_collection.find_one({"_id": ObjectId(assigned_doc_id)})
                if doctor:
                    # Logic: Kiểm tra xem bác sĩ có field "full_name" không
                    doc_real_name = doctor.get("full_name")
                    
                    if doc_real_name:
                        # Nếu có tên thật (VD: Đỗ Đạt) -> hiển thị "BS. Đỗ Đạt"
                        display_name = f"BS. {doc_real_name}"
                    else:
                        # Nếu chưa cập nhật tên thật -> dùng tạm userName cũ
                        display_name = f"BS. {doctor['userName']}"

                    # Gọi hàm lấy thông tin chat với tên hiển thị mới
                    chat_info = await get_chat_info(str(doctor["_id"]), display_name)
                    
                    # (Tùy chọn) Gửi kèm trường full_name gốc để Frontend dùng nếu cần logic riêng
                    chat_info['full_name'] = doc_real_name if doc_real_name else ""
                    
                    chats.append(chat_info)
                    # -------------------
            except Exception as e: print(f"Lỗi lấy chat user: {e}")

    # 2. Nếu là Bác sĩ -> Lấy danh sách bệnh nhân
    elif role == "DOCTOR":
        patients = users_collection.find({"assigned_doctor_id": user_id})
        async for p in patients:
            display_name = p.get("full_name") or p.get("userName")
            chat_info = await get_chat_info(str(p["_id"]), display_name)
            chat_info["full_name"] = p.get("full_name", "")
            chats.append(chat_info)

    # Chat Hệ thống (Đổi ID thành "system" chuẩn)
    chats.append({
        "id": "system", 
        "sender": "Hệ thống AURA", 
        "preview": "Thông báo hệ thống", 
        "time": "", 
        "unread": False,
        "interlocutor_id": "system"
    })
    
    return {"chats": chats}