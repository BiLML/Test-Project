import os
import shutil
import uuid
import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel # <--- Cần thêm cái này
from datetime import datetime

from core.database import get_db
from core.security import get_current_user
from services.clinic_service import ClinicService
from schemas.clinic_schema import ClinicCreate, ClinicResponse, DashboardResponse, AddUserRequest, AssignRequest
from models.users import User
from models.enums import UserRole

# --- CẤU HÌNH CLOUDINARY ---
cloudinary.config( 
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
  api_key = os.getenv("CLOUDINARY_API_KEY"), 
  api_secret = os.getenv("CLOUDINARY_API_SECRET"),
  secure = True
)
# ---------------------------

router = APIRouter()

# --- 1. USER: ĐĂNG KÝ PHÒNG KHÁM ---
@router.post("/register", response_model=ClinicResponse)
def register_clinic(
    name: str = Form(...),
    address: str = Form(...),
    phone: str = Form(...),
    description: str = Form(None),
    logo: UploadFile = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Cho phép cả USER thường đăng ký (để sau đó Admin duyệt lên CLINIC)
    if current_user.role not in [UserRole.ADMIN, UserRole.DOCTOR, UserRole.CLINIC, UserRole.USER]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền tạo phòng khám")

    # Upload ảnh lên Cloudinary
    image_url_path = None
    if logo:
        try:
            upload_result = cloudinary.uploader.upload(logo.file, folder="clinics")
            image_url_path = upload_result.get("secure_url")
        except Exception as e:
            print(f"Lỗi upload Cloudinary: {e}")
            pass

    clinic_service = ClinicService(db)
    return clinic_service.register_clinic(
        admin_id=current_user.id,
        name=name,
        address=address,
        phone_number=phone,
        image_url=image_url_path,
        description=description
    )

# --- 2. CÁC API GET DATA CHO DASHBOARD ---
@router.get("/dashboard-data", response_model=DashboardResponse)
def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clinic_service = ClinicService(db)
    data = clinic_service.get_clinic_dashboard_data(current_user.id)
    if not data:
        raise HTTPException(status_code=404, detail="Admin chưa có phòng khám nào")
    return data

@router.get("/{clinic_id}", response_model=ClinicResponse)
def get_clinic_detail(clinic_id: str, db: Session = Depends(get_db)):
    clinic_service = ClinicService(db)
    clinic = clinic_service.get_clinic_info(clinic_id)
    if not clinic: raise HTTPException(status_code=404, detail="Không tìm thấy")
    return clinic

@router.get("/", response_model=list[ClinicResponse])
def get_all_clinics(db: Session = Depends(get_db)):
    clinic_service = ClinicService(db)
    return clinic_service.get_all_clinics()

# --- 3. API TÌM KIẾM & QUẢN LÝ NHÂN SỰ ---
@router.get("/doctors/available")
def search_doctors(query: str = Query(""), db: Session = Depends(get_db)):
    sql_query = db.query(User).filter(User.role == UserRole.DOCTOR)
    if query:
        sql_query = sql_query.filter((User.email.ilike(f"%{query}%")) | (User.username.ilike(f"%{query}%")))
    return {"doctors": sql_query.all()}

@router.get("/patients/available")
def search_patients(query: str = Query(""), db: Session = Depends(get_db)):
    sql_query = db.query(User).filter(User.role == UserRole.USER)
    if query:
        sql_query = sql_query.filter((User.email.ilike(f"%{query}%")) | (User.username.ilike(f"%{query}%")))
    return {"patients": sql_query.all()}

@router.post("/add-user")
def add_user_to_my_clinic(req: AddUserRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ClinicService(db)
    try:
        service.add_user_to_clinic(current_user.id, req.user_id)
        return {"message": "Thêm thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/assign-patient")
def assign_patient_route(req: AssignRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ClinicService(db)
    try:
        service.assign_patient(req.patient_id, req.doctor_id)
        return {"message": "Phân công thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# =========================================================================
# --- 4. API DÀNH RIÊNG CHO ADMIN HỆ THỐNG (ĐÃ SỬA KHỚP FRONTEND) ---
# =========================================================================

# Schema nhận dữ liệu status từ Frontend gửi lên
class ClinicStatusUpdate(BaseModel):
    status: str  # 'APPROVED' hoặc 'REJECTED'

# API 1: Lấy danh sách chờ duyệt (Format lại JSON để khớp Frontend)
@router.get("/admin/pending")
def get_pending_clinics_for_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền này")
    
    clinic_service = ClinicService(db)
    clinics = clinic_service.get_pending_clinics()
    
    # --- MAPPING DỮ LIỆU THỦ CÔNG ---
    # Mục đích: Biến đổi dữ liệu từ DB thành cấu trúc { requests: [...] } mà Frontend cần
    results = []
    for c in clinics:
        # Lấy tên chủ sở hữu
        owner_name = c.admin.username if c.admin else "Unknown User"
        
        # Tách mã giấy phép từ mô tả (nếu có format "Mã GP: ...")
        license_number = "N/A"
        if c.description and "Mã GP:" in c.description:
            try:
                # Cắt chuỗi để lấy mã số
                license_number = c.description.split("Mã GP:")[1].split(".")[0].strip()
            except: 
                license_number = "Error Parsing"

        results.append({
            "id": str(c.id),
            "name": c.name,
            "owner_name": owner_name,
            "owner_id": str(c.admin_id),
            "phone": c.phone_number,
            "address": c.address,
            "license_number": license_number,
            # Frontend cần object images { front, back }
            "images": { 
                "front": c.image_url, 
                "back": None 
            },
            "created_at": datetime.now().isoformat()
        })
    
    # Trả về đúng key "requests"
    return {"requests": results}


# API 2: Duyệt hoặc Từ chối (Dùng PUT và nhận body status)
@router.put("/admin/{clinic_id}/status")
def update_clinic_status(
    clinic_id: str,
    body: ClinicStatusUpdate, # Nhận { "status": "APPROVED" }
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền duyệt")
    
    service = ClinicService(db)
    try:
        # Gọi hàm process_clinic_request trong Service (hàm này hỗ trợ cả APPROVED/REJECTED)
        service.process_clinic_request(clinic_id, body.status)
        return {"message": f"Đã cập nhật trạng thái: {body.status}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))