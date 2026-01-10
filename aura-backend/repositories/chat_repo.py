from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from models.chat import Message
from models.users import User
import uuid

class ChatRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, sender_id: uuid.UUID, receiver_id: uuid.UUID, content: str) -> Message:
        new_msg = Message(
            sender_id=sender_id,
            receiver_id=receiver_id,
            content=content,
            is_read=False
        )
        self.db.add(new_msg)
        self.db.commit()
        self.db.refresh(new_msg)
        return new_msg

    def get_all_by_user(self, user_id: uuid.UUID) -> list[Message]:
        """Lấy tất cả tin nhắn liên quan đến user (cả gửi và nhận)"""
        return self.db.query(Message).filter(
            or_(Message.sender_id == user_id, Message.receiver_id == user_id)
        ).order_by(Message.created_at.desc()).all()

    def get_conversation(self, user_id: uuid.UUID, partner_id: uuid.UUID) -> list[Message]:
        """Lấy lịch sử chat chi tiết giữa 2 người"""
        return self.db.query(Message).filter(
            or_(
                and_(Message.sender_id == user_id, Message.receiver_id == partner_id),
                and_(Message.sender_id == partner_id, Message.receiver_id == user_id)
            )
        ).order_by(Message.created_at.asc()).all()

    def mark_as_read(self, user_id: uuid.UUID, partner_id: uuid.UUID):
        """Đánh dấu tất cả tin nhắn từ Partner gửi cho User là ĐÃ ĐỌC"""
        self.db.query(Message).filter(
            Message.sender_id == partner_id,
            Message.receiver_id == user_id,
            Message.is_read == False
        ).update({"is_read": True})
        self.db.commit()

    def get_user_info(self, user_id: uuid.UUID) -> User:
        return self.db.query(User).filter(User.id == user_id).first()