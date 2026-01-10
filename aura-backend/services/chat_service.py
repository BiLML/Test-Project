from sqlalchemy.orm import Session
from repositories.chat_repo import ChatRepository
from repositories.user_repo import UserRepository
from schemas.chat_schema import MessageCreate, ChatPreview
import uuid
from datetime import timedelta

class ChatService:
    def __init__(self, db: Session):
        self.repo = ChatRepository(db)

    def send_message(self, current_user_id: uuid.UUID, msg_in: MessageCreate):
        try:
            receiver_uuid = uuid.UUID(msg_in.receiver_id)
        except ValueError:
            raise ValueError("ID người nhận không hợp lệ")
            
        return self.repo.create(
            sender_id=current_user_id,
            receiver_id=receiver_uuid,
            content=msg_in.content
        )

    def get_recent_chats(self, current_user_id: uuid.UUID) -> list[ChatPreview]:
        # 1. Lấy user hiện tại để check xem có bác sĩ phân công không
        user_repo = UserRepository(self.repo.db) # Tận dụng db session
        current_user = user_repo.get_by_id(current_user_id)
        
        # 2. Lấy toàn bộ tin nhắn thô
        raw_messages = self.repo.get_all_by_user(current_user_id)
        chats_map = {}
        
        # 2. Logic nhóm tin nhắn theo từng người chat (Partner)
        for msg in raw_messages:
            # Xác định ID của người kia
            partner_id = msg.receiver_id if msg.sender_id == current_user_id else msg.sender_id
            
            if partner_id not in chats_map:
                # Lấy thông tin Partner
                partner = self.repo.get_user_info(partner_id)
                partner_name = "Unknown"
                
                # Logic lấy tên hiển thị: Ưu tiên Fullname > Username
                if partner:
                    if partner.profile and partner.profile.full_name:
                        partner_name = partner.profile.full_name
                    elif partner.username:
                        partner_name = partner.username

                # Tạo object ChatPreview theo schema
                chats_map[partner_id] = ChatPreview(
                    id=str(partner_id),
                    sender=partner_name,
                    full_name=partner_name,
                    preview=msg.content,
                    # Format giờ: HH:MM
                    time=(msg.created_at + timedelta(hours=7)).strftime("%H:%M") if msg.created_at else "",
                    # Unread nếu: Mình là người nhận VÀ is_read = False
                    unread=(msg.receiver_id == current_user_id and not msg.is_read)
                )
        if current_user.assigned_doctor_id:
            doc_id = current_user.assigned_doctor_id
            # Nếu bác sĩ chưa có trong danh sách chat
            if doc_id not in chats_map:
                doctor = self.repo.get_user_info(doc_id)
                if doctor:
                    doc_name = doctor.profile.full_name if (doctor.profile and doctor.profile.full_name) else doctor.username
                    # Tạo một mục chat giả (chưa có tin nhắn)
                    chats_map[doc_id] = ChatPreview(
                        id=str(doc_id),
                        sender=doc_name,
                        full_name=doc_name,
                        preview="Bắt đầu trò chuyện với bác sĩ của bạn",
                        time="",
                        unread=False
                    )
        
        return list(chats_map.values())

    def get_chat_history(self, current_user_id: uuid.UUID, partner_id_str: str):
        try:
            partner_uuid = uuid.UUID(partner_id_str)
        except ValueError:
            raise ValueError("ID đối phương không hợp lệ")

        messages = self.repo.get_conversation(current_user_id, partner_uuid)
        
        # Format dữ liệu để trả về Frontend
        return [
            {
                "id": str(msg.id),
                "content": msg.content,
                "is_me": (msg.sender_id == current_user_id), # Cờ để Frontend hiển thị bên trái/phải
                "time": (msg.created_at + timedelta(hours=7)).strftime("%H:%M") if msg.created_at else "",                "is_read": msg.is_read
            }
            for msg in messages
        ]

    def mark_read(self, current_user_id: uuid.UUID, partner_id_str: str):
        try:
            partner_uuid = uuid.UUID(partner_id_str)
            self.repo.mark_as_read(current_user_id, partner_uuid)
        except ValueError:
            pass