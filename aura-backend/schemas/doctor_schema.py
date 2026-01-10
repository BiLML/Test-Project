from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LatestScan(BaseModel):
    record_id: Optional[str] = None
    ai_result: Optional[str] = "Chưa khám"
    ai_analysis_status: Optional[str] = "PENDING"
    upload_date: Optional[datetime] = None

class PatientResponse(BaseModel):
    id: str
    userName: str
    full_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    latest_scan: Optional[LatestScan] = None

class MyPatientsResponse(BaseModel):
    patients: List[PatientResponse]