from sqlalchemy.orm import Session
from repositories.user_repo import UserRepository
from models.users import User, Profile
from schemas.user_schema import UserCreate, UserLogin, UserProfileUpdate
from core.security import get_password_hash, verify_password
from fastapi import HTTPException, status

class UserService:
    def __init__(self, db: Session):
        self.user_repo = UserRepository(db)
        self.db = db
    def register_user(self, user_data: UserCreate):
        # 1. CHECK TRÙNG USERNAME
        if self.user_repo.get_by_username(user_data.username):
            raise HTTPException(
                status_code=400, 
                detail="Username này đã tồn tại. Vui lòng chọn tên khác."
            )
        
        # 2. CHECK TRÙNG EMAIL
        if self.user_repo.get_by_email(user_data.email):
            raise HTTPException(
                status_code=400, 
                detail="Email này đã được sử dụng."
            )

        # 3. Nếu không trùng thì Hash pass và tạo
        hashed_pwd = get_password_hash(user_data.password)
        return self.user_repo.create_user(user_data, hashed_pwd)

    def authenticate_user(self, username_or_email: str, password: str):
        # Logic đăng nhập đa năng: Tìm theo username trước, nếu không có thì tìm theo email
        user = self.user_repo.get_by_username(username_or_email)
        if not user:
            user = self.user_repo.get_by_email(username_or_email)
            
        if not user:
            return None
        
        if not verify_password(password, user.password_hash):
            return None
            
        return user
        
    def get_user_by_id(self, user_id: str):
        return self.user_repo.get_by_id(user_id)
    
    def update_user_profile(self, user_id: str, update_data: UserProfileUpdate):
        # 1. Lấy User từ DB
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # 2. Cập nhật thông tin cơ bản bảng User (Email)
        if update_data.email and update_data.email != user.email:
            # Check trùng email nếu cần (bỏ qua nếu lười)
            user.email = update_data.email
        
        # 3. Xử lý bảng Profile (Quan hệ 1-1)
        profile = user.profile # SQLAlchemy relationship
        
        if not profile:
            # Nếu chưa có profile thì tạo mới
            profile = Profile(user_id=user.id)
            self.user_repo.db.add(profile)
        
        # 4. Map dữ liệu từ Schema sang Model Profile
        if update_data.full_name is not None: profile.full_name = update_data.full_name
        if update_data.phone is not None: profile.phone = update_data.phone
        
        # Các trường lưu trong JSONB (medical_info) hoặc tạo cột mới tuỳ DB của bạn
        # Ở đây tôi giả định bạn đã tạo cột riêng hoặc lưu vào JSONB 'medical_info'
        # Nếu model Profile của bạn chưa có cột age, height, weight... 
        # Bạn nên lưu chúng vào cột 'medical_info' (JSONB) nếu không muốn sửa DB schema.
        
        # Cách lưu vào JSONB (medical_info):
        current_info = profile.medical_info or {}
        
        # Cập nhật các trường phụ vào JSON
        updates_for_json = {
            "age": update_data.age,
            "hometown": update_data.hometown,
            "insurance_id": update_data.insurance_id,
            "height": update_data.height,
            "weight": update_data.weight,
            "gender": update_data.gender,
            "nationality": update_data.nationality
        }
        
        # Loại bỏ các giá trị None
        clean_updates = {k: v for k, v in updates_for_json.items() if v is not None}
        if clean_updates:
            # Copy dict cũ và update dict mới để đảm bảo JSONB trigger update
            new_info = current_info.copy()
            new_info.update(clean_updates)
            profile.medical_info = new_info # Gán lại để SQLAlchemy nhận diện thay đổi
        
        # 6. Lưu vào DB
        self.db.commit()
        self.db.refresh(user)
        
        # 7. Trả về dữ liệu phẳng cho Frontend dễ hiển thị
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "full_name": profile.full_name,
            "phone": profile.phone,
            **new_info # Bung toàn bộ dữ liệu trong JSON ra ngoài
        }

    def get_all_users(self):
        return self.user_repo.get_all_users()