from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any

from core.database import get_db
from core.security import get_current_active_user
from models.users import User
from models.enums import UserRole
from services.doctor_service import DoctorService
from schemas.doctor_schema import MyPatientsResponse

router = APIRouter()

@router.get("/my-patients", response_model=MyPatientsResponse)
def get_my_assigned_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Lấy danh sách bệnh nhân của bác sĩ đang đăng nhập.
    """
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền truy cập")
        
    service = DoctorService(db)
    return service.get_my_patients(current_user.id)