from xxlimited import Str
from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from models.enums import ImageType, EyeSide

# 1. Schema trả về kết quả AI
class AIAnalysisResponse(BaseModel):
    id: UUID
    risk_level: Optional[str] = None
    vessel_details: Optional[Dict[str, Any]] = None # Trả về JSON chi tiết
    annotated_image_url: Optional[str] = None
    processed_at: datetime
    ai_detailed_report: Optional[str] = None

    class Config:
        from_attributes = True

# 2. Schema trả về thông tin Ảnh mắt
class ImageResponse(BaseModel):
    id: UUID
    uploader_id: UUID
    image_url: str
    image_type: ImageType
    eye_side: Optional[EyeSide] = None
    created_at: datetime
    
    # Kèm theo kết quả phân tích (nếu có)
    analysis_result: Optional[AIAnalysisResponse] = None

    class Config:
        from_attributes = True

# 3. Schema cho Patient (Nếu cần hiển thị hồ sơ bệnh nhân)
class PatientResponse(BaseModel):
    id: UUID
    dob: Optional[datetime]
    gender: Optional[str]
    
    class Config:
        from_attributes = True