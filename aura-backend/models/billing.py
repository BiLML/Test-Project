from sqlalchemy import Column, String, Integer, ForeignKey, Date, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from .base import Base

class ServicePackage(Base):
    __tablename__ = "service_packages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    analysis_limit = Column(Integer)
    duration_days = Column(Integer)

    # Relationships
    subscriptions = relationship("Subscription", back_populates="package")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    package_id = Column(UUID(as_uuid=True), ForeignKey("service_packages.id"), nullable=False)
    credits_left = Column(Integer, default=0)
    expired_at = Column(Date)

    # Relationships
    user = relationship("User", back_populates="subscriptions")
    package = relationship("ServicePackage", back_populates="subscriptions")