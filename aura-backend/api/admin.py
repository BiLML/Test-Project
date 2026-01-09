# FILE: api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import get_current_user
from services.user_service import UserService
from schemas.user_schema import UserResponse
from models.users import User
from models.enums import UserRole

router = APIRouter()

# Lưu ý: Ở đây chỉ để "/" vì bên main.py sẽ gắn prefix "/api/v1/admin"
@router.get("/users", response_model=list[UserResponse])
def get_all_users_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ admin mới có quyền truy cập."
        )
    user_service = UserService(db)
    return user_service.get_all_users()

@router.get("/reports")
def get_admin_reports(
    current_user: User = Depends(get_current_user)    
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # [FIX LỖI KEY] Đổi "report" thành "reports" cho khớp frontend
    return {"reports": []}