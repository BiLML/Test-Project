from sqlalchemy.orm import Session
from models.billing import ServicePackage, Subscription
from uuid import UUID
from datetime import datetime

class BillingRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all_packages(self):
        return self.db.query(ServicePackage).all()

    def get_active_subscription(self, user_id: UUID):
        # Lấy gói đăng ký còn hạn
        now = datetime.utcnow().date()
        return self.db.query(Subscription).filter(
            Subscription.user_id == user_id,
            Subscription.expired_at >= now
        ).first()

    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int):
        # Tính ngày hết hạn
        from datetime import timedelta
        expired_date = datetime.utcnow().date() + timedelta(days=days)

        sub = Subscription(
            user_id=user_id,
            package_id=package_id,
            credits_left=credits,
            expired_at=expired_date
        )
        self.db.add(sub)
        self.db.commit()
        self.db.refresh(sub)
        return sub