# aura-backend/models/medical_records.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

# Model lưu kết quả từ AI (Ví dụ: xác suất bệnh, đường dẫn ảnh mask)
class AIAnalysisResult(BaseModel):
    disease_name: str       # Ví dụ: "Diabetic Retinopathy"
    confidence_score: float # Ví dụ: 0.95
    vessel_mask_url: Optional[str] = None # Đường dẫn ảnh mạch máu sau khi AI xử lý
    optic_disc_url: Optional[str] = None

# Model chính cho Bệnh án (Entity)
class MedicalRecord(BaseModel):
    id: Optional[ObjectId] = Field(alias="_id")
    user_id: str  # Tham chiếu đến _id của User (lưu dạng chuỗi cho dễ)
    doctor_id: Optional[str] = None # Bác sĩ nào chẩn đoán (nếu có)
    
    original_image_url: str # Ảnh mắt gốc do người dùng upload
    
    # Kết quả phân tích (Nhúng object AI vào đây)
    ai_result: Optional[AIAnalysisResult] = None
    
    # Ghi chú của bác sĩ (cho trang DashboardDr)
    doctor_notes: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.now)
    status: str = "processing" # pending, completed, reviewed

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}