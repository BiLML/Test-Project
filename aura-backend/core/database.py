import os  # [Fix] Thêm thư viện os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
# [Fix] Chỉ giữ lại import này, xóa dòng declarative_base() bên dưới
from models.base import Base 

# Lấy URL từ biến môi trường Docker, nếu không có thì dùng localhost
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("LỖI CẤU HÌNH: Không tìm thấy DATABASE_URL trong biến môi trường (.env)")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# [Fix] Đã xóa dòng: Base = declarative_base() để tránh xung đột với Base import ở trên

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()