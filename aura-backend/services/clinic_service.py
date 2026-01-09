from sqlalchemy.orm import Session, joinedload
from repositories.clinic_repo import ClinicRepository
from models.clinic import Clinic
from models.users import User
# --- SỬA 1: Thêm UserStatus vào import ---
from models.enums import UserRole, ClinicStatus, UserStatus 
from uuid import UUID

class ClinicService:
    def __init__(self, db: Session):
        self.clinic_repo = ClinicRepository(db)
        self.db = db

    def register_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic:
        existing_clinic = self.clinic_repo.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if existing_clinic:
             raise Exception("Admin này đã sở hữu một phòng khám.")
        return self.clinic_repo.create_clinic(admin_id, name, address, phone_number, image_url, description)

    def get_clinic_info(self, clinic_id: str) -> Clinic:
        return self.clinic_repo.get_clinic_by_id(clinic_id)

    def get_all_clinics(self):
        return self.clinic_repo.get_all_clinics()

    def get_clinic_dashboard_data(self, admin_id: UUID):
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic:
            return None
        
        admin_user = self.db.query(User).options(joinedload(User.profile)).filter(User.id == admin_id).first()
        admin_name = "Clinic Admin" # Giá trị mặc định
        if admin_user and admin_user.profile and admin_user.profile.full_name:
            admin_name = admin_user.profile.full_name

        # --- XỬ LÝ BÁC SĨ ---
        doctors = self.db.query(User).options(joinedload(User.profile)).filter(
            User.clinic_id == clinic.id, 
            User.role == UserRole.DOCTOR
        ).all()

        formatted_doctors = []
        for doc in doctors:
            p_counts = self.db.query(User).filter(
                User.assigned_doctor_id == doc.id,
                User.role == UserRole.USER
            ).count()

            formatted_doctors.append({
                "id": doc.id,
                "username": doc.username,
                "email": doc.email,
                "full_name": doc.profile.full_name if (doc.profile and doc.profile.full_name) else doc.username,
                "role": doc.role,   
                "created_at": doc.created_at,
                "is_active": True,
                "phone": doc.profile.phone if (doc.profile and doc.profile.phone) else "", 
                "patient_count": p_counts,
                "status": doc.status
            })

        # --- XỬ LÝ BỆNH NHÂN ---
        patients_query = self.db.query(User).options(
            joinedload(User.assigned_doctor).joinedload(User.profile),
            joinedload(User.profile)
        ).filter(
            User.clinic_id == clinic.id,
            User.role == UserRole.USER
        ).all()

        formatted_patients = []
        for p in patients_query:
            doc_name = "Chưa phân công"
            assigned_doctor_id = None 

            if p.assigned_doctor:
                assigned_doctor_id = p.assigned_doctor.id
                if hasattr(p.assigned_doctor, 'profile') and p.assigned_doctor.profile:
                     doc_name = p.assigned_doctor.profile.full_name or p.assigned_doctor.username
                else:
                     doc_name = p.assigned_doctor.username

            formatted_patients.append({
                "id": p.id,
                "username": p.username,
                "email": p.email,
                "role": p.role,
                "status": p.status,
                "created_at": p.created_at,
                "is_active": True, 
                "full_name": p.profile.full_name if (p.profile and p.profile.full_name) else p.username,
                "phone": p.profile.phone if (p.profile and p.profile.phone) else "",
                "assigned_doctor_id": assigned_doctor_id,
                "assigned_doctor": doc_name,
                "latest_scan": p.latest_scan if hasattr(p, 'latest_scan') else None
            })

        return {
            "clinic": clinic,
            "admin_name": admin_name,
            "doctors": formatted_doctors, 
            "patients": formatted_patients
        }
    
    def add_user_to_clinic(self, admin_id: UUID, target_user_id: UUID):
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic: raise Exception("Admin chưa có phòng khám")
        
        user = self.db.query(User).filter(User.id == target_user_id).first()
        if not user: raise Exception("User không tồn tại")
        
        user.clinic_id = clinic.id
        self.db.commit()
        return True

    def assign_patient(self, patient_id: UUID, doctor_id: UUID):
        patient = self.db.query(User).filter(User.id == patient_id).first()
        if not patient:
            raise Exception("Không tìm thấy bệnh nhân")
        
        patient.assigned_doctor_id = doctor_id 
        self.db.commit()
        return True
    
    def get_pending_clinics(self):
        return self.clinic_repo.get_unverified_clinics()

    def process_clinic_request(self, clinic_id: str, status: str):
            clinic = self.clinic_repo.verify_clinic(clinic_id, status)
            
            if clinic and status == 'APPROVED':
                user = self.db.query(User).filter(User.id == clinic.admin_id).first()
                if user and user.role == UserRole.USER:
                    user.role = UserRole.CLINIC
                    self.db.commit()
            return clinic