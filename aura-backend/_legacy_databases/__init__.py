# aura-backend/databases/__init__.py

# Import đối tượng 'db' từ file mongodb.py cùng thư mục
from .mongodb import db, MongoDB
from .init_db import init_db
# Dòng này giúp bạn chỉ cần gõ: "from databases import db"
# Thay vì phải gõ dài dòng: "from databases.mongodb import db"
__all__ = ["db", "MongoDB", "init_db"]