from pydantic import BaseModel, EmailStr
from typing import Any, Optional
from uuid import UUID
from datetime import datetime
from models.enums import UserRole, UserStatus

# --- Base & Profile Schemas ---
class ProfileBase(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

class ProfileResponse(ProfileBase):
    medical_info: Optional[Any] = None  # Lưu tiền sử bệnh, dị ứng...
    class Config:
        from_attributes = True

# --- INPUT Schemas (Frontend gửi lên) ---
class UserCreate(BaseModel):
    username: str   # Bắt buộc
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole = UserRole.USER

class UserLogin(BaseModel):
    username_or_email: str 
    password: str

# --- OUTPUT Schemas (Backend trả về) ---
class UserResponse(BaseModel):
    id: UUID
    username: str
    email: EmailStr
    role: UserRole
    status: UserStatus
    created_at: datetime
    
    # Quan trọng: Trả về kèm Profile
    profile: Optional[ProfileResponse] = None

    class Config:
        from_attributes = True

# Thêm class này vào
class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    age: Optional[Any] = None       # Để Any vì frontend có thể gửi string/int
    hometown: Optional[str] = None
    insurance_id: Optional[str] = None
    height: Optional[Any] = None
    weight: Optional[Any] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None

    class Config:
        from_attributes = True