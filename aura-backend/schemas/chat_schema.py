from pydantic import BaseModel
from typing import List, Optional

# --- Input Models (Dữ liệu Frontend gửi lên) ---
class MessageCreate(BaseModel):
    receiver_id: str
    content: str

# --- Output Models (Dữ liệu trả về Frontend) ---
class MessageResponse(BaseModel):
    id: str
    content: str
    is_me: bool
    time: str

class ChatPreview(BaseModel):
    id: str
    sender: str     # Tên hiển thị (username hoặc full_name)
    full_name: str  # Tên đầy đủ
    preview: str    # Nội dung tin nhắn cuối cùng
    time: str       # Thời gian tin nhắn cuối
    unread: bool    # Trạng thái chưa đọc

class ChatListResponse(BaseModel):
    chats: List[ChatPreview]