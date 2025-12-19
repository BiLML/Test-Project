import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserMd, FaPhone, FaEnvelope, FaMapMarkerAlt, FaVenusMars, FaSave, FaArrowLeft, FaCamera } from 'react-icons/fa';

const ProfileDr: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [message, setMessage] = useState({ type: '', content: '' });

    // Dữ liệu profile
    const [profile, setProfile] = useState({
        userName: '',
        full_name: '',
        email: '',
        phone: '',
        gender: '',
        nationality: '',
        role: 'DOCTOR'
    });

    // --- 1. LẤY DỮ LIỆU TỪ SERVER ---
    useEffect(() => {
        const fetchProfile = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                const res = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    const info = data.user_info;
                    setProfile({
                        userName: info.userName || '',
                        full_name: info.full_name || '',
                        email: info.email || '',
                        phone: info.phone || '',
                        gender: info.gender || 'Nam',
                        nationality: info.nationality || 'Việt Nam',
                        role: info.role
                    });
                }
            } catch (error) {
                console.error("Lỗi tải hồ sơ:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [navigate]);

    // --- 2. LƯU DỮ LIỆU ---
    const handleSave = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/users/profile', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    full_name: profile.full_name,
                    email: profile.email,
                    phone: profile.phone,
                    gender: profile.gender,
                    nationality: profile.nationality
                })
            });

            if (res.ok) {
                setMessage({ type: 'success', content: 'Cập nhật hồ sơ thành công!' });
                setIsEditing(false);
            } else {
                setMessage({ type: 'error', content: 'Lỗi cập nhật. Vui lòng thử lại.' });
            }
        } catch (error) {
            setMessage({ type: 'error', content: 'Lỗi kết nối server.' });
        }
        
        setTimeout(() => setMessage({ type: '', content: '' }), 3000);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setProfile({ ...profile, [e.target.name]: e.target.value });
    };

    if (isLoading) return <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh'}}>Đang tải hồ sơ...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR MÀU TỐI (Chuẩn Bác sĩ) */}
            <aside style={styles.sidebar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="AURA" style={styles.logoImage}/>
                    <h2 style={{ margin: 0, fontSize: '20px', letterSpacing: '1px' }}>AURA Dr.</h2>
                </div>
                <button style={styles.backBtn} onClick={() => navigate('/dashboarddr')}>
                    <FaArrowLeft /> Quay lại Dashboard
                </button>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <div style={styles.profileCard}>
                    {/* Header */}
                    <div style={styles.cardHeader}>
                        <div style={styles.avatarWrapper}>
                            <div style={styles.avatar}>
                                {profile.userName.charAt(0).toUpperCase()}
                            </div>
                            {isEditing && <div style={styles.cameraIcon}><FaCamera color="white"/></div>}
                        </div>
                        <h2 style={{margin: '15px 0 5px', color: '#333'}}>{profile.full_name}</h2>
                        <span style={styles.roleBadge}>Bác sĩ</span>
                    </div>

                    {/* Form */}
                    <div style={styles.formContainer}>
                        <div style={styles.sectionTitle}>Thông tin cá nhân</div>
                        
                        {message.content && (
                            <div style={{...styles.alert, backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24'}}>
                                {message.content}
                            </div>
                        )}

                        <div style={styles.gridForm}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaUserMd style={styles.icon}/> Tên đăng nhập </label>
                                <input type="text" value={profile.userName} disabled style={{...styles.input, backgroundColor: '#f0f2f5'}} />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaEnvelope style={styles.icon}/> Họ và tên </label>
                                <input 
                                    type="text" name="full_name"
                                    value={profile.full_name} onChange={handleChange}
                                    disabled={!isEditing} 
                                    style={isEditing ? styles.inputActive : styles.input} 
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaEnvelope style={styles.icon}/> Email</label>
                                <input 
                                    type="email" name="email"
                                    value={profile.email} onChange={handleChange}
                                    disabled={!isEditing} 
                                    style={isEditing ? styles.inputActive : styles.input} 
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaPhone style={styles.icon}/> Số điện thoại</label>
                                <input 
                                    type="text" name="phone"
                                    value={profile.phone} onChange={handleChange}
                                    disabled={!isEditing} 
                                    style={isEditing ? styles.inputActive : styles.input} 
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaVenusMars style={styles.icon}/> Giới tính</label>
                                <select 
                                    name="gender" value={profile.gender} onChange={handleChange}
                                    disabled={!isEditing} 
                                    style={isEditing ? styles.inputActive : styles.input}
                                >
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}><FaMapMarkerAlt style={styles.icon}/> Quốc tịch</label>
                                <input 
                                    type="text" name="nationality"
                                    value={profile.nationality} onChange={handleChange}
                                    disabled={!isEditing} 
                                    style={isEditing ? styles.inputActive : styles.input} 
                                />
                            </div>
                        </div>

                        {/* Buttons */}
                        <div style={styles.actionButtons}>
                            {isEditing ? (
                                <>
                                    <button style={styles.cancelBtn} onClick={() => setIsEditing(false)}>Hủy bỏ</button>
                                    <button style={styles.saveBtn} onClick={handleSave}><FaSave /> Lưu thay đổi</button>
                                </>
                            ) : (
                                <button style={styles.editBtn} onClick={() => setIsEditing(true)}>Chỉnh sửa hồ sơ</button>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', width: '100vw', minHeight: '100vh', backgroundColor: '#f4f6f9', fontFamily: "'Segoe UI', sans-serif" },
    sidebar: { width: '260px', backgroundColor: '#34495e', color: 'white', display: 'flex', flexDirection: 'column', padding: '30px 20px', alignItems: 'center' },
    logoArea: { textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    logoImage: { width: '60px', marginBottom: '10px', filter: 'brightness(0) invert(1)' },
    backBtn: { background: 'none', border: '1px solid #7f8c8d', padding: '10px 20px', color: '#ecf0f1', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s', width: '100%', justifyContent: 'center' },
    
    main: { flex: 1, padding: '40px', display: 'flex', justifyContent: 'center', overflowY: 'auto' },
    profileCard: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', width: '100%', maxWidth: '800px', height: 'fit-content' },
    
    cardHeader: { backgroundColor: '#fff', padding: '40px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid #eee', position: 'relative' },
    avatarWrapper: { position: 'relative' },
    avatar: { width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#e74c3c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', fontWeight: 'bold', border: '4px solid white', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' },
    cameraIcon: { position: 'absolute', bottom: '0', right: '0', backgroundColor: '#34495e', padding: '8px', borderRadius: '50%', cursor: 'pointer', border: '2px solid white' },
    roleBadge: { backgroundColor: '#dff9fb', color: '#130f40', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' },

    formContainer: { padding: '40px' },
    sectionTitle: { fontSize: '18px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '20px', borderLeft: '4px solid #e74c3c', paddingLeft: '10px' },
    alert: { padding: '10px', borderRadius: '5px', marginBottom: '20px', textAlign: 'center', fontSize: '14px' },
    
    gridForm: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontSize: '14px', color: '#7f8c8d', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' },
    icon: { color: '#e74c3c' },
    
    input: { padding: '10px 15px', borderRadius: '8px', border: '1px solid #eee', fontSize: '15px', outline: 'none', color: '#555', backgroundColor: 'white' },
    inputActive: { padding: '10px 15px', borderRadius: '8px', border: '1px solid #3498db', fontSize: '15px', outline: 'none', color: '#333', backgroundColor: '#fdfdfd' },

    actionButtons: { marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '15px' },
    editBtn: { padding: '10px 25px', borderRadius: '8px', border: 'none', backgroundColor: '#34495e', color: 'white', cursor: 'pointer', fontWeight: '600' },
    saveBtn: { padding: '10px 25px', borderRadius: '8px', border: 'none', backgroundColor: '#e74c3c', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' },
    cancelBtn: { padding: '10px 25px', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: 'white', color: '#666', cursor: 'pointer', fontWeight: '600' }
};

export default ProfileDr;