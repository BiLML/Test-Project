import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Upload = () => {
    const navigate = useNavigate();
    
    // 1. Sửa state để lưu danh sách ảnh (Mảng)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // Xử lý khi chọn file (Hỗ trợ nhiều file)
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            // Chuyển FileList thành Mảng
            const filesArray = Array.from(e.target.files);
            
            // (Tùy chọn) Giới hạn 5 ảnh để tránh lag
            if (filesArray.length > 5) {
                alert("Vui lòng chỉ chọn tối đa 5 ảnh một lần.");
                return;
            }

            setSelectedFiles(filesArray);
            
            // Tạo URL preview cho từng ảnh
            const urls = filesArray.map(file => URL.createObjectURL(file));
            setPreviewUrls(urls);
        }
    };

    // Xử lý Upload
    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;

        setIsUploading(true);
        const token = localStorage.getItem('token');

        const formData = new FormData();
        // 2. QUAN TRỌNG: Append từng file với cùng key là 'files'
        selectedFiles.forEach((file) => {
            formData.append('files', file); 
        });

        try {
            const response = await fetch('http://127.0.0.1:8000/api/upload-eye-image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Đã gửi ${selectedFiles.length} ảnh thành công!`);
                
                // Chuyển hướng về Dashboard sau 1 giây
                setTimeout(() => navigate('/dashboard'), 1000);
            } else {
                alert("Upload thất bại. Vui lòng thử lại.");
            }
        } catch (error) {
            console.error("Lỗi:", error);
            alert("Lỗi kết nối server.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={{color: '#333'}}>📷 Tải ảnh đáy mắt</h2>
                <p style={{color: '#666', marginBottom: '20px'}}>
                    Chọn ảnh chụp võng mạc (Hỗ trợ tải nhiều ảnh).
                </p>

                {/* Khu vực Preview Ảnh (Dạng lưới) */}
                <div style={styles.previewArea}>
                    {previewUrls.length > 0 ? (
                        <div style={styles.grid}>
                            {previewUrls.map((url, idx) => (
                                <img key={idx} src={url} alt={`Preview ${idx}`} style={styles.imagePreview} />
                            ))}
                        </div>
                    ) : (
                        <div style={{color: '#aaa'}}>Chưa có ảnh nào được chọn</div>
                    )}
                </div>

                {/* Nút chọn file */}
                <input 
                    type="file" 
                    accept="image/*" 
                    multiple  // <--- QUAN TRỌNG: Cho phép chọn nhiều
                    onChange={handleFileChange} 
                    style={{marginTop: '20px'}}
                />

                {/* Nút Upload */}
                <div style={{marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center'}}>
                    <button 
                        onClick={() => navigate('/dashboard')} 
                        style={styles.cancelBtn}
                    >
                        Hủy bỏ
                    </button>
                    <button 
                        onClick={handleUpload} 
                        disabled={selectedFiles.length === 0 || isUploading}
                        style={isUploading ? styles.disabledBtn : styles.uploadBtn}
                    >
                        {isUploading ? 'Đang tải lên...' : `Phân tích ${selectedFiles.length > 0 ? `(${selectedFiles.length} ảnh)` : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// CSS Styles
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f6f9' },
    card: { backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '600px', width: '90%' },
    
    // Sửa lại vùng preview để hiển thị nhiều ảnh đẹp hơn
    previewArea: { 
        width: '100%', minHeight: '200px', maxHeight: '400px', overflowY: 'auto',
        backgroundColor: '#f8f9fa', border: '2px dashed #ccc', borderRadius: '8px', 
        display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px'
    },
    grid: { display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' },
    imagePreview: { width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd' },
    
    uploadBtn: { padding: '12px 24px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' },
    disabledBtn: { padding: '12px 24px', backgroundColor: '#ccc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'not-allowed' },
    cancelBtn: { padding: '12px 24px', backgroundColor: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' }
};

export default Upload;