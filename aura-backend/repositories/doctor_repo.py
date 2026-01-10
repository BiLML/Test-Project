from sqlalchemy.orm import Session
from sqlalchemy import desc
from models.users import User, Profile
from models.medical import RetinalImage, AIAnalysisResult
from models.enums import UserRole
import uuid

class DoctorRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_assigned_patients(self, doctor_id: uuid.UUID):
        """Lấy danh sách bệnh nhân được phân công cho bác sĩ này"""
        return self.db.query(User).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER
        ).all()

    def get_latest_scan(self, patient_id: uuid.UUID):
        """Lấy kết quả khám mới nhất của bệnh nhân"""
        # Join RetinalImage với AIAnalysisResult để lấy kết quả
        return self.db.query(RetinalImage).join(
            AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id, isouter=True
        ).filter(
            RetinalImage.uploader_id == patient_id
        ).order_by(
            desc(RetinalImage.created_at)
        ).first()