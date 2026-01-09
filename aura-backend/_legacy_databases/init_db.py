# aura-backend/databases/init_db.py
from .mongodb import db

# Danh sách các bảng cần có
REQUIRED_COLLECTIONS = [
    "users",
    "medical_records",
    "messages",
    "payments"
]

async def init_db():
    """Hàm kiểm tra và tạo collection rỗng"""
    print("🔄 [Database] Đang khởi tạo cấu trúc...")
    try:
        existing = await db.list_collection_names()
        for col in REQUIRED_COLLECTIONS:
            if col not in existing:
                await db.create_collection(col)
                print(f"   ✅ Đã tạo bảng: {col}")
        print("🚀 [Database] Sẵn sàng!")
    except Exception as e:
        print(f"❌ [Database] Lỗi: {e}")