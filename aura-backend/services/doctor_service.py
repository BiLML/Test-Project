from sqlalchemy.orm import Session
import uuid
from repositories.doctor_repo import DoctorRepository
from schemas.doctor_schema import PatientResponse, LatestScan

class DoctorService:
    def __init__(self, db: Session):
        self.repo = DoctorRepository(db)

    def get_my_patients(self, doctor_id: uuid.UUID):
        # 1. Lấy danh sách bệnh nhân thô từ DB
        users = self.repo.get_assigned_patients(doctor_id)
        
        results = []
        for user in users:
            # 2. Lấy thông tin scan mới nhất của từng bệnh nhân
            latest_img = self.repo.get_latest_scan(user.id)
            
            scan_data = None
            if latest_img:
                # Xử lý an toàn nếu analysis_result bị None
                ai_res = "Đang xử lý"
                status = "PENDING"
                if latest_img.analysis_result:
                    ai_res = latest_img.analysis_result.risk_level
                    # Nếu model chưa có cột status, ta giả định có kết quả là COMPLETED
                    status = "COMPLETED" 

                scan_data = LatestScan(
                    record_id=str(latest_img.id),
                    ai_result=ai_res,
                    ai_analysis_status=status,
                    upload_date=latest_img.created_at
                )

            # 3. Map sang Schema
            # Lấy thông tin profile nếu có
            full_name = user.username
            phone = None
            if user.profile:
                full_name = user.profile.full_name or user.username
                phone = user.profile.phone

            results.append(PatientResponse(
                id=str(user.id),
                userName=user.username,
                full_name=full_name,
                email=user.email,
                phone=phone,
                latest_scan=scan_data
            ))
            
        return {"patients": results}