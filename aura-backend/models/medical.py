from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum, Text, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from .base import Base
from .enums import Gender, EyeSide, ImageType, RiskLevel

class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id"), nullable=True)
    dob = Column(Date)
    gender = Column(Enum(Gender))

    # Relationships
    user = relationship("User", back_populates="patient_record")
    clinic = relationship("Clinic", back_populates="patients")
    images = relationship("RetinalImage", back_populates="patient")

class RetinalImage(Base):
    __tablename__ = "retinal_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    uploader_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    image_url = Column(Text, nullable=False)
    image_type = Column(Enum(ImageType), default=ImageType.FUNDUS)
    eye_side = Column(Enum(EyeSide))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    patient = relationship("Patient", back_populates="images")
    uploader = relationship("User", back_populates="uploaded_images")
    analysis_result = relationship("AIAnalysisResult", back_populates="image", uselist=False, cascade="all, delete-orphan")

class AIAnalysisResult(Base):
    __tablename__ = "ai_analysis_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id = Column(UUID(as_uuid=True), ForeignKey("retinal_images.id"), unique=True, nullable=False)
    risk_level = Column(String(255))
    vessel_details = Column(JSONB) # Dữ liệu mạch máu, tham số kỹ thuật
    annotated_image_url = Column(Text)
    ai_detailed_report = Column(Text)
    ai_version = Column(String(50))
    processed_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    image = relationship("RetinalImage", back_populates="analysis_result")
    doctor_validation = relationship("DoctorValidation", back_populates="analysis", uselist=False)

class DoctorValidation(Base):
    __tablename__ = "doctor_validations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(UUID(as_uuid=True), ForeignKey("ai_analysis_results.id"), unique=True, nullable=False)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_correct = Column(Boolean)
    doctor_notes = Column(Text)
    feedback_for_ai = Column(Text)

    # Relationships
    analysis = relationship("AIAnalysisResult", back_populates="doctor_validation")
    doctor = relationship("User", back_populates="doctor_validations")