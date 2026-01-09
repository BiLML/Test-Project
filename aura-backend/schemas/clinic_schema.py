from pydantic import BaseModel
from typing import Optional, List, Any
from uuid import UUID
from schemas.user_schema import UserResponse

# --- INPUT ---
class ClinicCreate(BaseModel):
    name: str
    address: str
    phone_number: str 
    description: Optional[str] = None

class ClinicUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None        # <-- THÊM (để admin có thể update status)

# --- OUTPUT ---
class ClinicResponse(BaseModel):
    id: UUID
    admin_id: UUID
    name: str
    address: Optional[str]
    phone_number: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # Để frontend biết trạng thái (APPROVED/PENDING)

    class Config:
        from_attributes = True

# --- SCHEMA MỚI CHO BỆNH NHÂN TRONG DASHBOARD ---
class ClinicPatientResponse(UserResponse):
    # Kế thừa các trường cơ bản của UserResponse (id, email, username...)
    full_name: Optional[str] = None  # Lấy từ profile
    assigned_doctor_id: Optional[UUID] = None
    assigned_doctor: Optional[str] = None # Tên bác sĩ (Frontend cần cái này)
    latest_scan: Optional[Any] = None

class ClinicDoctorResponse(UserResponse):
    full_name: Optional[str] = None  # Lấy từ profile
    patient_count: int = 0
    phone: Optional[str] = None

class DashboardResponse(BaseModel):
    clinic: ClinicResponse
    admin_name: Optional[str] = "Clinic Admin"
    doctors: List[ClinicDoctorResponse]
    patients: List[ClinicPatientResponse] 

class AddUserRequest(BaseModel):
    user_id: UUID

class AssignRequest(BaseModel):
    patient_id: UUID
    doctor_id: UUID