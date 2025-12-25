# aura-backend/models/messages.py
from typing import Optional   # <--- BẠN ĐANG THIẾU DÒNG QUAN TRỌNG NÀY
from pydantic import BaseModel, Field
from datetime import datetime
from bson import ObjectId

class Message(BaseModel):
    id: Optional[ObjectId] = Field(alias="_id", default=None)
    sender_id: str
    receiver_id: str
    content: str
    is_read: bool = False
    timestamp: datetime = Field(default_factory=datetime.now)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}