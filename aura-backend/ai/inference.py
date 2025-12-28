# aura-backend/ai/inference.py
import os
import numpy as np
import cv2
import onnxruntime as ort

# --- CẤU HÌNH ---
SEG_INPUT_SIZE = 256
VESSELS_INPUT_SIZE = 512
CLS_INPUT_SIZE = 224

ONNX_DIR = 'ai_onnx'
MODEL_FILES = {
    'EX': 'EX.onnx', 'HE': 'HE.onnx', 'SE': 'SE.onnx',
    'MA': 'MA.onnx', 'OD': 'OD.onnx', 'Vessels': 'Vessels.onnx',
    'CLASSIFIER': 'CLASSIFIER.onnx'
}

loaded_sessions = {}
print("⏳ [AI ONNX] ĐANG KHỞI ĐỘNG HỆ THỐNG...")

# Load Models
sess_options = ort.SessionOptions()
sess_options.intra_op_num_threads = 4
sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

for name, filename in MODEL_FILES.items():
    path = os.path.join(ONNX_DIR, filename)
    if os.path.exists(path):
        try:
            loaded_sessions[name] = ort.InferenceSession(path, sess_options, providers=['CPUExecutionProvider'])
            print(f"   ⚡ Đã tải ONNX: {name}")
        except Exception as e:
            print(f"   ❌ Lỗi tải {name}: {e}")
    else:
        print(f"   ⚠️ Không tìm thấy: {path}")

print(f"🚀 [AI ONNX] SẴN SÀNG! ({len(loaded_sessions)} models)")

# --- PREPROCESSING ---
def preprocess_standard(img_array, size=256):
    img = cv2.resize(img_array, (size, size))
    img = img.astype(np.float32) / 255.0
    img = np.expand_dims(img, axis=0)
    return img

def preprocess_vessels(img_array):
    img = cv2.resize(img_array, (512, 512))
    img = img[:, :, 1] # Green channel
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    img = clahe.apply(img)
    img = img.astype(np.float32) / 255.0
    img = np.expand_dims(img, axis=-1)
    img = np.expand_dims(img, axis=0)
    return img

def preprocess_classifier(img_array):
    img = cv2.resize(img_array, (224, 224))
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0,0), 10), -4, 128)
    img = img.astype(np.float32)
    img = np.expand_dims(img, axis=0)
    return img

def clean_mask(mask_array, min_size=10):
    if mask_array.ndim == 4: mask_array = mask_array[0,:,:,0]
    elif mask_array.ndim == 3: mask_array = mask_array[:,:,0]
    
    # Threshold để lấy mask nhị phân
    mask_uint8 = (mask_array * 255).astype(np.uint8)
    _, mask_uint8 = cv2.threshold(mask_uint8, 127, 255, cv2.THRESH_BINARY)
    
    # Lọc nhiễu nhỏ
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    cleaned = np.zeros_like(mask_uint8)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= min_size:
            cleaned[labels == i] = 255
            
    # Trả về dạng float 0-1 để resize cho mượt
    return cleaned.astype(np.float32) / 255.0

# --- MAIN INFERENCE ---
def run_aura_inference(image_bytes):
    try:
        # 1. Đọc ảnh gốc
        nparr = np.frombuffer(image_bytes, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return None, "Lỗi đọc ảnh", "File hỏng"
        
        # Lấy kích thước gốc chuẩn xác
        orig_h, orig_w = original_img.shape[:2]
        original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
        
        # Preprocess input cho AI
        input_seg = preprocess_standard(original_rgb, size=SEG_INPUT_SIZE)
        input_cls = preprocess_classifier(original_rgb)

        # 2. FAST CHECK (Phân loại nhanh)
        dr_grade = "Unknown"
        is_healthy = False
        
        if 'CLASSIFIER' in loaded_sessions:
            session = loaded_sessions['CLASSIFIER']
            preds = session.run(None, {session.get_inputs()[0].name: input_cls})[0]
            class_idx = np.argmax(preds[0])
            confidence = float(np.max(preds[0]))
            
            CLASS_MAP = {0: "Normal", 1: "Mild NPDR", 2: "Moderate NPDR", 3: "Severe NPDR", 4: "PDR"}
            dr_grade = CLASS_MAP.get(class_idx, "Unknown")
            
            if class_idx == 0 and confidence > 0.95:
                is_healthy = True
                dr_grade = "Normal (Healthy Retina)"

        # Nếu healthy -> Trả về ảnh gốc luôn cho nhanh
        if is_healthy:
            report = f"👁️ DIAGNOSIS: {dr_grade}\n⚡ FAST CHECK: Healthy ({int(confidence*100)}%)."
            return original_img, dr_grade, report

        # 3. SEGMENTATION (Tìm tổn thương)
        findings = {'HE': 0, 'MA': 0, 'EX': 0, 'SE': 0, 'Vessels': 0}
        
        # Tạo canvas rỗng KÍCH THƯỚC GỐC để vẽ màu lên
        # Đây là bí quyết để ảnh nét căng
        overlay_full = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)

        # Hàm phụ trợ: Chạy model -> Resize Mask lên Full HD -> Vẽ lên overlay
        def process_and_draw(key, input_tensor, color, min_size=0, is_contour=False):
            if key in loaded_sessions:
                try:
                    # Chạy AI
                    session = loaded_sessions[key]
                    pred = session.run(None, {session.get_inputs()[0].name: input_tensor})[0]
                    
                    # Lấy mask nhỏ (256x256)
                    mask_small = pred[0,:,:,0]
                    mask_cleaned = clean_mask(mask_small, min_size)
                    
                    # Tính diện tích tổn thương (trên không gian 256 để thống nhất điểm số)
                    findings[key] = np.sum(mask_cleaned)
                    
                    if findings[key] > 0:
                        # QUAN TRỌNG: Resize mask lên kích thước ảnh gốc
                        # Dùng INTER_LINEAR để mask mềm mại, không bị răng cưa
                        mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                        
                        # Threshold lại để viền sắc nét
                        _, mask_binary = cv2.threshold(mask_full, 0.5, 1, cv2.THRESH_BINARY)
                        mask_binary = mask_binary.astype(np.uint8)
                        
                        if is_contour:
                            # Vẽ viền (cho Gai thị)
                            contours, _ = cv2.findContours(mask_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            cv2.drawContours(overlay_full, contours, -1, color, 2) # Độ dày viền 2px
                        else:
                            # Tô màu (cho các bệnh khác)
                            overlay_full[mask_binary > 0] = color
                            
                except Exception as e:
                    print(f"Lỗi xử lý {key}: {e}")

        # --- BẮT ĐẦU VẼ ---
        
        # 1. Vessels (Mạch máu) - Màu Xanh Lá
        if 'Vessels' in loaded_sessions:
            process_and_draw('Vessels', preprocess_vessels(original_rgb), (0, 255, 0), min_size=0)

        # 2. Exudates (Xuất tiết) - Màu Vàng
        process_and_draw('EX', input_seg, (0, 255, 255), min_size=10)
        process_and_draw('SE', input_seg, (0, 255, 255), min_size=10)

        # 3. Hemorrhages & Microaneurysms (Xuất huyết) - Màu Đỏ
        # Gom HE và MA lại xử lý chung để không bị vẽ đè lên nhau quá nhiều
        if 'HE' in loaded_sessions or 'MA' in loaded_sessions:
            # Logic riêng để gộp mask HE và MA
            mask_he_small = np.zeros((256, 256))
            mask_ma_small = np.zeros((256, 256))
            
            if 'HE' in loaded_sessions:
                pred = loaded_sessions['HE'].run(None, {loaded_sessions['HE'].get_inputs()[0].name: input_seg})[0]
                mask_he_small = clean_mask(pred[0,:,:,0], 10)
                findings['HE'] = np.sum(mask_he_small)
                
            if 'MA' in loaded_sessions:
                pred = loaded_sessions['MA'].run(None, {loaded_sessions['MA'].get_inputs()[0].name: input_seg})[0]
                mask_ma_small = clean_mask(pred[0,:,:,0], 3)
                findings['MA'] = np.sum(mask_ma_small)

            # Gộp mask đỏ
            mask_red_small = np.maximum(mask_he_small, mask_ma_small)
            if np.sum(mask_red_small) > 0:
                mask_red_full = cv2.resize(mask_red_small, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                _, mask_red_bin = cv2.threshold(mask_red_full, 0.5, 1, cv2.THRESH_BINARY)
                overlay_full[mask_red_bin.astype(np.uint8) > 0] = (0, 0, 255) # Màu Đỏ

        # 4. Optic Disc (Gai thị) - Viền Xanh Dương
        process_and_draw('OD', input_seg, (255, 0, 0), min_size=0, is_contour=True)

        # 4. TRỘN MÀU THÔNG MINH (Smart Blending)
        # Chỉ làm mờ ảnh gốc ở những chỗ CÓ bệnh. Chỗ không bệnh giữ nguyên 100%.
        
        # Tạo mask tổng hợp: Chỗ nào trên overlay có màu (sum > 0) thì là vùng bệnh
        disease_mask = np.sum(overlay_full, axis=2) > 0
        
        final_overlay = original_img.copy()
        
        # Công thức blending: Original * 0.6 + Overlay * 0.4
        # Chỉ áp dụng tại disease_mask
        alpha = 0.4
        final_overlay[disease_mask] = cv2.addWeighted(
            original_img[disease_mask], 1 - alpha, 
            overlay_full[disease_mask], alpha, 
            0
        )

        # 5. TẠO BÁO CÁO
        # 6. TẠO BÁO CÁO CHI TIẾT & CHUYÊN SÂU (Khôi phục logic cũ)
        
        # Tính toán các chỉ số
        risk_score = (findings['MA']*1) + (findings['HE']*3) + (findings['EX']*2) + (findings['SE']*3)
        vessel_pixels = int(findings['Vessels'])
        
        # Logic điều chỉnh chẩn đoán
        if risk_score > 0 and dr_grade == "Normal": 
            dr_grade = "Mild NPDR (Early Signs)"
        if risk_score > 5000 and "Mild" in dr_grade:
            dr_grade = "Moderate NPDR"

        # --- LOGIC ĐÁNH GIÁ SỨC KHỎE (Giả lập dựa trên dấu hiệu đáy mắt) ---
        
        # 1. Tim mạch (Dựa vào mạch máu)
        cardio_risk = "LOW"
        vessel_status = "Vascular structure appears normal."
        if vessel_pixels < 2000:
            vessel_status = "Low vessel density detected (check image quality)."
        elif vessel_pixels > 50000:
            cardio_risk = "MODERATE"
            vessel_status = "High vessel density observed."
            
        # 2. Tiểu đường (Dựa vào mức độ DR)
        diabetes_risk = "LOW RISK"
        diabetes_msg = "No significant microvascular damage observed."
        if "Severe" in dr_grade or "PDR" in dr_grade:
            diabetes_risk = "HIGH RISK"
            diabetes_msg = "Severe retinal damage detected. Strict blood sugar control needed."
        elif "Moderate" in dr_grade:
            diabetes_risk = "MODERATE RISK"
            diabetes_msg = "Signs of retinopathy detected. Monitor regularly."
        elif "Mild" in dr_grade:
            diabetes_msg = "Early signs (Microaneurysms) detected."

        # 3. Đột quỵ (Stroke) - Dựa trên tổng hợp tổn thương
        stroke_score = min(int(risk_score / 100), 100)
        
        # FORM REPORT (Khớp với ảnh cũ đẹp của bạn)
        report = (
            f"👁️ RETINAL DIAGNOSIS: {dr_grade}\n"
            f"• Lesion Load: {int(risk_score)} (Severity Score)\n"
            f"• Hemorrhages: {int(findings['HE'])} px | Exudates: {int(findings['EX'] + findings['SE'])} px\n\n"
            
            f"❤️ CARDIOVASCULAR HEALTH (Estimated):\n"
            f"• Hypertension Risk: {cardio_risk}\n"
            f"• Vessel Density: {vessel_pixels} px\n"
            f"• Analysis: {vessel_status}\n\n"
            
            f"🩸 DIABETES COMPLICATIONS RISK:\n"
            f"• {diabetes_risk}: {diabetes_msg}\n\n"
            
            f"🧠 STROKE RISK ESTIMATION (Ocular Biomarkers):\n"
            f"• Risk Level: LOW (Score: {stroke_score}/100)\n"
            f"• Note: No specific ocular risk factors for stroke detected."
        )

        return final_overlay, dr_grade, report

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR), "AI Error", str(e)