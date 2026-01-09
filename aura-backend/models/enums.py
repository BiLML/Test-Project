import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"   # Đổi thành chữ thường
    USER = "user"     # Khớp với yêu cầu sửa PATIENT -> USER của bạn
    DOCTOR = "doctor"
    CLINIC = "clinic"

class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"

class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class EyeSide(str, enum.Enum):
    LEFT = "left"
    RIGHT = "right"

class ImageType(str, enum.Enum):
    FUNDUS = "fundus"
    OCT = "oct"

# Cập nhật RiskLevel để khớp với các nhãn chẩn đoán từ AI Core
class RiskLevel(str, enum.Enum):
    NORMAL = "Normal"
    MILD = "Mild NPDR (Early Signs)"
    MODERATE = "Moderate NPDR"
    SEVERE = "Severe NPDR"
    PDR = "PDR"
    UNKNOWN = "Unknown"

class ClinicStatus(str, enum.Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PENDING = "PENDING"