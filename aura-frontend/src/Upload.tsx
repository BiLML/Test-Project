import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Upload = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // State phân quyền & dữ liệu
    const [role, setRole] = useState<string>('');
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');

    // 1. LẤY ROLE CHÍNH XÁC TỪ SERVER KHI LOAD TRANG
    useEffect(() => {
        const fetchUserAndPatients = async () => {
            const token = localStorage.getItem('token');
            if (!token) return navigate('/login');

            try {
                // A. Lấy thông tin user hiện tại để biết Role chính xác
                const userRes = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (userRes.ok) {
                    const userData = await userRes.json();
                    const currentRole = userData.user_info.role.toUpperCase(); // CLINIC_OWNER / DOCTOR / USER
                    setRole(currentRole);

                    // B. Nếu là Phòng khám -> Lấy danh sách bệnh nhân
                    if (['CLINIC_OWNER', 'DOCTOR'].includes(currentRole)) {
                        const clinicRes = await fetch('http://127.0.0.1:8000/api/clinic/dashboard-data', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (clinicRes.ok) {
                            const clinicData = await clinicRes.json();
                            setPatients(clinicData.patients || []);
                        }
                    }
                }
            } catch (error) {
                console.error("Lỗi khởi tạo:", error);
            }
        };

        fetchUserAndPatients();
    }, [navigate]);

    // 2. Xử lý chọn ảnh
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            if (filesArray.length > 5) {
                alert("Vui lòng chỉ chọn tối đa 5 ảnh một lần.");
                return;
            }
            setSelectedFiles(filesArray);
            const urls = filesArray.map(file => URL.createObjectURL(file));
            setPreviewUrls(urls);
        }
    };

    // 3. Xử lý Upload
    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;
        setIsUploading(true);
        const token = localStorage.getItem('token');
        
        // Kiểm tra role trực tiếp từ state đã fetch
        const isClinic = ['CLINIC_OWNER', 'DOCTOR'].includes(role);

        try {
            // --- TRƯỜNG HỢP 1: PHÒNG KHÁM ---
            if (isClinic) {
                for (const file of selectedFiles) {
                    const formData = new FormData();
                    formData.append('file', file);
                    if (selectedPatientId) {
                        formData.append('patient_id', selectedPatientId);
                    }

                    const response = await fetch('http://127.0.0.1:8000/api/clinic/upload-scan', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    
                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.detail || "Lỗi upload clinic");
                    }
                }
                alert("Phân tích hoàn tất! Đang chuyển về trang quản lý...");
                setTimeout(() => navigate('/clinic-dashboard'), 1000); // -> VỀ CLINIC DASHBOARD
            } 
            
            // --- TRƯỜNG HỢP 2: USER THƯỜNG ---
            else {
                const formData = new FormData();
                selectedFiles.forEach((file) => formData.append('files', file)); 

                const response = await fetch('http://127.0.0.1:8000/api/upload-eye-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    alert(`Đã gửi ${selectedFiles.length} ảnh thành công!`);
                    setTimeout(() => navigate('/dashboard'), 1000); // -> VỀ USER DASHBOARD
                } else {
                    alert("Upload thất bại.");
                }
            }
        } catch (error) {
            console.error("Lỗi:", error);
            alert("Có lỗi xảy ra: " + error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={{color: '#333'}}>📷 Phân tích AI</h2>
                <p style={{color: '#666', marginBottom: '20px'}}>
                    {['CLINIC_OWNER', 'DOCTOR'].includes(role) 
                        ? "Chế độ Bác sĩ: Chọn bệnh nhân và tải ảnh chụp đáy mắt." 
                        : "Chế độ Cá nhân: Tải ảnh chụp đáy mắt của bạn."}
                </p>

                {/* Dropdown chọn bệnh nhân (Chỉ hiện cho Clinic/Doctor) */}
                {['CLINIC_OWNER', 'DOCTOR'].includes(role) && (
                    <div style={{marginBottom: '20px', textAlign: 'left'}}>
                        <label style={{fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>Chọn Bệnh nhân (Tùy chọn):</label>
                        <select 
                            style={styles.selectInput}
                            value={selectedPatientId}
                            onChange={(e) => setSelectedPatientId(e.target.value)}
                        >
                            <option value="">-- Khách vãng lai / Không chọn --</option>
                            {patients.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.full_name} ({p.phone || p.email})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={styles.previewArea}>
                    {previewUrls.length > 0 ? (
                        <div style={styles.grid}>
                            {previewUrls.map((url, idx) => (
                                <img key={idx} src={url} alt={`Preview ${idx}`} style={styles.imagePreview} />
                            ))}
                        </div>
                    ) : (
                        <div style={{color: '#aaa', marginTop: '20px'}}>Chưa có ảnh nào được chọn</div>
                    )}
                </div>

                <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{marginTop: '20px'}} />

                <div style={{marginTop: '30px', display: 'flex', gap: '10px', justifyContent: 'center'}}>
                    <button onClick={() => navigate(-1)} style={styles.cancelBtn}>Quay lại</button>
                    <button 
                        onClick={handleUpload} 
                        disabled={selectedFiles.length === 0 || isUploading}
                        style={isUploading || selectedFiles.length === 0 ? styles.disabledBtn : styles.uploadBtn}
                    >
                        {isUploading ? 'Đang xử lý...' : `Tiến hành Phân tích`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// CSS Styles (Giữ nguyên)
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f6f9' },
    card: { backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '600px', width: '90%' },
    previewArea: { width: '100%', minHeight: '150px', maxHeight: '300px', overflowY: 'auto', backgroundColor: '#f8f9fa', border: '2px dashed #ccc', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' },
    grid: { display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' },
    imagePreview: { width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd' },
    selectInput: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' },
    uploadBtn: { padding: '12px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' },
    disabledBtn: { padding: '12px 30px', backgroundColor: '#ccc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'not-allowed', fontSize: '16px' },
    cancelBtn: { padding: '12px 24px', backgroundColor: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' }
};

export default Upload;