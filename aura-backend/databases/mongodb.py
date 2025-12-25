# aura-backend/databases/mongodb.py
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

class MongoDB:
    def __init__(self):
        self.mongo_url = os.getenv("MONGO_URL", "mongodb://mongo_db:27017")
        self.client = None
        self.db = None

    def connect(self):
        """Kết nối tới MongoDB (Async)"""
        try:
            self.client = AsyncIOMotorClient(self.mongo_url)
            self.db = self.client.aura_db  # Tên database là 'aura_db'
            print("✅ Kết nối MongoDB (Async) thành công!")
            return self.db
        except Exception as e:
            print(f"❌ Lỗi kết nối MongoDB: {e}")
            return None

# Tạo instance
mongo_instance = MongoDB()
db = mongo_instance.connect()