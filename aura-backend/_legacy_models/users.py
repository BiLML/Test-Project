# aura-backend/models/users.py
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from bson import ObjectId

# Helper để xử lý ObjectId của MongoDB khi chuyển sang JSON
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

# 1. Model cho thông tin chi tiết (Profile) - Được NHÚNG vào User
class UserProfile(BaseModel):
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    # Nếu là bác sĩ thì có thêm chuyên khoa
    specialization: Optional[str] = None 

# 2. Model chính cho User (Entity)
class User(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    userName: str
    email: EmailStr
    password: str
    role: str = "patient"  # Giá trị mặc định là 'patient', có thể là 'doctor'
    profile: UserProfile   # Nhúng UserProfile vào đây
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}