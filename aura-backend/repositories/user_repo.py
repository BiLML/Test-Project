from sqlalchemy.orm import Session
from models.users import User, Profile
from models.enums import UserRole, UserStatus
from schemas.user_schema import UserCreate

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str):
        return self.db.query(User).filter(User.email == email).first()

    # [THÊM MỚI] Hàm tìm user theo username
    def get_by_username(self, username: str):
        return self.db.query(User).filter(User.username == username).first()

    def get_by_id(self, user_id: str):
        return self.db.query(User).filter(User.id == user_id).first()

    def create_user(self, user_data: UserCreate, hashed_password: str):
        try:
            # 1. Tạo User (Thêm trường username)
            new_user = User(
                username=user_data.username, # [UPDATE] Lưu username
                email=user_data.email,
                password_hash=hashed_password,
                role=user_data.role if user_data.role else UserRole.USER,
                status=UserStatus.ACTIVE
            )
            self.db.add(new_user)
            self.db.flush() 

            # 2. Tạo Profile
            new_profile = Profile(
                user_id=new_user.id,
                full_name=user_data.full_name,
                phone=user_data.phone
            )
            self.db.add(new_profile)
            
            self.db.commit()
            self.db.refresh(new_user)
            return new_user
        except Exception as e:
            self.db.rollback()
            raise e
        
    def get_all_users(self, skip: int = 0, limit: int = 100):
        return self.db.query(User).offset(skip).limit(limit).all()