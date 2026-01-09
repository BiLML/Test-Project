# api/v1/medical_records.py
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from models.users import User
from core.database import get_db
from core.security import get_current_user
from services.medical_service import MedicalService
from schemas.medical_schema import ImageResponse
from models.enums import EyeSide, UserRole

router = APIRouter()

# 1. API UPLOAD & PHÂN TÍCH
@router.post("/analyze", response_model=ImageResponse, status_code=201)
def analyze_retina(
    eye_side: str = Form("left"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh (jpg, png)")

    medical_service = MedicalService(db)
    
    try:
        result = medical_service.upload_and_analyze(
            user_id=current_user.id,
            file=file,
            eye_side=eye_side 
        )
        
        img_data = result["image"]
        analysis_data = result["analysis"]
        
        return {
            "id": img_data.id,
            "uploader_id": img_data.uploader_id,
            "image_url": img_data.image_url,
            "image_type": img_data.image_type,
            "eye_side": img_data.eye_side,
            "created_at": img_data.created_at,
            "analysis_result": analysis_data 
        }
    except Exception as e:
        print(f"Lỗi Upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. API LẤY DANH SÁCH (Của user đang login)
@router.get("/", response_model=List[ImageResponse])
def get_my_records(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    medical_service = MedicalService(db)
    if current_user.role in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
        return medical_service.get_all_records(skip=skip, limit=limit)
    return medical_service.get_records_by_user(user_id=current_user.id, skip=skip, limit=limit)

# --- 3. API LỊCH SỬ PHÒNG KHÁM (QUAN TRỌNG: PHẢI ĐẶT TRƯỚC {record_id}) ---
@router.get("/clinic-history")
def get_clinic_history_records(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    API lấy lịch sử khám cho Dashboard Phòng khám.
    Trả về danh sách hồ sơ của tất cả bệnh nhân thuộc phòng khám/bác sĩ đó.
    """
    medical_service = MedicalService(db)
    
    # Nếu là Clinic Admin hoặc Bác sĩ, cho phép xem hết
    if current_user.role in [UserRole.CLINIC, UserRole.DOCTOR, UserRole.ADMIN]:
        records = medical_service.get_all_records(limit=50) 
    else:
        records = medical_service.get_records_by_user(user_id=current_user.id)

    # Format dữ liệu trả về cho khớp với Frontend ClinicDashboard
    results = []
    for r in records:
        # Xử lý lấy kết quả AI (list hoặc object)
        analysis = None
        if hasattr(r, "analysis_result") and r.analysis_result:
            analysis = r.analysis_result
        elif hasattr(r, "analysis_results") and r.analysis_results:
            analysis = r.analysis_results[0]

        results.append({
            "id": str(r.id),
            "created_at": r.created_at,
            "patient_name": r.uploader.username if r.uploader else "Unknown", 
            "image_url": r.image_url,
            "ai_result": analysis.risk_level if analysis else "Đang phân tích...",
            "ai_analysis_status": "COMPLETED" if analysis else "PENDING"
        })
    
    return results

# 4. API CHI TIẾT (ĐẶT Ở CUỐI CÙNG ĐỂ KHÔNG CHẶN CÁC API KHÁC)
@router.get("/{record_id}")
def get_record_detail(
    record_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    medical_service = MedicalService(db)
    record = medical_service.get_record_by_id(record_id)
    
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
         
    if str(record.uploader_id) != str(current_user.id) and current_user.role not in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
         raise HTTPException(status_code=403, detail="Không có quyền truy cập")

    analysis = None
    if hasattr(record, "analysis_result") and record.analysis_result:
        analysis = record.analysis_result
    elif hasattr(record, "analysis_results") and record.analysis_results:
         analysis = record.analysis_results[0]
    
    return {
        "id": str(record.id),
        "ai_result": analysis.risk_level if analysis else "Đang phân tích...",
        "ai_detailed_report": analysis.ai_detailed_report if analysis else "Chưa có báo cáo chi tiết.",
        "annotated_image_url": analysis.annotated_image_url if analysis else None,
        "image_url": record.image_url,
        "upload_date": record.created_at,
        "ai_analysis_status": "COMPLETED" if analysis else "PENDING",
        "doctor_note": None 
    }