from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

# Import các router
from api import auth, users, medical_records, clinic, billing, admin, chat, doctor

app = FastAPI(title="Aura AI Backend")

# Cấu hình CORS (Để Frontend gọi được API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Trong môi trường dev, cho phép tất cả
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount thư mục uploads để xem ảnh
os.makedirs("uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="uploads"), name="static")

# --- ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT ---
# Kiểm tra kỹ các dòng include_router này:

# 1. Auth: Đăng ký, Đăng nhập
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])

# 2. Users: Lấy thông tin cá nhân
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])

# 3. Medical Records: Upload ảnh, AI
app.include_router(medical_records.router, prefix="/api/v1/medical-records", tags=["Medical Records"])

# 4. Clinic: Quản lý phòng khám
app.include_router(clinic.router, prefix="/api/v1/clinics", tags=["Clinics"])

# 5. Billing: Thanh toán
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])

# 6. Admin: Quản lý người dùng, Báo cáo
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin Dashboard"])

# Đăng ký cho các API gửi/nhận tin (/api/v1/chat/send...)
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat Actions"])

# Đăng ký cho API lấy danh sách (/api/v1/chats)
app.include_router(chat.router, prefix="/api/v1/chats", tags=["Chat List"])

# Đăng ký router
app.include_router(doctor.router, prefix="/api/v1/doctor", tags=["Doctor"])

# --------------------------------------
@app.get("/")
def root():
    return {"message": "Welcome to Aura AI Backend API"}