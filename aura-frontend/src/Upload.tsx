import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Upload = () => {
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    // Xử lý khi người dùng chọn file
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            // Tạo link preview ảnh để hiện lên màn hình
            setPreviewUrl(URL.createObjectURL(file));
            setUploadSuccess(false);
        }
    };

    // Xử lý khi bấm nút Upload
    const handleUpload = async () => {
        if (!selectedFile) return;

        setIsUploading(true);
        const token = localStorage.getItem('token'); // Lấy thẻ bài

        // Tạo Form Data để gửi file
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch('http://127.0.0.1:8000/api/upload-eye-image', {
                method: 'POST',
                headers: {
                    // Lưu ý: Khi gửi FormData, KHÔNG cần header 'Content-Type': 'application/json'
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                setUploadSuccess(true);
                alert("Upload thành công! Ảnh đã được gửi đến AI.");
                // Có thể chuyển hướng về Dashboard hoặc trang Lịch sử
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
                    Vui lòng chọn ảnh chụp võng mạc rõ nét để AI phân tích tốt nhất.
                </p>

                {/* Khu vực Preview Ảnh */}
                <div style={styles.previewArea}>
                    {previewUrl ? (
                        <img src={previewUrl} alt="Preview" style={styles.imagePreview} />
                    ) : (
                        <div style={{padding: '40px', color: '#aaa'}}>Chưa có ảnh nào được chọn</div>
                    )}
                </div>

                {/* Nút chọn file */}
                <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    style={{marginTop: '20px'}}
                />

                {/* Nút Upload */}
                <div style={{marginTop: '20px', display: 'flex', gap: '10px'}}>
                    <button 
                        onClick={() => navigate('/dashboard')} 
                        style={styles.cancelBtn}
                    >
                        Hủy bỏ
                    </button>
                    <button 
                        onClick={handleUpload} 
                        disabled={!selectedFile || isUploading}
                        style={isUploading ? styles.disabledBtn : styles.uploadBtn}
                    >
                        {isUploading ? 'Đang tải lên...' : '🚀 Bắt đầu Phân tích'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// CSS đơn giản
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f6f9' },
    card: { backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '500px', width: '90%' },
    previewArea: { width: '100%', height: '300px', backgroundColor: '#f8f9fa', border: '2px dashed #ccc', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    imagePreview: { width: '100%', height: '100%', objectFit: 'contain' },
    uploadBtn: { padding: '12px 24px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' },
    disabledBtn: { padding: '12px 24px', backgroundColor: '#ccc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'not-allowed' },
    cancelBtn: { padding: '12px 24px', backgroundColor: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' }
};

export default Upload;