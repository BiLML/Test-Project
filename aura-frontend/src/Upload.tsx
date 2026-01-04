import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaCloudUploadAlt, FaTimes, FaSpinner, FaArrowLeft, 
    FaUserMd, FaRobot, FaHome, FaSignOutAlt, FaImages, FaUser
} from 'react-icons/fa';

const Upload: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI & DATA ---
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    
    // State User Info
    const [role, setRole] = useState<string>('');
    const [userName, setUserName] = useState<string>('User');
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 1. FETCH DATA & ROLE ---
    useEffect(() => {
        const fetchInitData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                // A. Lấy thông tin user
                const userRes = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (userRes.ok) {
                    const userData = await userRes.json();
                    const currentRole = userData.user_info.role.toUpperCase();
                    setRole(currentRole);
                    setUserName(userData.user_info.full_name || userData.user_info.userName);

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
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitData();
    }, [navigate]);

    // --- 2. HANDLERS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            if (filesArray.length + selectedFiles.length > 5) {
                alert("Vui lòng chỉ chọn tối đa 5 ảnh một lần.");
                return;
            }
            
            const newFiles = [...selectedFiles, ...filesArray];
            const newUrls = [...previewUrls, ...filesArray.map(file => URL.createObjectURL(file))];
            
            setSelectedFiles(newFiles);
            setPreviewUrls(newUrls);
        }
    };

    const removeFile = (index: number) => {
        const newFiles = selectedFiles.filter((_, i) => i !== index);
        const newUrls = previewUrls.filter((_, i) => i !== index);
        setSelectedFiles(newFiles);
        setPreviewUrls(newUrls);
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;
        setIsUploading(true);
        const token = localStorage.getItem('token');
        const isClinic = ['CLINIC_OWNER', 'DOCTOR'].includes(role);

        try {
            if (isClinic) {
                // Upload từng ảnh cho Clinic
                for (const file of selectedFiles) {
                    const formData = new FormData();
                    formData.append('file', file);
                    if (selectedPatientId) formData.append('patient_id', selectedPatientId);

                    const response = await fetch('http://127.0.0.1:8000/api/clinic/upload-scan', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    if (!response.ok) throw new Error("Lỗi upload");
                }
                alert("Phân tích hoàn tất!");
                navigate('/clinic-dashboard');
            } else {
                // Upload mảng ảnh cho User
                const formData = new FormData();
                selectedFiles.forEach((file) => formData.append('files', file)); 

                const response = await fetch('http://127.0.0.1:8000/api/upload-eye-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    alert("Upload thành công!");
                    navigate('/dashboard');
                } else {
                    alert("Upload thất bại.");
                }
            }
        } catch (error) {
            console.error(error);
            alert("Có lỗi xảy ra khi upload.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login'); };
    const goBack = () => {
        if(['CLINIC_OWNER', 'DOCTOR'].includes(role)) navigate('/clinic-dashboard');
        else navigate('/dashboard');
    };

    if (isLoading) return <div style={styles.loading}><FaSpinner className="spin"/> Đang tải...</div>;

    // --- RENDER SIDEBAR CONTENT DYNAMICALLY ---
    const renderSidebarNav = () => {
        if (['CLINIC_OWNER', 'DOCTOR'].includes(role)) {
            return (
                <nav style={styles.nav}>
                    <div style={styles.menuItem} onClick={goBack}><FaUserMd style={styles.menuIcon} /> Tổng hợp</div>
                    <div style={styles.menuItemActive}><FaRobot style={styles.menuIcon} /> Phân tích AI</div>
                    <div style={styles.menuItem} onClick={goBack}><FaArrowLeft style={styles.menuIcon} /> Quay lại</div>
                </nav>
            );
        }
        return (
            <nav style={styles.nav}>
                <div style={styles.menuItem} onClick={goBack}><FaHome style={styles.menuIcon} /> Trang chủ</div>
                <div style={styles.menuItemActive}><FaImages style={styles.menuIcon} /> Tải ảnh mới</div>
                <div style={styles.menuItem} onClick={goBack}><FaArrowLeft style={styles.menuIcon} /> Quay lại</div>
            </nav>
        );
    };

    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <img src="/logo.svg" alt="Logo" style={{width:'30px'}} />
                        <span style={styles.logoText}>AI SCANNER</span>
                    </div>
                    <div style={styles.clinicName}>{['CLINIC_OWNER', 'DOCTOR'].includes(role) ? 'Dành cho Bác sĩ' : 'Cá nhân'}</div>
                </div>
                {renderSidebarNav()}
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <h2 style={styles.pageTitle}>Tải ảnh phân tích</h2>
                    <div style={styles.headerRight}>
                        <div style={styles.profileBox}>
                            <div style={styles.avatarCircle}>{userName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{userName}</span>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    <div style={styles.card}>
                        <div style={styles.cardHeader}>
                            <h3 style={styles.sectionTitle}>
                                {['CLINIC_OWNER', 'DOCTOR'].includes(role) ? '1. Chọn Hồ sơ & Hình ảnh' : '1. Tải lên hình ảnh'}
                            </h3>
                        </div>

                        <div style={{padding: '30px'}}>
                            {/* SELECT PATIENT (CLINIC ONLY) */}
                            {['CLINIC_OWNER', 'DOCTOR'].includes(role) && (
                                <div style={{marginBottom: '25px'}}>
                                    <label style={styles.formLabel}>Chọn Bệnh nhân (Tùy chọn)</label>
                                    <div style={{display:'flex', gap:'10px'}}>
                                        <select 
                                            style={styles.selectInput}
                                            value={selectedPatientId}
                                            onChange={(e) => setSelectedPatientId(e.target.value)}
                                        >
                                            <option value="">-- Không chọn --</option>
                                            {patients.map(p => (
                                                <option key={p.id} value={p.id}>{p.full_name} - {p.phone}</option>
                                            ))}
                                        </select>
                                        <button style={styles.secondaryBtn} onClick={()=>navigate('/clinic-dashboard')}>+ Tạo mới</button>
                                    </div>
                                    <p style={{fontSize:'12px', color:'#666', marginTop:'5px'}}>Nếu không chọn, kết quả sẽ được lưu vào mục "Chưa phân công".</p>
                                </div>
                            )}

                            {/* UPLOAD ZONE */}
                            <div 
                                style={styles.uploadZone} 
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input 
                                    type="file" 
                                    hidden 
                                    ref={fileInputRef} 
                                    accept="image/*" 
                                    multiple 
                                    onChange={handleFileChange} 
                                />
                                <div style={styles.uploadIconCircle}>
                                    <FaCloudUploadAlt size={40} color="#007bff" />
                                </div>
                                <h4 style={{margin:'15px 0 5px', color:'#333'}}>Nhấn để tải ảnh lên</h4>
                                <p style={{color:'#888', fontSize:'13px', margin:0}}>Hỗ trợ JPG, PNG. Tối đa 5 ảnh/lần.</p>
                            </div>

                            {/* PREVIEW GRID */}
                            {selectedFiles.length > 0 && (
                                <div style={{marginTop: '25px'}}>
                                    <h4 style={{fontSize:'14px', marginBottom:'10px', color:'#555'}}>Ảnh đã chọn ({selectedFiles.length})</h4>
                                    <div style={styles.previewGrid}>
                                        {previewUrls.map((url, idx) => (
                                            <div key={idx} style={styles.previewItem}>
                                                <img src={url} alt="Preview" style={styles.previewImage} />
                                                <button onClick={() => removeFile(idx)} style={styles.removeBtn}><FaTimes/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ACTIONS */}
                            <div style={styles.actionFooter}>
                                <button onClick={goBack} style={styles.secondaryBtnLarge}>Hủy bỏ</button>
                                <button 
                                    onClick={handleUpload} 
                                    disabled={selectedFiles.length === 0 || isUploading}
                                    style={selectedFiles.length === 0 || isUploading ? styles.disabledBtn : styles.primaryBtnLarge}
                                >
                                    {isUploading ? <><FaSpinner className="spin" style={{marginRight:8}}/> Đang xử lý AI...</> : <><FaRobot style={{marginRight:8}}/> Phân tích ngay</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Đồng bộ với hệ thống Dashboard) ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', background:'#f4f6f9' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
    // Sidebar
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'40px' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center', transition:'0.2s' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    logoutBtn: { width: '100%', padding: '10px', background: '#fff0f0', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' },

    // Main
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    pageTitle: { fontSize: '18px', margin: 0, color: '#333', fontWeight:'bold' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'bold' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto', display:'flex', justifyContent:'center' },

    // Card & Content
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', width: '100%', maxWidth: '800px', height: 'fit-content' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f0f0f0', backgroundColor:'#fafbfc' },
    sectionTitle: { fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 },
    
    // Form Elements
    formLabel: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#444' },
    selectInput: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #dde2e5', fontSize: '14px', outline: 'none', backgroundColor: '#fff' },
    
    // Upload Zone
    uploadZone: { border: '2px dashed #007bff', borderRadius: '12px', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fbff', cursor: 'pointer', transition: 'background 0.2s' },
    uploadIconCircle: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#e6f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' },
    
    // Preview Grid
    previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '15px' },
    previewItem: { position: 'relative', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
    removeBtn: { position: 'absolute', top: '5px', right: '5px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' },

    // Buttons
    actionFooter: { marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '15px' },
    secondaryBtn: { padding: '8px 15px', background: '#e9ecef', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize:'13px', fontWeight:'600' },
    secondaryBtnLarge: { padding: '12px 25px', background: '#e9ecef', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize:'14px', fontWeight:'600' },
    primaryBtnLarge: { padding: '12px 30px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize:'14px', fontWeight:'600', display:'flex', alignItems:'center' },
    disabledBtn: { padding: '12px 30px', background: '#ccc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'not-allowed', fontSize:'14px', fontWeight:'600', display:'flex', alignItems:'center' },
};

// Animation Spinner
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .spin { animation: spin 2s linear infinite; }`;
document.head.appendChild(styleSheet);

export default Upload;