# aura-backend/ai_service/main.py
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import cv2
import numpy as np
import io
import cloudinary
import cloudinary.uploader
import os
from dotenv import load_dotenv

# QUAN TRỌNG: Import từ file inference nằm NGAY BÊN CẠNH
from inference import run_aura_inference 
from pathlib import Path

current_file_path = Path(__file__).resolve()
env_path = current_file_path.parent.parent / '.env'
print(f' AI service loading .env from: {env_path}')

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    print("✅ Đã load file .env thành công!")
else:
    print("⚠️ CẢNH BÁO: Không tìm thấy file .env! Vui lòng kiểm tra lại đường dẫn.")

app = FastAPI(title="AI Core Microservice")

if not os.getenv("CLOUDINARY_CLOUD_NAME"):
    print("❌ LỖI: Chưa đọc được CLOUDINARY_CLOUD_NAME. Kiểm tra nội dung file .env")

cloudinary.config( 
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
    api_key = os.getenv("CLOUDINARY_API_KEY"), 
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure = True
)

class AIResponse(BaseModel):
    diagnosis_result: str
    detailed_risk: str
    annotated_image_url: str

@app.post("/analyze", response_model=AIResponse)
async def analyze_image(file: UploadFile = File(...)):
    print("🤖 AI Core: Nhận request...")
    try:
        content = await file.read()
        
        # Gọi hàm xử lý logic
        overlay_img, diagnosis_result, detailed_risk = run_aura_inference(content)
        
        # Encode ảnh kết quả
        is_success, buffer = cv2.imencode(".png", overlay_img)
        if not is_success: raise HTTPException(500, "Lỗi xử lý ảnh")
        
        # Upload Cloudinary
        upload_result = cloudinary.uploader.upload(
            io.BytesIO(buffer.tobytes()), 
            folder="aura_results", 
            resource_type="image"
        )
        
        return {
            "diagnosis_result": diagnosis_result,
            "detailed_risk": detailed_risk,
            "annotated_image_url": upload_result.get("secure_url")
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # CHẠY TRÊN PORT 8001
    uvicorn.run(app, host="0.0.0.0", port=8001)