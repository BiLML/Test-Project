import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// --- MOCK DATA TIN NHẮN ---
const MOCK_MESSAGES = [
    { id: 1, sender: 'Bác sĩ Hùng', preview: 'Kết quả chụp đáy mắt của bạn đã có, vui lòng xem chi tiết...', time: '10:30 AM', unread: true, type: 'doctor' },
    { id: 2, sender: 'Hệ thống AURA', preview: 'Chào mừng bạn đến với AURA! Hãy bắt đầu hành trình bảo vệ đôi mắt.', time: 'Yesterday', unread: false, type: 'system' },
];

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [userRole, setUserRole] = useState<string>('Guest');
    const [userName, setUserName] = useState<string>('');
    const [userId, setUserId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true); 
    const [historyData, setHistoryData] = useState<any[]>([]);

    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showFabMenu, setShowFabMenu] = useState(false);
    
    // MỚI: State cho thông báo
    const [showNotifications, setShowNotifications] = useState(false);

    // --- HÀM LẤY LỊCH SỬ ---
    const fetchMedicalRecords = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const historyRes = await fetch('http://127.0.0.1:8000/api/medical-records', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (historyRes.ok) {
                const historyData = await historyRes.json();
                setHistoryData(historyData.history);
            }
        } catch (err) {
            console.error("Lỗi cập nhật:", err);
        }
    };

    // --- LOGIC KHỞI TẠO & POLLING ---
    useEffect(() => {
        const initData = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            try {
                // 1. Lấy thông tin User
                const userResponse = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!userResponse.ok) {
                    handleLogout();
                    return;
                }

                const userData = await userResponse.json();
                setUserName(userData.user_info.userName);
                setUserRole(userData.user_info.role);
                setUserId(userData.user_info.id);

                // 2. Lấy dữ liệu lịch sử
                await fetchMedicalRecords();

            } catch (error) {
                console.error("Lỗi tải dữ liệu:", error);
            } finally {
                setIsLoading(false);
            }
        };

        initData();

        const intervalId = setInterval(() => {
            fetchMedicalRecords();
        }, 3000);

        return () => clearInterval(intervalId);

    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    // --- CÁC HÀM ĐIỀU HƯỚNG ---
    const handleNavClick = (tabName: string) => setActiveTab(tabName);
    const goToUpload = () => navigate('/upload');
    const goToHistory = () => navigate('/history');
    
    // MỚI: Hàm xem chi tiết
    const goToDetail = (recordId: string) => {
        navigate(`/result/${recordId}`);
    };

    const toggleMenu = () => setShowUserMenu(!showUserMenu);
    const toggleFabMenu = () => setShowFabMenu(!showFabMenu);
    const toggleNotifications = () => setShowNotifications(!showNotifications);

    const totalScans = historyData.length;
    const highRiskCount = historyData.filter(item =>
        item.result.includes('Nặng') ||
        item.result.includes('Tăng Sinh') ||
        item.result.includes('Trung Bình')
    ).length;

    // Lọc ra các thông báo (ví dụ: lấy 5 kết quả mới nhất làm thông báo)
    const recentNotifications = historyData.slice(0, 5);
    const hasUnread = recentNotifications.some(item => item.status === 'Hoàn thành'); // Logic giả lập

    // --- RENDER CONTENT ---
    const renderContent = () => {
        if (activeTab === 'messages') {
            return (
                <div style={styles.contentContainer}>
                    <h2 style={{ marginBottom: '20px' }}>💬 Tin nhắn của bạn</h2>
                    <div style={styles.messageList}>
                        {MOCK_MESSAGES.map(msg => (
                            <div key={msg.id} style={styles.messageItem}>
                                <div style={styles.messageAvatar}>{msg.type === 'doctor' ? 'BS' : 'A'}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong style={{ color: msg.unread ? '#000' : '#666' }}>{msg.sender}</strong>
                                        <small style={{ color: '#999' }}>{msg.time}</small>
                                    </div>
                                    <p style={{ margin: '5px 0 0', color: '#555', fontSize: '14px' }}>{msg.preview}</p>
                                </div>
                                {msg.unread && <div style={styles.unreadDot}></div>}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (activeTab === 'payments') {
            return (
                <div style={styles.contentContainer}>
                    <h2>💳 Dịch vụ & Thanh toán</h2>
                    <p>Chức năng đang phát triển...</p>
                </div>
            );
        }

        // TRANG CHỦ
        if (historyData.length === 0) {
            return (
                <div style={styles.emptyStateContainer}>
                    <img src="/logo.svg" alt="Welcome" style={{ width: '120px', marginBottom: '20px' }} />
                    <h2>Chào mừng bạn đến với AURA!</h2>
                    <p>Bạn chưa có dữ liệu sàng lọc nào. Hãy thực hiện lần kiểm tra đầu tiên.</p>
                    <button onClick={goToUpload} style={styles.bigPrimaryBtn}>Bắt đầu sàng lọc ngay</button>
                </div>
            );
        }

        return (
            <div style={styles.contentGrid}>
                <div style={styles.cardInfo}>
                    <h3>📊 Tổng quan</h3>
                    <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Tổng lần khám</span>
                            <h1 style={{ margin: '5px 0 0', color: '#007bff', fontSize: '36px' }}>{totalScans}</h1>
                        </div>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Nguy cơ cao</span>
                            <h1 style={{ margin: '5px 0 0', color: highRiskCount > 0 ? '#dc3545' : '#28a745', fontSize: '36px' }}>{highRiskCount}</h1>
                        </div>
                    </div>
                </div>
                <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0 }}>🕒 Lịch sử gần đây</h3>
                        <button onClick={goToHistory} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontWeight: 'bold' }}>Xem tất cả &rarr;</button>
                    </div>
                    
                    {/* --- BẢNG DỮ LIỆU ĐÃ CẬP NHẬT --- */}
                    <table style={styles.table}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                <th style={{ padding: '12px' }}>Ngày</th>
                                <th style={{ padding: '12px' }}>Giờ</th>
                                <th style={{ padding: '12px' }}>Kết quả AI</th>
                                <th style={{ padding: '12px' }}>Trạng thái</th>
                                {/* MỚI: Đổi tiêu đề cột */}
                                <th style={{ padding: '12px' }}>Xem chi tiết</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyData.map((item, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '12px' }}>{item.date}</td>
                                    <td style={{ padding: '12px', color: '#666' }}>{item.time}</td>
                                    <td style={{ padding: '12px', fontWeight: 'bold', color: item.result.includes('Đang') ? '#999' : '#333' }}>
                                        {item.result}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '5px 10px', 
                                            borderRadius: '15px', 
                                            fontSize: '12px', 
                                            backgroundColor: item.status === 'Hoàn thành' ? '#d4edda' : '#fff3cd', 
                                            color: item.status === 'Hoàn thành' ? '#155724' : '#856404' 
                                        }}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {/* MỚI: Nút Xem Chi Tiết */}
                                        <button 
                                            onClick={() => goToDetail(item.id)}
                                            style={styles.viewDetailBtn}
                                            disabled={item.status !== 'Hoàn thành'}
                                        >
                                            {item.status === 'Hoàn thành' ? 'Xem' : 'Wait...'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Đang tải dữ liệu...</div>;

    return (
        <div style={styles.container}>
            <aside style={styles.sidebar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="AURA Logo" style={styles.logoImage} />
                    <h2 style={{ margin: 0, fontSize: '24px', letterSpacing: '1px' }}>AURA</h2>
                </div>
                <nav style={styles.navMenu}>
                    <button style={activeTab === 'home' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('home')}>🏠 Trang chủ</button>
                    <button style={activeTab === 'messages' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('messages')}>💬 Tin nhắn</button>
                    <button style={activeTab === 'payments' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('payments')}>💳 Dịch vụ thanh toán</button>
                </nav>
            </aside>

            <main style={styles.main}>
                <header style={styles.header}>
                    <div>
                        <h2 style={{ margin: 0, color: 'white' }}>Xin chào, {userName}! </h2>
                        <p style={{ margin: '5px 0 0', color: '#cbd5e1' }}>Hôm nay bạn cảm thấy thế nào?</p>
                    </div>
                    <div style={styles.headerActions}>
                        
                        {/* --- MỚI: BUTTON THÔNG BÁO --- */}
                        <div style={{ position: 'relative' }}>
                            <button style={styles.bellBtn} onClick={toggleNotifications}>
                                🔔
                                {hasUnread && <span style={styles.bellBadge}></span>}
                            </button>
                            {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo mới</div>
                                    {recentNotifications.length > 0 ? (
                                        recentNotifications.map((notif: any) => (
                                            <div key={notif.id} style={styles.notificationItem} onClick={() => goToDetail(notif.id)}>
                                                <div style={{fontWeight: 'bold', fontSize: '13px'}}>{notif.result}</div>
                                                <div style={{fontSize: '11px', color: '#666'}}>{notif.time} - {notif.date}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{padding: '15px', fontSize: '13px', color: '#666'}}>Không có thông báo mới</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <div style={styles.avatar} onClick={toggleMenu} title="Nhấn để mở menu">
                                {userName ? userName.charAt(0).toUpperCase() : 'U'}
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

            <div style={styles.fabContainer}>
                {showFabMenu && (
                    <div style={styles.fabMenu}>
                        <button style={styles.fabMenuItem} onClick={goToUpload}>📷 Tải ảnh lên</button>
                    </div>
                )}
                <button style={styles.fabButton} onClick={toggleFabMenu} title="Chức năng mới">{showFabMenu ? '✕' : '+'}</button>
            </div>
        </div>
    );
};

// --- STYLES CẬP NHẬT ---
const styles: { [key: string]: React.CSSProperties } = {
    // ... Copy lại styles cũ ...
    container: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#f4f6f9', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' },
    sidebar: { width: '260px', backgroundColor: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', padding: '30px 20px', boxSizing: 'border-box', flexShrink: 0, alignItems: 'center' },
    logoArea: { textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    logoImage: { width: '80px', height: 'auto', marginBottom: '15px' },
    navMenu: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' },
    navItem: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer', borderRadius: '8px', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '10px' },
    navItemActive: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#007bff', border: 'none', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', overflowY: 'auto', boxSizing: 'border-box' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexShrink: 0, backgroundColor: '#1e293b', padding: '20px 30px', borderRadius: '16px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    headerActions: { display: 'flex', alignItems: 'center', gap: '20px' },
    
    // Bell Styles
    bellBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'white', position: 'relative' },
    bellBadge: { position: 'absolute', top: '0', right: '0', width: '8px', height: '8px', backgroundColor: '#dc3545', borderRadius: '50%' },
    notificationDropdown: { position: 'absolute', top: '45px', right: '-10px', width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 1100, color: '#333', overflow: 'hidden' },
    notificationItem: { padding: '12px 15px', borderBottom: '1px solid #eee', cursor: 'pointer', transition: 'background 0.2s', backgroundColor: '#fff' },
    
    avatar: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
    dropdownMenu: { position: 'absolute', top: '60px', right: '0', width: '220px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', padding: '10px 0', zIndex: 1000, border: '1px solid #eee', color: '#333' },
    dropdownHeader: { padding: '10px 20px', borderBottom: '1px solid #eee', marginBottom: '5px', backgroundColor: '#f8f9fa', color: '#333', fontWeight: 'bold', fontSize: '14px' },
    dropdownItem: { display: 'block', width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333', transition: 'background 0.2s' },
    
    // View Detail Button Style
    viewDetailBtn: { backgroundColor: '#007bff', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    
    // ... Các style layout khác giữ nguyên ...
    contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    cardInfo: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    card: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0' },
    fabContainer: { position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 2000 },
    fabButton: { width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', fontSize: '30px', border: 'none', boxShadow: '0 4px 10px rgba(0,123,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s' },
    fabMenu: { marginBottom: '15px', backgroundColor: 'white', borderRadius: '12px', padding: '10px 0', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', width: '180px', border: '1px solid #eee' },
    fabMenuItem: { padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#333', transition: 'background 0.2s', display: 'block', width: '100%' },
    emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', padding: '40px', textAlign: 'center' },
    bigPrimaryBtn: { marginTop: '20px', padding: '15px 40px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '50px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,123,255,0.4)', transition: 'transform 0.2s' },
    contentContainer: { backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' },
    messageList: { display: 'flex', flexDirection: 'column', gap: '15px' },
    messageItem: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer', transition: 'background 0.2s' },
    messageAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b' },
    unreadDot: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#007bff' },
};

export default Dashboard;