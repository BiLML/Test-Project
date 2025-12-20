import React, { useState, useEffect } from 'react';
import { BiFullscreen } from 'react-icons/bi';
import { useNavigate } from 'react-router-dom';

// Định nghĩa kiểu dữ liệu Profile mới
interface ProfileState {
    email: string;
    phone: string;
    age: string;
    hometown: string;
    // --- TRƯỜNG MỚI ---
    insurance_id: string; 
    height: string; 
    weight: string; 
    gender: string; 
    nationality: string; 
    full_name: string;
}

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE DỮ LIỆU ---
    const [userName, setUserName] = useState('');
    const [profileData, setProfileData] = useState<ProfileState>({
        email: '',
        phone: '',
        age: '',
        hometown: '',
        // --- GIÁ TRỊ KHỞI TẠO CHO TRƯỜNG MỚI ---
        insurance_id: '',
        height: '',
        weight: '',
        gender: '',
        nationality: '',
        full_name:''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- 1. HÀM TẢI DỮ LIỆU HIỆN TẠI TỪ BACKEND ---
    useEffect(() => {
        const fetchProfileData = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            try {
                const res = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error("Lỗi xác thực hoặc không tìm thấy user.");
                
                const userData = await res.json();
                const info = userData.user_info;

                setUserName(info.userName);
                
                // Cập nhật state với dữ liệu hiện tại từ Backend (Bao gồm trường mới)
                setProfileData({
                    email: info.email || '', 
                    phone: info.phone || '',
                    age: info.age || '',
                    hometown: info.hometown || '',
                    // --- ĐỒNG BỘ TRƯỜNG MỚI ---
                    insurance_id: info.insurance_id || '',
                    height: info.height || '',
                    weight: info.weight || '',
                    gender: info.gender || '',
                    nationality: info.nationality || '',
                    full_name: info.full_name || ''

                });

            } catch (error) {
                console.error("Lỗi tải hồ sơ:", error);
                alert("Lỗi khi tải thông tin hồ sơ.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfileData();
    }, [navigate]);

    // --- 2. XỬ LÝ NHẬP LIỆU ---
    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    // --- 3. HÀM LƯU HỒ SƠ (GỌI API PUT) ---
    const handleSaveProfile = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        setIsSaving(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/api/users/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            const data = await res.json(); 

            if (res.ok) {
                alert("Cập nhật hồ sơ thành công!");
                // Không cần navigate, giữ người dùng ở đây
            } else {
                alert(data.detail || "Lỗi khi lưu hồ sơ. Vui lòng thử lại.");
            }
        } catch (error) {
            console.error("Lỗi API Profile:", error);
            alert("Không thể kết nối đến server.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div style={styles.loading}>Đang tải hồ sơ...</div>;
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>&larr; Quay lại</button>
                    <h2 style={{margin: 0}}>👤 Hồ sơ Cá nhân</h2>
                    <div style={{width: '60px'}}></div>
                </div>
                
                <div style={styles.userSummary}>
                    <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
                    <h3>{profileData.full_name}</h3>
                    <p style={{color: '#666'}}>Quản lý thông tin chi tiết</p>
                </div>

                {/* --- GRID MỚI: 3 CỘT CHO DỮ LIỆU NHỎ --- */}
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Tên đăng nhập</label>
                        <input type="text" value={userName} style={{...styles.input, backgroundColor: '#f0f0f0', cursor: 'not-allowed'}} disabled />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Họ và tên</label>
                        <input type="text" name="full_name" value={profileData.full_name} onChange={handleProfileChange} style={styles.input} placeholder="VD: Nguyễn Văn A" />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Email</label>
                        <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} style={styles.input} placeholder="nhap@email.com" />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Số điện thoại</label>
                        <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} style={styles.input} placeholder="09xx..." />
                    </div>
                    
                    {/* HÀNG 2 - 3 CỘT: CÁC TRƯỜNG MỚI */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Mã Bảo hiểm Y tế</label>
                        <input type="text" name="insurance_id" value={profileData.insurance_id} onChange={handleProfileChange} style={styles.input} placeholder="Mã BHYT (nếu có)" />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Giới tính</label>
                        <select name="gender" value={profileData.gender} onChange={handleProfileChange as any} style={styles.input}>
                            <option value="">Chọn</option>
                            <option value="Male">Nam</option>
                            <option value="Female">Nữ</option>
                            <option value="Other">Khác</option>
                        </select>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Quốc tịch</label>
                        <input type="text" name="nationality" value={profileData.nationality} onChange={handleProfileChange} style={styles.input} placeholder="Ví dụ: Việt Nam" />
                    </div>

                    {/* HÀNG 3 - Dữ liệu sức khỏe */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Tuổi</label>
                        <input type="number" name="age" value={profileData.age} onChange={handleProfileChange} style={styles.input} placeholder="Nhập tuổi" />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Chiều cao (cm)</label>
                        <input type="number" name="height" value={profileData.height} onChange={handleProfileChange} style={styles.input} placeholder="Ví dụ: 175" />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Cân nặng (kg)</label>
                        <input type="number" name="weight" value={profileData.weight} onChange={handleProfileChange} style={styles.input} placeholder="Ví dụ: 65" />
                    </div>

                    {/* TRƯỜNG DÀI NHẤT (Quê quán) */}
                    <div style={{...styles.formGroup, gridColumn: '1 / -1'}}>
                        <label style={styles.label}>Quê quán/Địa chỉ liên hệ</label>
                        <textarea 
                            name="hometown"
                            value={profileData.hometown}
                            onChange={handleProfileChange}
                            style={styles.textArea} 
                            rows={3}
                            placeholder="Nhập địa chỉ..."
                        ></textarea>
                    </div>
                </div>

                <div style={styles.footer}>
                    <button onClick={() => navigate('/dashboard')} style={styles.secondaryBtn} disabled={isSaving}>
                        Hủy bỏ
                    </button>
                    <button onClick={handleSaveProfile} style={styles.primaryBtn} disabled={isSaving}>
                        {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', color: '#666' },
    container: { minHeight: '100vh', backgroundColor: '#f4f6f9', padding: '40px 20px', fontFamily: "'Segoe UI', sans-serif" },
    card: { backgroundColor: 'white', maxWidth: '900px', margin: '0 auto', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', padding: '30px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '20px', marginBottom: '30px' },
    backBtn: { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    
    userSummary: { textAlign: 'center', marginBottom: '30px' },
    avatar: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold', margin: '0 auto 15px' },

    formGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '14px', fontWeight: '500', color: '#444' },
    input: { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none' },
    textArea: { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none', resize: 'vertical' },
    
    footer: { borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    primaryBtn: { backgroundColor: '#007bff', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: '0.2s' },
    secondaryBtn: { backgroundColor: '#e2e8f0', color: '#475569', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
};

export default ProfilePage;