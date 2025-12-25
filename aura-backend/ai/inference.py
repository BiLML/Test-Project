# aura-backend/ai/inference.py
import os
import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras.applications.efficientnet import preprocess_input

# --- CẤU HÌNH ĐƯỜNG DẪN MODEL (Đã cập nhật trỏ vào folder 'ai/') ---
MODEL_PATHS = {
    'EX': 'ai/unet_mega_fusion.keras',      
    'HE': 'ai/unet_hemorrhages.keras',      
    'SE': 'ai/unet_soft_exudates.keras',    
    'MA': 'ai/unet_microaneurysms.keras',   
    'OD': 'ai/unet_optic_disc.keras',       
    'Vessels': 'ai/unet_vessels_pro.keras', 
    'CLASSIFIER': 'ai/aura_retinal_model_final.keras' 
}

loaded_models = {}

print("⏳ [AI MODULE] ĐANG KHỞI ĐỘNG HỆ THỐNG AURA AI...")
for name, path in MODEL_PATHS.items():
    if os.path.exists(path):
        try:
            # compile=False để tránh lỗi hàm loss tùy chỉnh
            loaded_models[name] = tf.keras.models.load_model(path, compile=False)
            print(f"   ✅ Đã tải Module: {name}")
        except Exception as e:
            print(f"   ❌ Lỗi tải {name}: {e}")
    else:
        # Thử tìm ở thư mục gốc nếu chạy từ server
        print(f"   ⚠️ Không tìm thấy file tại {path}. Đang thử tìm đường dẫn tuyệt đối...")

print(f"🚀 [AI MODULE] SẴN SÀNG! ({len(loaded_models)}/{len(MODEL_PATHS)} modules)")

# --- CÁC HÀM XỬ LÝ ẢNH ---

def preprocess_for_segmentation(img_array, target_size=256):
    img = cv2.resize(img_array, (target_size, target_size))
    img = img / 255.0
    img = np.expand_dims(img, axis=0)
    return img

def preprocess_for_vessels_pro(img_array):
    img = cv2.resize(img_array, (512, 512))
    green_channel = img[:, :, 1]
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced_img = clahe.apply(green_channel)
    enhanced_img = enhanced_img / 255.0
    enhanced_img = np.expand_dims(enhanced_img, axis=-1)
    enhanced_img = np.expand_dims(enhanced_img, axis=0)
    return enhanced_img

def preprocess_for_classifier(img_array):
    img = cv2.resize(img_array, (224, 224))
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0,0), 10), -4, 128)
    img = preprocess_input(img)
    img = np.expand_dims(img, axis=0)
    return img

def clean_mask(mask_array, min_size=20):
    mask_uint8 = (mask_array * 255).astype(np.uint8)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    cleaned_mask = np.zeros_like(mask_uint8)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_size:
            cleaned_mask[labels == i] = 255
    return cleaned_mask.astype(np.float32) / 255.0

# --- HÀM INFERENCE CHÍNH (Được gọi từ Main) ---
def run_aura_inference(image_bytes):
    # 1. Đọc ảnh
    nparr = np.frombuffer(image_bytes, np.uint8)
    original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
    
    OUT_SIZE = 256
    
    # Preprocess
    input_standard = preprocess_for_segmentation(original_rgb, target_size=OUT_SIZE)
    input_vessels = preprocess_for_vessels_pro(original_rgb)
    input_classifier = preprocess_for_classifier(original_rgb)
    
    findings = {}
    combined_mask = np.zeros((OUT_SIZE, OUT_SIZE, 3))
    
    # --- PHẦN 1: SEGMENTATION ---
    if 'Vessels' in loaded_models:
        pred = loaded_models['Vessels'].predict(input_vessels, verbose=0)[0]
        pred = cv2.resize(pred, (OUT_SIZE, OUT_SIZE))
        mask = (pred > 0.5).astype(np.float32)
        findings['Vessels_Density'] = np.sum(mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask) 

    if 'OD' in loaded_models:
        pred = loaded_models['OD'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = (pred > 0.5).astype(np.float32)
        findings['OD_Area'] = np.sum(mask)
        combined_mask[:,:,2] = np.maximum(combined_mask[:,:,2], mask)

    if 'HE' in loaded_models:
        pred = loaded_models['HE'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = clean_mask((pred > 0.5).astype(np.float32), min_size=15)
        findings['HE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    if 'MA' in loaded_models:
        pred = loaded_models['MA'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = clean_mask((pred > 0.2).astype(np.float32), min_size=5)
        findings['MA_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)

    if 'EX' in loaded_models:
        pred = loaded_models['EX'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = clean_mask((pred > 0.5).astype(np.float32), min_size=20)
        findings['EX_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    if 'SE' in loaded_models:
        pred = loaded_models['SE'].predict(input_standard, verbose=0)[0,:,:,0]
        mask = clean_mask((pred > 0.3).astype(np.float32), min_size=20)
        findings['SE_Count'] = np.sum(mask)
        combined_mask[:,:,0] = np.maximum(combined_mask[:,:,0], mask)
        combined_mask[:,:,1] = np.maximum(combined_mask[:,:,1], mask)

    # --- PHẦN 2: CLASSIFICATION ---
    classifier_result = "Không xác định"
    classifier_confidence = 0.0
    if 'CLASSIFIER' in loaded_models:
        preds = loaded_models['CLASSIFIER'].predict(input_classifier, verbose=0)
        class_idx = np.argmax(preds[0])
        classifier_confidence = float(np.max(preds[0]))
        CLASS_MAP = {0: "Bình thường (No DR)", 1: "Nhẹ (Mild)", 2: "Trung bình (Moderate)", 3: "Nặng (Severe)", 4: "Tăng sinh (Proliferative)"}
        classifier_result = CLASS_MAP.get(class_idx, "Không xác định")

    # --- PHẦN 3: LOGIC HỘI CHẨN (RULE-BASED) ---
    he_count = findings.get('HE_Count', 0)
    ma_count = findings.get('MA_Count', 0)
    se_count = findings.get('SE_Count', 0)
    ex_count = findings.get('EX_Count', 0)
    vessels_density = findings.get('Vessels_Density', 5000)
    od_area = findings.get('OD_Area', 0)

    seg_diagnosis = "Bình thường (No DR)"
    dr_score = 0

    if he_count > 800 or se_count > 200: 
        seg_diagnosis = "Nặng (Severe NPDR)"; dr_score = 3
    elif he_count > 80 or ex_count > 150: 
        seg_diagnosis = "Trung bình (Moderate NPDR)"; dr_score = 2
    elif ma_count > 20 or he_count > 20: 
        seg_diagnosis = "Nhẹ (Mild NPDR)"; dr_score = 1
    
    final_diagnosis = seg_diagnosis
    warning_note = ""
    
    # Logic kết hợp Classifier cũ và Segmentation mới
    if "Bình thường" in classifier_result and classifier_confidence > 0.85:
        if seg_diagnosis == "Nhẹ (Mild NPDR)":
            final_diagnosis = "Bình thường (No DR)"; dr_score = 0
            warning_note = "\n✅ Đã lọc nhiễu: Các vi tổn thương phát hiện được đánh giá là không đáng kể."
    elif "Nặng" in classifier_result and seg_diagnosis == "Bình thường (No DR)":
        final_diagnosis = f"Nghi ngờ {classifier_result}"
        warning_note = "\n⚠️ CẢNH BÁO: AI tổng quan thấy dấu hiệu bệnh nặng dù tổn thương chưa rõ ràng."
        dr_score = 3

    # Tạo báo cáo text
    risk_report = []
    if dr_score >= 1:
        risk_report.append(f"🩸 TIỂU ĐƯỜNG: Phát hiện biến chứng ({final_diagnosis}).")
        if dr_score >= 3: risk_report.append("   ➜ CẢNH BÁO: Kiểm soát đường huyết kém. Nguy cơ biến chứng thận/thần kinh.")
        elif dr_score == 2: risk_report.append("   ➜ Bệnh đang tiến triển. Cần điều chỉnh lối sống.")
        else: risk_report.append("   ➜ Giai đoạn đầu. Theo dõi định kỳ.")
    else:
        risk_report.append("🩸 TIỂU ĐƯỜNG: Võng mạc khỏe mạnh.")

    risk_report.append("\n❤️ TIM MẠCH & HUYẾT ÁP:")
    if vessels_density < 2000: risk_report.append("⚠️ CẢNH BÁO: Mạch máu thưa/hẹp. Nguy cơ Cao huyết áp.")
    elif vessels_density > 15000: risk_report.append("⚠️ CẢNH BÁO: Mạch máu giãn bất thường.")
    else: risk_report.append("✅ Hệ thống mạch máu ổn định.")

    if od_area > 4500: risk_report.append("\n👁️ GLOCOM: ⚠️ Kích thước đĩa thị lớn, nghi ngờ lõm gai.")

    # Tạo ảnh Overlay
    img_resized = cv2.resize(original_rgb, (OUT_SIZE, OUT_SIZE)).astype(np.float32) / 255.0
    overlay = img_resized * (1 - combined_mask * 0.4) + combined_mask * 0.5
    overlay = np.clip(overlay * 255, 0, 255).astype(np.uint8)
    overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    
    detailed_risk_text = "\n".join(risk_report) + warning_note
    detailed_risk_text += f"\n\n--- THÔNG SỐ KỸ THUẬT ---\n• HE: {int(he_count)} | MA: {int(ma_count)} | EX+SE: {int(ex_count+se_count)}"

    return overlay_bgr, final_diagnosis, detailed_risk_text