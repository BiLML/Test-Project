from pydantic import BaseModel
class Payment(BaseModel):
    user_id: str
    amount: float