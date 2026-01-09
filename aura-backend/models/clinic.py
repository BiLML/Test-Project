# Sửa lại file models/clinic.py
from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from .base import Base # Đảm bảo file base.py tồn tại
from models.enums import ClinicStatus

class Clinic(Base):
    __tablename__ = "clinics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(Text)
    phone_number = Column(String(20), nullable=False)
    image_url = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(SqlEnum(ClinicStatus), default=ClinicStatus.PENDING)
    # Đảm bảo model User có relationship ngược lại là 'clinic_managed'
    admin = relationship("User", back_populates="clinic_managed", foreign_keys=[admin_id])
    # 2. Danh sách bệnh nhân (Link qua User.clinic_id) - CẦN THÊM DÒNG NÀY
    # Lưu ý: foreign_keys phải để dạng string "[User.clinic_id]" để tránh lỗi circular import
    clinic_members = relationship(
        "User", 
        back_populates="clinic", 
        foreign_keys="User.clinic_id"
    )

    patients = relationship("Patient", back_populates="clinic")