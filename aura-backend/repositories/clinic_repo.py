from sqlalchemy.orm import Session, joinedload
from models.clinic import Clinic
from uuid import UUID
from models.enums import ClinicStatus

class ClinicRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None):
        clinic = Clinic(
            admin_id=admin_id,
            name=name,
            address=address,
            phone_number=phone_number, # <--- Lưu số điện thoại
            image_url=image_url,       # <--- Lưu đường dẫn ảnh
            description=description,   # <--- Lưu mô tả
            status=ClinicStatus.PENDING
        )
        self.db.add(clinic)
        self.db.commit()
        self.db.refresh(clinic)
        return clinic

    def get_all_clinics(self):
        return self.db.query(Clinic).all()

    def get_clinic_by_id(self, clinic_id: str):
        return self.db.query(Clinic).filter(Clinic.id == clinic_id).first()
    
    def get_unverified_clinics(self):
        # Lọc những phòng khám có is_verified = False
        return self.db.query(Clinic).options(joinedload(Clinic.admin)).filter(
            Clinic.status == ClinicStatus.PENDING
        ).all()

    def verify_clinic(self, clinic_id: str, status: str):
            clinic = self.get_clinic_by_id(clinic_id)
            if not clinic: return None
            
            if status == 'APPROVED':
                clinic.status = ClinicStatus.APPROVED
            elif status == 'REJECTED':
                clinic.status = ClinicStatus.REJECTED
            else:
            # Trường hợp gửi status sai
                return None
            
            self.db.commit()
            self.db.refresh(clinic)
            return clinic