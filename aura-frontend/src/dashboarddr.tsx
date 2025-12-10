import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// --- MOCK DATA ---
const MOCK_PATIENTS = [
  { id: 'pat001', name: 'Nguyễn Văn A', lastVisit: '10/12/2025', status: 'Cần xem xét', pendingRecords: 2 },
  { id: 'pat002', name: 'Trần Thị B', lastVisit: '05/12/2025', status: 'Ổn định', pendingRecords: 0 },
  { id: 'pat003', name: 'Lê Văn C', lastVisit: '12/11/2025', status: 'Cần tái khám', pendingRecords: 0 },
];

const MOCK_RECORDS_PENDING = [
  { id: 'rec901', patientName: 'Nguyễn Văn A', date: '10/12/2025', aiResult: 'Cao: Bệnh võng mạc', status: 'Chờ Bác sĩ' },
  { id: 'rec902', patientName: 'Phạm Thị D', date: '09/12/2025', aiResult: 'Trung bình: Đục thủy tinh thể', status: 'Chờ Bác sĩ' },
];

const MOCK_CHATS = [
    { id: 1, sender: 'Nguyễn Văn A', preview: 'Bác sĩ ơi, tôi nên làm gì tiếp theo?', time: '10:35 AM', unread: true },
    { id: 2, sender: 'Trần Thị B', preview: 'Cảm ơn Bác sĩ, mắt tôi đã đỡ hơn.', time: 'Yesterday', unread: false },
];
// --- END MOCK DATA ---

const DashboardDr: React.FC = () => {
    const navigate = useNavigate();

    // --- STATE ---
const [userRole, setUserRole] = useState<string>('');
    const [userName, setUserName] = useState<string>(''); 
    const [userId, setUserId] = useState<string>(''); 
    const [isLoading, setIsLoading] = useState(true);
    
    // Dữ liệu cho Bác sĩ
    const [patientsData, setPatientsData] = useState<any[]>(MOCK_PATIENTS); // [FR-13]
    const [pendingRecords, setPendingRecords] = useState<any[]>(MOCK_RECORDS_PENDING); // Hồ sơ cần xem
    
    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    
    // --- LOGIC KHỞI TẠO & FAKE API CALL ---
// --- LOGIC KHỞI TẠO & LẤY THÔNG TIN USER THỰC TẾ ---
    useEffect(() => {
        const initData = async () => {
            const token = localStorage.getItem('token');
            const userInfoString = localStorage.getItem('user_info'); // Lấy chuỗi user_info

            if (!token) {
                // Nếu không có token, chuyển hướng về login (mặc dù ProtectedRoute đã làm việc này)
                // navigate('/login');
                // return;
            }
            
            if (userInfoString) {
                try {
                    const userInfo = JSON.parse(userInfoString);
                    
                    // ⭐ ĐỌC THÔNG TIN TỪ LOCAL STORAGE ⭐
                    setUserName(userInfo.name || userInfo.userName || 'Bác sĩ (Lỗi tên)'); // Lấy tên, dùng 'name' hoặc 'userName'
                    setUserRole(userInfo.role || 'Bác sĩ chuyên khoa');
                    setUserId(userInfo.id || 'unknown');
                    
                } catch (e) {
                    console.error("Lỗi phân tích cú pháp user_info", e);
                }
            }
            
            // Giả lập thời gian tải dữ liệu
            await new Promise(resolve => setTimeout(resolve, 500)); 
            
            setIsLoading(false);
        };

        initData();
        // Không có polling liên tục như dashboard bệnh nhân, chỉ cần tải một lần.
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };
    
    // --- CÁC HÀM ĐIỀU HƯỚNG ---
    const handleNavClick = (tabName: string) => setActiveTab(tabName);
    const toggleMenu = () => setShowUserMenu(!showUserMenu);
    const toggleFabMenu = () => setShowFabMenu(!showFabMenu);
    const toggleNotifications = () => setShowNotifications(!showNotifications);

    // [FR-14, FR-16]: Điều hướng đến trang chi tiết để xem xét kết quả và thêm chẩn đoán/ghi chú
    const goToReviewDetail = (recordId: string) => {
        navigate(`/review/${recordId}`); 
    };

    // [FR-17]: Điều hướng đến trang lịch sử của bệnh nhân cụ thể
    const goToPatientHistory = (patientId: string) => {
        navigate(`/patient/${patientId}/history`);
    };

    const unreadMessagesCount = MOCK_CHATS.filter(chat => chat.unread).length;
    const totalPending = pendingRecords.length;

    // --- RENDER CONTENT ---
    const renderContent = () => {
        // --- Tab CHAT TƯ VẤN [FR-20] ---
        if (activeTab === 'chat') {
            return (
                <div style={styles.contentContainer}>
                    <h2 style={{ marginBottom: '20px' }}>💬 Chat Tư Vấn Bệnh Nhân</h2>
                    <div style={styles.messageList}>
                        {MOCK_CHATS.map(chat => (
                            <div key={chat.id} style={styles.messageItem}>
                                <div style={styles.messageAvatar}>{chat.sender.charAt(0).toUpperCase()}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong style={{ color: chat.unread ? '#000' : '#666' }}>{chat.sender}</strong>
                                        <small style={{ color: '#999' }}>{chat.time}</small>
                                    </div>
                                    <p style={{ margin: '5px 0 0', color: '#555', fontSize: '14px' }}>{chat.preview}</p>
                                </div>
                                {chat.unread && <div style={styles.unreadDot}></div>}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // --- Tab QUẢN LÝ BỆNH NHÂN [FR-13] ---
        if (activeTab === 'patients') {
            return (
                <div style={styles.contentContainer}>
                    <h2 style={{ marginBottom: '20px' }}>🧑‍⚕️ Danh sách Bệnh nhân được phân công ({patientsData.length})</h2>
                    <table style={styles.table}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                <th style={{ padding: '12px' }}>Tên bệnh nhân</th>
                                <th style={{ padding: '12px' }}>Lần khám cuối</th>
                                <th style={{ padding: '12px' }}>Trạng thái</th>
                                <th style={{ padding: '12px' }}>Hồ sơ chờ</th>
                                <th style={{ padding: '12px' }}>Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patientsData.map((pat, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{pat.name}</td>
                                    <td style={{ padding: '12px', color: '#666' }}>{pat.lastVisit}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            ...styles.statusBadge, 
                                            backgroundColor: pat.status === 'Cần xem xét' ? '#fff3cd' : '#d4edda',
                                            color: pat.status === 'Cần xem xét' ? '#856404' : '#155724'
                                        }}>
                                            {pat.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', color: pat.pendingRecords > 0 ? '#dc3545' : '#666' }}>
                                        {pat.pendingRecords}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <button 
                                            onClick={() => goToPatientHistory(pat.id)} // [FR-17]
                                            style={styles.actionBtn}
                                        >
                                            Xem Lịch sử
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // --- Tab TRANG CHỦ (HOME) [FR-14, FR-16] ---
        return (
            <div style={styles.contentGrid}>
                {/* Thẻ Tổng quan */}
                <div style={styles.cardInfo}>
                    <h3>🏥 Tổng quan công việc</h3>
                    <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Tổng Bệnh nhân</span>
                            <h1 style={{ margin: '5px 0 0', color: '#007bff', fontSize: '36px' }}>{patientsData.length}</h1>
                        </div>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Hồ sơ cần xử lý</span>
                            <h1 style={{ margin: '5px 0 0', color: totalPending > 0 ? '#dc3545' : '#28a745', fontSize: '36px' }}>{totalPending}</h1>
                        </div>
                    </div>
                </div>
                
                {/* Bảng Hồ sơ cần xem xét */}
                <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
                    <h3 style={{ margin: 0, color: totalPending > 0 ? '#dc3545' : '#000' }}>⚠️ Hồ sơ cần xem xét gấp ({totalPending} ca)</h3>
                    
                    {totalPending === 0 ? (
                        <p style={{ marginTop: '15px', color: '#666' }}>Bạn không có hồ sơ nào đang chờ xem xét.</p>
                    ) : (
                        <table style={{ ...styles.table, marginTop: '20px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                    <th style={{ padding: '12px' }}>Bệnh nhân</th>
                                    <th style={{ padding: '12px' }}>Ngày khám</th>
                                    <th style={{ padding: '12px' }}>Kết quả AI</th>
                                    <th style={{ padding: '12px' }}>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRecords.map((item, index) => (
                                    <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{item.patientName}</td>
                                        <td style={{ padding: '12px', color: '#666' }}>{item.date}</td>
                                        <td style={{ padding: '12px', color: '#dc3545', fontWeight: 'bold' }}>{item.aiResult}</td>
                                        <td style={{ padding: '12px' }}>
                                            <button 
                                                onClick={() => goToReviewDetail(item.id)} // [FR-14, FR-16]
                                                style={styles.reviewBtn}
                                            >
                                                Xem & Chẩn đoán
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Đang tải dữ liệu của Bác sĩ...</div>;
    
    return (
        <div style={styles.container}>
            {/* --- SIDEBAR --- */}
            <aside style={styles.sidebar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="AURA Logo" style={styles.logoImage} />
                    <h2 style={{ margin: 0, fontSize: '24px', letterSpacing: '1px' }}>AURA Dr.</h2>
                </div>
                <nav style={styles.navMenu}>
                    <button style={activeTab === 'home' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('home')}>🏠 Dashboard</button>
                    <button style={activeTab === 'patients' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('patients')}>🧑‍🤝‍🧑 Bệnh nhân</button> {/* [FR-13] */}
                    <button style={activeTab === 'chat' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('chat')}>
                        💬 Chat tư vấn 
                        {unreadMessagesCount > 0 && <span style={styles.chatBadge}>{unreadMessagesCount}</span>}
                    </button> {/* [FR-20] */}
                </nav>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div>
                        <h2 style={{ margin: 0, color: 'white' }}>Chào mừng, {userName}! </h2>
                        <p style={{ margin: '5px 0 0', color: '#cbd5e1' }}>Bạn có **{totalPending} hồ sơ** cần xem xét ngay.</p>
                    </div>
                    <div style={styles.headerActions}>
                        {/* Nút thông báo (có thể dùng lại cho các hồ sơ cần xem xét) */}
                        <div style={{ position: 'relative' }}>
                            <button style={styles.bellBtn} onClick={toggleNotifications} title="Hồ sơ cần xem xét">
                                🚨
                                {totalPending > 0 && <span style={styles.bellBadge}></span>}
                            </button>
                            {/* Bạn có thể thêm NotificationDropdown ở đây, tương tự như file gốc */}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <div style={styles.avatar} onClick={toggleMenu} title="Nhấn để mở menu">
                                {userName ? userName.charAt(0).toUpperCase() : 'D'}
                            </div>
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    <div style={styles.dropdownHeader}>
                                        <strong>{userName}</strong><br/><small>{userRole}</small>
                                    </div>
                                    <button style={styles.dropdownItem} onClick={handleLogout}>🚪 Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {renderContent()}
            </main>

            {/* FAB Button (Có thể dùng để tạo hồ sơ khám mới nếu cần) */}
            <div style={styles.fabContainer}>
                {showFabMenu && (
                    <div style={styles.fabMenu}>
                        <button style={styles.fabMenuItem}>📞 Gọi điện tư vấn</button>
                    </div>
                )}
                <button style={styles.fabButton} onClick={toggleFabMenu} title="Tùy chọn hành động">{showFabMenu ? '✕' : '...'}</button>
            </div>
        </div>
    );
};

// --- STYLES (Được tùy chỉnh cho giao diện Bác sĩ) ---
const styles: { [key: string]: React.CSSProperties } = {
    // Kế thừa và chỉnh sửa từ dashboard.tsx
    container: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#f4f6f9', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' },
    sidebar: { width: '260px', backgroundColor: '#34495e', color: 'white', display: 'flex', flexDirection: 'column', padding: '30px 20px', boxSizing: 'border-box', flexShrink: 0, alignItems: 'center' }, // Màu trầm hơn
    logoArea: { textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    logoImage: { width: '80px', height: 'auto', marginBottom: '15px' },
    navMenu: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' },
    navItem: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: 'transparent', border: 'none', color: '#bdc3c7', fontSize: '16px', cursor: 'pointer', borderRadius: '8px', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' },
    navItemActive: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(231,76,60,0.4)' }, // Màu đỏ/cam (Doctor color)
    chatBadge: { position: 'absolute', right: '15px', backgroundColor: '#f1c40f', color: '#333', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', overflowY: 'auto', boxSizing: 'border-box' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexShrink: 0, backgroundColor: '#34495e', padding: '20px 30px', borderRadius: '16px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    headerActions: { display: 'flex', alignItems: 'center', gap: '20px' },
    bellBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'white', position: 'relative' },
    bellBadge: { position: 'absolute', top: '0', right: '0', width: '8px', height: '8px', backgroundColor: '#f1c40f', borderRadius: '50%' }, // Màu cảnh báo
    avatar: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#e74c3c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
    dropdownMenu: { position: 'absolute', top: '60px', right: '0', width: '220px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', padding: '10px 0', zIndex: 1000, border: '1px solid #eee', color: '#333' },
    dropdownHeader: { padding: '10px 20px', borderBottom: '1px solid #eee', marginBottom: '5px', backgroundColor: '#f8f9fa', color: '#333', fontWeight: 'bold', fontSize: '14px' },
    dropdownItem: { display: 'block', width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333', transition: 'background 0.2s' },
    contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    cardInfo: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    card: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0' },
    fabContainer: { position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 2000 },
    fabButton: { width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e74c3c', color: 'white', fontSize: '30px', border: 'none', boxShadow: '0 4px 10px rgba(231,76,60,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s' },
    fabMenu: { marginBottom: '15px', backgroundColor: 'white', borderRadius: '12px', padding: '10px 0', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', width: '180px', border: '1px solid #eee' },
    fabMenuItem: { padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333', transition: 'background 0.2s', display: 'block', width: '100%' },
    
    // Styles riêng cho Doctor
    reviewBtn: { backgroundColor: '#2ecc71', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }, // Nút "Chẩn đoán"
    actionBtn: { background: 'none', border: '1px solid #3498db', color: '#3498db', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }, // Nút "Xem Lịch sử"
    statusBadge: { padding: '5px 10px', borderRadius: '15px', fontSize: '12px' },
    
    // Message Styles cho chat
    contentContainer: { backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', flex: 1 },
    messageList: { display: 'flex', flexDirection: 'column', gap: '15px' },
    messageItem: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer', transition: 'background 0.2s', borderRadius: '8px', ':hover': { backgroundColor: '#f7f7f7' } },
    messageAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3498db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' },
    unreadDot: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#e74c3c' },
};

export default DashboardDr;