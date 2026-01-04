import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaUser, FaEnvelope, FaPhone, FaArrowLeft, FaSave, 
    FaIdCard, FaGlobe, FaVenusMars, FaRulerVertical, FaWeight, 
    FaMapMarkerAlt, FaSignOutAlt, FaCamera, FaSpinner
} from 'react-icons/fa';

// --- INTERFACES ---
interface ProfileState {
    email: string;
    phone: string;
    age: string;
    hometown: string;
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
    const [userRole, setUserRole] = useState(''); // Để biết quay về dashboard nào
    const [profileData, setProfileData] = useState<ProfileState>({
        email: '', phone: '', age: '', hometown: '',
        insurance_id: '', height: '', weight: '', gender: '', nationality: '', full_name:''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- FETCH DATA ---
    useEffect(() => {
        const fetchProfileData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                const res = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error("Lỗi tải dữ liệu");
                
                const userData = await res.json();
                const info = userData.user_info;

                setUserName(info.userName);
                setUserRole(info.role);
                
                setProfileData({
                    email: info.email || '', 
                    phone: info.phone || '',
                    age: info.age || '',
                    hometown: info.hometown || '',
                    insurance_id: info.insurance_id || '',
                    height: info.height || '',
                    weight: info.weight || '',
                    gender: info.gender || '',
                    nationality: info.nationality || '',
                    full_name: info.full_name || ''
                });

            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfileData();
    }, [navigate]);

    // --- HANDLERS ---
    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async () => {
        const token = localStorage.getItem('token');
        setIsSaving(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/api/users/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(profileData)
            });
            const data = await res.json(); 
            if (res.ok) alert("Cập nhật hồ sơ thành công!");
            else alert(data.detail || "Lỗi khi lưu hồ sơ.");
        } catch (error) {
            console.error(error);
            alert("Lỗi kết nối server.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        if (userRole === 'CLINIC_OWNER') navigate('/clinic-dashboard');
        else navigate('/dashboard');
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    if (isLoading) return <div style={styles.loading}><FaSpinner className="spin" style={{marginRight: 10}}/> Đang tải hồ sơ...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR (Giống Dashboard nhưng tối giản cho trang Setting) */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <img src="/logo.svg" alt="Logo" style={{width:'30px'}} />
                        <span style={styles.logoText}>CÀI ĐẶT</span>
                    </div>
                    <div style={styles.clinicName}>Quản lý tài khoản</div>
                </div>
                <nav style={styles.nav}>
                    <div style={styles.menuItemActive}>
                        <FaUser style={styles.menuIcon} /> Hồ sơ cá nhân
                    </div>
                    <div style={styles.menuItem} onClick={handleBack}>
                        <FaArrowLeft style={styles.menuIcon} /> Quay lại Dashboard
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                {/* Header */}
                <header style={styles.header}>
                    <h2 style={styles.pageTitle}>Chỉnh sửa hồ sơ</h2>
                    <div style={styles.headerRight}>
                        <div style={styles.profileBox}>
                            <div style={styles.avatarCircle}>{userName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{profileData.full_name || userName}</span>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    <div style={styles.card}>
                        <div style={styles.cardHeader}>
                            <h3 style={{...styles.pageTitle, fontSize:'18px'}}>Thông tin chi tiết</h3>
                            <button onClick={handleSaveProfile} style={styles.primaryBtn} disabled={isSaving}>
                                {isSaving ? <><FaSpinner className="spin"/> Đang lưu...</> : <><FaSave style={{marginRight:5}}/> Lưu thay đổi</>}
                            </button>
                        </div>
                        
                        <div style={{padding: '30px'}}>
                            {/* Avatar Section */}
                            <div style={{display:'flex', alignItems:'center', marginBottom:'40px', paddingBottom:'30px', borderBottom:'1px solid #eee'}}>
                                <div style={{position:'relative', marginRight:'25px'}}>
                                    <div style={styles.largeAvatar}>{userName.charAt(0).toUpperCase()}</div>
                                    <button style={styles.cameraBtn}><FaCamera/></button>
                                </div>
                                <div>
                                    <h2 style={{margin:'0 0 5px 0', fontSize:'24px'}}>{profileData.full_name || userName}</h2>
                                    <p style={{color:'#666', margin:0}}>@{userName} • {userRole}</p>
                                </div>
                            </div>

                            {/* Form Grid */}
                            <div style={styles.formGrid}>
                                {/* Cột 1: Thông tin tài khoản */}
                                <div style={styles.sectionTitle}>1. Thông tin liên hệ</div>
                                <div style={styles.gridRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaUser style={styles.iconLabel}/> Họ và tên</label>
                                        <input type="text" name="full_name" value={profileData.full_name} onChange={handleProfileChange} style={styles.formInput} placeholder="Nhập họ tên đầy đủ" />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaEnvelope style={styles.iconLabel}/> Email</label>
                                        <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} style={styles.formInput} placeholder="email@example.com" />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaPhone style={styles.iconLabel}/> Số điện thoại</label>
                                        <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} style={styles.formInput} placeholder="09xxxxxxxx" />
                                    </div>
                                </div>

                                {/* Cột 2: Thông tin cá nhân */}
                                <div style={styles.sectionTitle}>2. Thông tin cá nhân</div>
                                <div style={styles.gridRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaIdCard style={styles.iconLabel}/> Mã BHYT</label>
                                        <input type="text" name="insurance_id" value={profileData.insurance_id} onChange={handleProfileChange} style={styles.formInput} placeholder="Mã bảo hiểm y tế" />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaVenusMars style={styles.iconLabel}/> Giới tính</label>
                                        <select name="gender" value={profileData.gender} onChange={handleProfileChange as any} style={styles.formInput}>
                                            <option value="">-- Chọn --</option>
                                            <option value="Male">Nam</option>
                                            <option value="Female">Nữ</option>
                                            <option value="Other">Khác</option>
                                        </select>
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaGlobe style={styles.iconLabel}/> Quốc tịch</label>
                                        <input type="text" name="nationality" value={profileData.nationality} onChange={handleProfileChange} style={styles.formInput} placeholder="Việt Nam" />
                                    </div>
                                </div>

                                {/* Cột 3: Chỉ số sức khỏe */}
                                <div style={styles.sectionTitle}>3. Chỉ số cơ bản</div>
                                <div style={styles.gridRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}>Tuổi</label>
                                        <input type="number" name="age" value={profileData.age} onChange={handleProfileChange} style={styles.formInput} />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaRulerVertical style={styles.iconLabel}/> Chiều cao (cm)</label>
                                        <input type="number" name="height" value={profileData.height} onChange={handleProfileChange} style={styles.formInput} />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}><FaWeight style={styles.iconLabel}/> Cân nặng (kg)</label>
                                        <input type="number" name="weight" value={profileData.weight} onChange={handleProfileChange} style={styles.formInput} />
                                    </div>
                                </div>

                                {/* Full width: Địa chỉ */}
                                <div style={{marginTop: '20px'}}>
                                    <label style={styles.formLabel}><FaMapMarkerAlt style={styles.iconLabel}/> Quê quán / Địa chỉ</label>
                                    <textarea name="hometown" rows={3} value={profileData.hometown} onChange={handleProfileChange} style={{...styles.formInput, resize:'vertical'}} placeholder="Nhập địa chỉ chi tiết..."></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Đồng bộ hoàn toàn với ClinicDashboard/Dashboard) ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', backgroundColor: '#f4f6f9' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
    // Sidebar Style
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'40px' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center', transition: '0.2s' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    logoutBtn: { width: '100%', padding: '10px', background: '#fff0f0', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' },

    // Main Layout
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'bold' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },
    pageTitle: { fontSize: '18px', margin: 0, color: '#333', fontWeight:'bold' },

    // Card & Form Styles
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px', maxWidth: '1000px', margin: '0 auto' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center', backgroundColor: '#fafbfc' },
    
    // Custom Profile Elements
    largeAvatar: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold' },
    cameraBtn: { position:'absolute', bottom:0, right:0, background:'white', border:'1px solid #ddd', borderRadius:'50%', width:'28px', height:'28px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555', boxShadow:'0 2px 4px rgba(0,0,0,0.1)' },
    
    formGrid: { display: 'flex', flexDirection: 'column', gap: '25px' },
    gridRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
    sectionTitle: { fontSize: '14px', fontWeight: '700', color: '#007bff', textTransform: 'uppercase', marginBottom: '10px', borderBottom: '2px solid #f0f0f0', paddingBottom: '5px', width: 'fit-content' },
    formGroup: { display: 'flex', flexDirection: 'column' },
    formLabel: { display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: '#444' },
    iconLabel: { color: '#888', marginRight: '5px', fontSize: '12px' },
    formInput: { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dde2e5', fontSize: '14px', outline: 'none', transition: 'border 0.2s', backgroundColor: '#fff', boxSizing:'border-box' },
    
    primaryBtn: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600', display:'flex', alignItems:'center', fontSize:'14px' },
};

// Thêm animation quay tròn cho spinner
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .spin { animation: spin 2s linear infinite; }`;
document.head.appendChild(styleSheet);

export default ProfilePage;