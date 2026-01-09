from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

# 1. Gói dịch vụ (Service Package)
class PackageResponse(BaseModel):
    id: UUID
    name: str
    price: Decimal
    analysis_limit: int
    duration_days: int

    class Config:
        from_attributes = True

# 2. Đăng ký (Subscription)
class SubscriptionResponse(BaseModel):
    id: UUID
    package_id: UUID
    user_id: UUID
    credits_left: int
    expired_at: date
    
    # Có thể kèm thông tin gói để hiển thị tên gói
    package: Optional[PackageResponse] = None

    class Config:
        from_attributes = True

# 3. Input để đăng ký gói
class SubscribeRequest(BaseModel):
    package_id: UUID