from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import get_current_user
from services.user_service import UserService
from schemas.user_schema import UserResponse, UserProfileUpdate
from models.users import User
from models.enums import UserRole

router = APIRouter()

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user = Depends(get_current_user)):
    # current_user đã được lấy từ token thông qua hàm get_current_user trong core/security.py
    return current_user

@router.put("/me")
def update_my_profile(
    update_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_service = UserService(db)
    # Gọi hàm update vừa viết bên service
    return user_service.update_user_profile(user_id=current_user.id, update_data=update_data)
