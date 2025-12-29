from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from bson import ObjectId

class MedicalRecord(BaseModel):
    # Ánh xạ _id từ Mongo
    id: Optional[Any] = Field(alias="_id")
    
    user_id: str
    # Ánh xạ image_url trong DB vào original_image_url trong code
    original_image_url: str = Field(alias="image_url")
    
    # Lưu ý: ai_result trong DB đang là String, không phải Object
    # Nếu muốn dùng AIAnalysisResult, bạn phải cập nhật lại dữ liệu trong DB
    ai_result: Optional[str] = None 
    
    ai_analysis_status: str = Field(alias="status", default="processing")
    
    # Ánh xạ doctor_note (DB) -> doctor_notes (Code)
    doctor_notes: Optional[str] = Field(alias="doctor_note", default=None)
    
    # Ánh xạ upload_date (DB) -> created_at (Code)
    created_at: datetime = Field(alias="upload_date")

    class Config:
        populate_by_name = True  # Cho phép dùng cả alias và tên biến
        arbitrary_types_allowed = True