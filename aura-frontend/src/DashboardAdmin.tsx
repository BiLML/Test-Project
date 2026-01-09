import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaUserMd, FaHospital, FaBrain, FaSignOutAlt, FaSearch, 
    FaCheck, FaTimes, FaUsers, FaUserShield, FaBell 
} from 'react-icons/fa';

// --- INTERFACES ---
interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    status: string;
    assigned_doctor_id: string | null;
}

interface ClinicRequest {
    id: string;
    name: string;
    owner_name: string;
    owner_id: string;
    phone: string;
    address: string;
    license_number: string;
    images: { front: string | null; back: string | null };
    created_at: string;
}

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback'>('users'); 
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]); 
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);
    const [feedbackList, setFeedbackList] = useState<any[]>([]); 

    // UI Dropdown
    const [showUserMenu, setShowUserMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            // 1. Lấy thông tin Admin
            const meRes = await fetch('http://127.0.0.1:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) {
                const meData = await meRes.json();
                // FIX LỖI: Kiểm tra cả 2 trường hợp dữ liệu (phẳng hoặc lồng)
                const info = meData.user_info || meData; 
                setAdminName(info.username || info.userName || 'Admin');
            }

            // 2. Lấy danh sách Users
            const userRes = await fetch('http://127.0.0.1:8000/api/v1/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (userRes.ok) {
                const data = await userRes.json();
                // Backend trả về { users: [...] } hoặc list trực tiếp
                const users = data.users || data || []; 
                setUserList(users.filter((u: User) => u.role !== 'admin'));
                setDoctorList(users.filter((u: User) => u.role === 'doctor'));
            }

            // 3. Lấy danh sách Phòng khám chờ duyệt
            const clinicRes = await fetch('http://127.0.0.1:8000/api/v1/clinics/admin/pending', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (clinicRes.ok) {
                const data = await clinicRes.json();
                setClinicRequests(data.requests || []);
            }

            // 4. Lấy báo cáo (Nếu chưa có API này thì bỏ qua hoặc try-catch riêng để không chặn code)
            try {
                const reportRes = await fetch('http://127.0.0.1:8000/api/v1/admin/reports', { headers: { 'Authorization': `Bearer ${token}` } });
                if (reportRes.ok) {
                    const data = await reportRes.json();
                    setFeedbackList(data.reports || []);
                }
            } catch (e) { console.warn("Chưa có API reports"); }

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);
    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login', { replace: true });
    };

    const handleClinicAction = async (clinicId: string, action: 'APPROVED' | 'REJECTED') => {
        if(!window.confirm(action === 'APPROVED' ? "Duyệt phòng khám này?" : "Từ chối yêu cầu này?")) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/clinics/admin/${clinicId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: action })
            });
            if (res.ok) {
                alert("Đã xử lý thành công.");
                fetchData(); 
            } else {
                alert("Có lỗi xảy ra.");
            }
        } catch (e) { alert("Lỗi server."); }
    };

    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu Admin...</div>;

    return (
        <div style={styles.fullScreenContainer}>
            {/* --- TOP HEADER --- */}
            <header style={styles.topBar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="Logo" style={{width:'35px'}} />
                    <h1 style={styles.headerTitle}>AURA <span style={{fontWeight:'400'}}>ADMIN</span></h1>
                </div>
                
                <div style={styles.headerRight}>
                    <div style={{position:'relative', marginRight:'25px', cursor:'pointer'}}>
                        <FaBell size={20} color="#64748b" />
                        {clinicRequests.length > 0 && <span style={styles.bellBadge}>{clinicRequests.length}</span>}
                    </div>

                    <div style={{position:'relative'}} ref={profileRef}>
                        <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                            <div style={styles.avatarCircle}>{adminName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{adminName}</span>
                        </div>
                        {showUserMenu && (
                            <div style={styles.dropdownMenu}>
                                <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}>
                                    <FaSignOutAlt style={{marginRight:8}}/> Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* --- MAIN BODY --- */}
            <main style={styles.mainBody}>
                <div style={styles.contentWrapper}>
                    
                    {/* --- STATS / NAVIGATION TABS --- */}
                    <div style={styles.statsGrid}>
                        {/* TAB 1: USERS */}
                        <div 
                            onClick={() => setActiveTab('users')} 
                            style={activeTab === 'users' ? styles.statCardActive : styles.statCard}
                        >
                            <div style={{
                                ...styles.iconBox, 
                                background: activeTab === 'users' ? '#e7f1ff' : '#f1f5f9', // Nền icon đổi màu
                                color: activeTab === 'users' ? '#007bff' : '#64748b'       // Icon đổi màu
                            }}>
                                <FaUsers size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={{
                                    ...styles.statLabel, 
                                    color: activeTab === 'users' ? '#007bff' : '#64748b' // Chữ đổi màu
                                }}>Người dùng</span>
                                <span style={{
                                    ...styles.statCount,
                                    color: activeTab === 'users' ? '#007bff' : '#0f172a'
                                }}>{userList.length} Active</span>
                            </div>
                        </div>

                        {/* TAB 2: CLINICS */}
                        <div 
                            onClick={() => setActiveTab('clinics')} 
                            style={activeTab === 'clinics' ? styles.statCardActive : styles.statCard}
                        >
                            <div style={{
                                ...styles.iconBox, 
                                background: activeTab === 'clinics' ? '#e7f1ff' : '#f1f5f9',
                                color: activeTab === 'clinics' ? '#007bff' : '#64748b'
                            }}>
                                <FaHospital size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={{
                                    ...styles.statLabel,
                                    color: activeTab === 'clinics' ? '#007bff' : '#64748b'
                                }}>Duyệt Phòng khám</span>
                                <span style={{
                                    ...styles.statCount,
                                    color: activeTab === 'clinics' ? '#007bff' : '#0f172a'
                                }}>{clinicRequests.length} Yêu cầu</span>
                            </div>
                            {clinicRequests.length > 0 && <span style={styles.redDot}></span>}
                        </div>

                        {/* TAB 3: FEEDBACK */}
                        <div 
                            onClick={() => setActiveTab('feedback')} 
                            style={activeTab === 'feedback' ? styles.statCardActive : styles.statCard}
                        >
                            <div style={{
                                ...styles.iconBox, 
                                background: activeTab === 'feedback' ? '#e7f1ff' : '#f1f5f9',
                                color: activeTab === 'feedback' ? '#007bff' : '#64748b'
                            }}>
                                <FaBrain size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={{
                                    ...styles.statLabel,
                                    color: activeTab === 'feedback' ? '#007bff' : '#64748b'
                                }}>Huấn luyện AI</span>
                                <span style={{
                                    ...styles.statCount,
                                    color: activeTab === 'feedback' ? '#007bff' : '#0f172a'
                                }}>{feedbackList.length} Dữ liệu</span>
                            </div>
                        </div>
                    </div>

                    {/* --- CONTENT TABLE --- */}
                    <div style={styles.tableCard}>
                        {activeTab === 'users' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaUserShield style={{marginRight:10, color:'#007bff'}}/>Quản lý Người dùng hệ thống</h3>
                                    <div style={styles.searchContainer}>
                                        <FaSearch color="#94a3b8"/>
                                        <input placeholder="Tìm kiếm user..." style={styles.searchInput}/>
                                    </div>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>USER</th>
                                                <th style={styles.th}>LIÊN HỆ</th>
                                                <th style={styles.th}>VAI TRÒ</th>
                                                <th style={styles.th}>TRẠNG THÁI</th>
                                                <th style={styles.th}>PHỤ TRÁCH</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userList.map(u => (
                                                <tr key={u.id} style={styles.tr}>
                                                    <td style={styles.td}>
                                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                            <div style={styles.avatarSmall}>{u.username.charAt(0)}</div>
                                                            <b>{u.username}</b>
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>{u.email}</td>
                                                    <td style={styles.td}>
                                                        <span style={{
                                                            ...styles.roleBadge, 
                                                            background: u.role==='doctor' ? '#0ea5e9': u.role==='clinic' ? '#8b5cf6' : '#22c55e'
                                                        }}>{u.role}</span>
                                                    </td>
                                                    <td style={styles.td}><span style={styles.statusActive}>Active</span></td>
                                                    <td style={styles.td}>
                                                        {u.assigned_doctor_id ? (
                                                            <span style={styles.doctorTag}>
                                                                <FaUserMd style={{marginRight:5}}/>
                                                                {doctorList.find(d => d.id === u.assigned_doctor_id)?.username || 'Dr.'}
                                                            </span>
                                                        ) : <span style={{color:'#cbd5e1'}}>--</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {activeTab === 'clinics' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaHospital style={{marginRight:10, color:'#007bff'}}/>Yêu cầu Mở Phòng khám</h3>
                                </div>
                                {clinicRequests.length === 0 ? (
                                    <div style={styles.emptyState}>
                                        <FaCheck size={50} color="#cbd5e1" style={{marginBottom:15}}/>
                                        <p>Tuyệt vời! Tất cả yêu cầu đã được xử lý.</p>
                                    </div>
                                ) : (
                                    <div style={styles.tableContainer}>
                                        <table style={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th style={styles.th}>TÊN PHÒNG KHÁM</th>
                                                    <th style={styles.th}>CHỦ SỞ HỮU</th>
                                                    <th style={styles.th}>GIẤY PHÉP</th>
                                                    <th style={styles.th}>HỒ SƠ ẢNH</th>
                                                    <th style={styles.th}>THAO TÁC</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {clinicRequests.map(req => (
                                                    <tr key={req.id} style={styles.tr}>
                                                        <td style={styles.td}><b>{req.name}</b><br/><small style={{color:'#64748b'}}>{req.address}</small></td>
                                                        <td style={styles.td}>{req.owner_name}<br/><small style={{color:'#64748b'}}>{req.phone}</small></td>
                                                        <td style={styles.td}><span style={styles.codeTag}>{req.license_number}</span></td>
                                                        <td style={styles.td}>
                                                            <div style={{display:'flex', gap:'8px'}}>
                                                                {req.images.front && <a href={req.images.front} target="_blank" rel="noreferrer" style={styles.linkBtn}>Mặt trước</a>}
                                                                {req.images.back && <a href={req.images.back} target="_blank" rel="noreferrer" style={styles.linkBtn}>Mặt sau</a>}
                                                            </div>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{display:'flex', gap:'8px'}}>
                                                                <button onClick={() => handleClinicAction(req.id, 'APPROVED')} style={styles.btnApprove}>Duyệt</button>
                                                                <button onClick={() => handleClinicAction(req.id, 'REJECTED')} style={styles.btnReject}>Hủy</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === 'feedback' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaBrain style={{marginRight:10, color:'#007bff'}}/>Dữ liệu RLHF (Feedback từ Bác sĩ)</h3>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>THỜI GIAN</th>
                                                <th style={styles.th}>BÁC SĨ</th>
                                                <th style={styles.th}>KẾT QUẢ AI</th>
                                                <th style={styles.th}>THỰC TẾ (GT)</th>
                                                <th style={styles.th}>ĐÁNH GIÁ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {feedbackList.length === 0 ? (
                                                <tr><td colSpan={5} style={styles.emptyState}>Chưa có dữ liệu.</td></tr>
                                            ) : (
                                                feedbackList.map(item => (
                                                    <tr key={item.id} style={styles.tr}>
                                                        <td style={styles.td}>{new Date(item.created_at).toLocaleDateString('vi-VN')}</td>
                                                        <td style={styles.td}><b>{item.doctor_name}</b></td>
                                                        <td style={styles.td}><span style={{color:'#64748b'}}>{item.ai_result}</span></td>
                                                        <td style={styles.td}>
                                                            <b style={{color:'#16a34a'}}>{item.doctor_diagnosis}</b>
                                                            {item.notes && <div style={{fontSize:'12px', color:'#94a3b8', marginTop:'4px', maxWidth:'250px'}}>"{item.notes}"</div>}
                                                        </td>
                                                        <td style={styles.td}>
                                                            {item.accuracy === 'INCORRECT' ? 
                                                                <span style={styles.badgeWarning}>AI Sai lệch</span> : 
                                                                <span style={styles.badgeSuccess}>AI Chính xác</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    // 1. CONTAINER FULL SCREEN (Che nền cũ)
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    fullScreenContainer: { 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        backgroundColor: '#f4f6f9', // Màu xám nhạt hiện đại
        fontFamily: '"Inter", "Segoe UI", sans-serif', 
        display: 'flex', flexDirection: 'column',
        zIndex: 9999, overflow: 'hidden' 
    },

    // 2. HEADER
    topBar: { 
        height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '0 24px', flexShrink: 0 
    },
    logoArea: { display:'flex', alignItems:'center', gap:'12px' },
    headerTitle: { fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing:'-0.5px' },
    headerRight: { display: 'flex', alignItems: 'center' },
    bellBadge: { position:'absolute', top:'-6px', right:'-6px', background:'#ef4444', color:'white', fontSize:'10px', width:'16px', height:'16px', borderRadius:'50%', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', padding:'6px 12px', borderRadius:'6px', transition:'0.2s', background:'#f8fafc', border:'1px solid #e2e8f0' },
    avatarCircle: { width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'600' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    dropdownMenu: { position: 'absolute', top: '50px', right: '0', width: '180px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #e2e8f0', overflow:'hidden' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', fontSize:'14px', fontWeight:'500' },

    // 3. MAIN BODY & CONTENT
    mainBody: { flex: 1, overflowY: 'auto', padding: '32px 32px 60px 32px' }, // Bottom padding for scroll
    contentWrapper: { maxWidth: '1400px', margin: '0 auto', width: '100%' },

    // 4. STATS CARDS (TABS) - EFFECT QUAN TRỌNG
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' },
    
    // TRẠNG THÁI BÌNH THƯỜNG
    statCard: { 
        backgroundColor: 'white', borderRadius: '12px', padding: '24px', 
        display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', 
        border: '1px solid #e2e8f0', // Viền xám
        transition: 'all 0.3s ease',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        position:'relative'
    },
    
    // TRẠNG THÁI ACTIVE (Hiệu ứng Xanh Dương & Bóng)
    statCardActive: { 
        backgroundColor: 'white', borderRadius: '12px', padding: '24px', 
        display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', 
        border: '2px solid #007bff', // VIỀN XANH ĐẬM
        boxShadow: '0 8px 24px rgba(0, 123, 255, 0.25)', // BÓNG XANH LAN TỎA
        transform: 'translateY(-4px)', // NHẤC LÊN
        position:'relative'
    },
    
    // Icon Box & Info
    iconBox: { width:'56px', height:'56px', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.3s' },
    statInfo: { display:'flex', flexDirection:'column' },
    statLabel: { fontSize:'15px', fontWeight:'600', transition:'color 0.3s' },
    statCount: { fontSize:'15px', fontWeight:'400', marginTop:'2px', transition:'color 0.3s' },
    redDot: { position:'absolute', top:'15px', right:'15px', width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444' },

    // 5. DATA TABLE
    tableCard: { backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)', overflow:'hidden' },
    cardHeader: { padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0, display:'flex', alignItems:'center' },
    searchContainer: { display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '8px', fontSize: '14px', width: '220px', color:'#334155' },

    tableContainer: { width:'100%', overflowX:'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: '700', backgroundColor: '#f8fafc', whiteSpace:'nowrap', textTransform:'uppercase' },
    tr: { borderBottom: '1px solid #f1f5f9' },
    td: { padding: '16px 24px', verticalAlign: 'middle', color: '#334155' },
    
    // 6. UI ELEMENTS
    avatarSmall: { width: '24px', height: '24px', borderRadius: '50%', background:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'bold', color:'#64748b' },
    roleBadge: { padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' },
    statusActive: { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
    doctorTag: { background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight:'600', display:'inline-flex', alignItems:'center' },
    codeTag: { backgroundColor: '#f8fafc', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace', color: '#0f172a', border:'1px solid #e2e8f0', fontSize:'12px' },
    linkBtn: { display: 'inline-block', color: '#2563eb', fontSize: '13px', textDecoration: 'none', fontWeight: '600', padding:'2px 0' },
    
    btnApprove: { backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
    btnReject: { backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
    
    emptyState: { padding: '80px 20px', textAlign: 'center', color: '#94a3b8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' },
    badgeSuccess: { backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' },
    badgeWarning: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }
};

export default DashboardAdmin;