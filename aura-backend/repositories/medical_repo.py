from sqlalchemy.orm import Session
from models.medical import Patient, RetinalImage, AIAnalysisResult
from models.enums import ImageType, EyeSide, RiskLevel
from uuid import UUID

class MedicalRepository:
    def __init__(self, db: Session):
        self.db = db

    # --- Phần xử lý Bệnh nhân (Patient) ---
    def get_patient_by_user_id(self, user_id: UUID):
        return self.db.query(Patient).filter(Patient.user_id == user_id).first()

    def create_patient_record(self, user_id: UUID, dob=None, gender=None):
        # Kiểm tra nếu chưa có hồ sơ thì tạo mới
        patient = self.get_patient_by_user_id(user_id)
        if not patient:
            patient = Patient(user_id=user_id, dob=dob, gender=gender)
            self.db.add(patient)
            self.db.commit()
            self.db.refresh(patient)
        return patient

    # --- Phần xử lý Ảnh (RetinalImage) ---
    def save_image(self, patient_id: UUID, uploader_id: UUID, image_url: str, eye_side: EyeSide):
        new_image = RetinalImage(
            patient_id=patient_id,
            uploader_id=uploader_id,
            image_url=image_url,
            image_type=ImageType.FUNDUS,
            eye_side=eye_side
        )
        self.db.add(new_image)
        self.db.commit()
        self.db.refresh(new_image)
        return new_image

    def get_image_by_id(self, image_id: str):
        return self.db.query(RetinalImage).filter(RetinalImage.id == image_id).first()

    # --- Phần xử lý Kết quả AI (AIAnalysisResult) ---
    def save_analysis_result(self, image_id: UUID, risk_level: str, vessel_data: dict, annotated_url: str, report_content: str = None):
        try:
            # Giả sử Model của bạn là AIAnalysisResult
            new_result = AIAnalysisResult(
                image_id=image_id,
                risk_level=risk_level,
                # Nếu database của bạn chưa có cột report_content, 
                # hãy nhét nó vào một cột text hiện có hoặc bỏ qua tạm thời
                vessel_details=vessel_data, 
                annotated_image_url=annotated_url,
                ai_detailed_report=report_content, # ✅ Lưu báo cáo chi tiết
                ai_version="v1.0-onnx"
                # chi_tiet_bao_cao=report_content # Kiểm tra lại tên cột trong Model của bạn
            )
            self.db.add(new_result)
            self.db.commit()
            self.db.refresh(new_result)
            return new_result
        except Exception as e:
            self.db.rollback()
            print(f"❌ Repo Error: {e}")
            raise e

    # File: repositories/medical_repo.py

    def get_records_by_uploader(self, user_id: UUID, skip: int = 0, limit: int = 100):
        # Trả về danh sách ảnh do User này tải lên
        return self.db.query(RetinalImage).filter(RetinalImage.uploader_id == user_id).offset(skip).limit(limit).all()

    def get_all_records(self, skip: int = 0, limit: int = 100):
        # Trả về toàn bộ ảnh trong hệ thống (cho bác sĩ/admin)
        return self.db.query(RetinalImage).offset(skip).limit(limit).all()

    def get_record_by_id(self, record_id: str):
        # Lấy chi tiết một ảnh kèm kết quả phân tích
        return self.db.query(RetinalImage).filter(RetinalImage.id == record_id).first()