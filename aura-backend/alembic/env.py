import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from dotenv import load_dotenv

# ----------------------------------------------------------------------
# [PHẦN 1: CẤU HÌNH ĐƯỜNG DẪN & IMPORT]
# ----------------------------------------------------------------------

# Thêm đường dẫn root vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
current_path = os.path.dirname(os.path.abspath(__file__))
root_path = os.path.join(current_path, "..")
load_dotenv(os.path.join(root_path, ".env"))
# Import Base và DATABASE_URL từ core/database (để đồng bộ kết nối)
from core.database import DATABASE_URL 
from models.base import Base

# --- IMPORT TẤT CẢ CÁC MODELS CỦA BẠN TẠI ĐÂY ---
# Lưu ý: Tên class (User, Clinic...) phải khớp với tên trong file model
from models.users import User, Profile
from models.clinic import Clinic
from models.medical import (
    Patient, 
    RetinalImage, 
    AIAnalysisResult, 
    DoctorValidation
)  # [Fix] Đã sửa từ medical_record -> medical
from models.billing import ServicePackage, Subscription
from models.chat import Message
# Nếu có thêm model mới, hãy thêm vào đây
# ----------------------------------------------------------------------

# Lấy config từ alembic.ini
config = context.config
# [QUAN TRỌNG] Ghi đè sqlalchemy.url bằng URL thực tế từ code python
# Giúp chạy đúng trên Docker/Local mà không cần sửa file alembic.ini thủ công
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Thiết lập log
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Gán metadata của Base vào target để Alembic so sánh
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Chế độ Offline: Tạo file SQL mà không cần kết nối DB (ít dùng)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Chế độ Online: Kết nối trực tiếp vào DB để tạo bảng."""
    
    # Tạo engine từ config đã được override URL ở trên
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()