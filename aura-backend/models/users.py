from sqlalchemy import Column,Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from models.base import Base  # Giả sử bạn có Base khai báo trong __init__ hoặc database.py
from .enums import UserRole, UserStatus

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in x]), default=UserRole.USER)
    status = Column(Enum(UserStatus, values_callable=lambda x: [e.value for e in x]), default=UserStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=True)
    sent_messages = relationship("Message", foreign_keys="[Message.sender_id]", back_populates="sender", cascade="all, delete-orphan")
    received_messages = relationship("Message", foreign_keys="[Message.receiver_id]", back_populates="receiver", cascade="all, delete-orphan")
    assigned_doctor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    patient_record = relationship("Patient", back_populates="user", uselist=False)
    clinic_managed = relationship("Clinic", back_populates="admin", uselist=False, foreign_keys="Clinic.admin_id")
    clinic = relationship("Clinic", back_populates="clinic_members", foreign_keys=[clinic_id])
    doctor_validations = relationship("DoctorValidation", back_populates="doctor")
    uploaded_images = relationship("RetinalImage", back_populates="uploader")
    subscriptions = relationship("Subscription", back_populates="user")
    assigned_doctor = relationship("User", remote_side=[id], foreign_keys=[assigned_doctor_id])
class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    full_name = Column(String(255))
    phone = Column(String(20))
    avatar_url = Column(Text)
    medical_info = Column(JSONB)  # Lưu tiền sử bệnh, dị ứng...

    # Relationships
    user = relationship("User", back_populates="profile")