# aura-backend/databases/backup_manager.py
import subprocess
import os
from datetime import datetime
from dotenv import load_dotenv

# Load biến môi trường để lấy MONGO_URL
load_dotenv()

# Cấu hình
MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = "aura_db"  # Tên database của bạn
BACKUP_DIR = "backups" # Thư mục chứa file backup

def create_backup():
    """Tạo một bản sao lưu mới"""
    # 1. Tạo tên file theo thời gian (VD: 2023-12-25_15-30-00)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    target_dir = os.path.join(BACKUP_DIR, timestamp)
    
    # 2. Tạo lệnh mongodump
    # Lệnh: mongodump --uri="..." --db=aura_db --out="backups/..."
    command = [
        "mongodump",
        f"--uri={MONGO_URI}",
        f"--db={DB_NAME}",
        f"--out={target_dir}"
    ]
    
    try:
        print(f"⏳ Đang backup database '{DB_NAME}'...")
        # Chạy lệnh hệ thống
        subprocess.run(command, check=True, shell=True)
        print(f"✅ Backup thành công! Dữ liệu lưu tại: {target_dir}")
        return target_dir
    except subprocess.CalledProcessError as e:
        print(f"❌ Lỗi khi backup: {e}")
        return None
    except FileNotFoundError:
        print("❌ Lỗi: Không tìm thấy lệnh 'mongodump'. Hãy cài đặt MongoDB Database Tools.")

def restore_backup(backup_folder_name):
    """Khôi phục từ một bản backup cụ thể"""
    # Đường dẫn đến file BSON cần restore
    source_path = os.path.join(BACKUP_DIR, backup_folder_name, DB_NAME)
    
    if not os.path.exists(source_path):
        print(f"❌ Không tìm thấy bản backup: {source_path}")
        return

    # Lệnh: mongorestore --uri="..." --db=aura_db --drop "path/to/dump"
    # --drop: Xóa dữ liệu cũ trước khi chép đè (cho sạch sẽ)
    command = [
        "mongorestore",
        f"--uri={MONGO_URI}",
        f"--db={DB_NAME}",
        "--drop", 
        source_path
    ]
    
    try:
        print(f"⏳ Đang khôi phục database từ bản '{backup_folder_name}'...")
        subprocess.run(command, check=True, shell=True)
        print(f"✅ Khôi phục thành công!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Lỗi khi khôi phục: {e}")

# --- PHẦN CHẠY THỬ (TEST) ---
if __name__ == "__main__":
    # Để test backup, bỏ comment dòng dưới:
    create_backup()
    
    # Để test restore, bỏ comment dòng dưới và điền tên folder backup vừa tạo:
    # restore_backup("2025-12-25_16-00-00")