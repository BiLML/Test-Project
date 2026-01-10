import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaUserMd, FaUsers, FaClipboardList, FaCommentDots, 
    FaSearch, FaTimes, FaSignOutAlt, FaBell, FaChartBar, FaStethoscope,
    FaFileAlt, FaEdit, FaCheckCircle, FaExclamationTriangle, FaCheck, FaCheckDouble 
} from 'react-icons/fa';

// --- Dashboard Component (Bác sĩ) ---
const DashboardDr: React.FC = () => {
    const navigate = useNavigate();

    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('doctor');
    const [userName, setUserName] = useState<string>('');   
    const [full_name, setFullName] = useState<string>(''); 
    const [isLoading, setIsLoading] = useState(true);
    
    // DỮ LIỆU API
    const [patientsData, setPatientsData] = useState<any[]>([]); 
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // STATE UI
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    
    // STATE MODAL & FILTER
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyRecords, setHistoryRecords] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedPatientName, setSelectedPatientName] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [riskFilter, setRiskFilter] = useState('ALL');

    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- STATE MỚI CHO TÍNH NĂNG BÁO CÁO [FR-19] ---
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportForm, setReportForm] = useState({
        patientId: '',
        aiResult: 'Nguy cơ cao', 
        doctorDiagnosis: '',
        accuracy: 'CORRECT', // 'CORRECT' | 'INCORRECT'
        notes: ''
    });
    const [submittedReports, setSubmittedReports] = useState<any[]>([]);

    // 1. Hàm lấy danh sách báo cáo
    const fetchMyReports = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: localhost
            const res = await fetch('http://localhost:8000/api/v1/reports/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSubmittedReports(data.reports || []); 
            }
        } catch (error) {
            console.error("Lỗi tải báo cáo:", error);
        }
    }, []);

    // 2. Hàm gửi báo cáo
    const submitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) { alert("Vui lòng đăng nhập lại"); return; }

        try {
            const res = await fetch('http://localhost:8000/api/v1/reports', { 
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_id: reportForm.patientId,
                    ai_result: reportForm.aiResult,
                    doctor_diagnosis: reportForm.doctorDiagnosis,
                    accuracy: reportForm.accuracy,
                    notes: reportForm.notes
                })
            });

            if (res.ok) {
                alert("Đã gửi báo cáo thành công! Cảm ơn đóng góp của bạn.");
                setShowReportModal(false);
                setReportForm({ ...reportForm, doctorDiagnosis: '', notes: '' });
                fetchMyReports();
            } else {
                const err = await res.json();
                alert("Lỗi: " + (err.detail || "Không thể gửi báo cáo"));
            }
        } catch (error) {
            alert("Lỗi kết nối server!");
        }
    };

    useEffect(() => {
        if (activeTab === 'reports') {
            fetchMyReports();
        }
    }, [activeTab, fetchMyReports]);

    // --- FETCH & LOGIC ---
    
    const fetchChatData = useCallback(async (token: string) => {
        try {
            const res = await fetch('http://localhost:8000/api/v1/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats || [];
                
                const enrichedChats = serverChats.map((sChat: any) => {
                    const patient = patientsData.find(p => p.id === sChat.id);
                    return {
                        ...sChat,
                        display_name: sChat.full_name || patient?.full_name || patient?.userName || sChat.sender 
                    };
                });

                setChatData(prevChats => {
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    const mergedChats = enrichedChats.map((sChat: any) => {
                        const pChat: any = prevMap.get(sChat.id);
                        if (pChat && pChat.time === "Vừa xong" && sChat.preview !== pChat.preview) return pChat; 
                        return sChat;
                    });
                    return mergedChats.sort((a: any, b: any) => {
                        if (a.time === "Vừa xong") return -1;
                        if (b.time === "Vừa xong") return 1;
                        return (b.time || "").localeCompare(a.time || ""); 
                    });
                });
            }
        } catch (error) { console.error("Lỗi chat:", error); }
    }, [patientsData]);

    // Xem lịch sử hồ sơ bệnh nhân
    const handleViewHistory = async (patientId: string, name: string) => {
        setShowHistoryModal(true);
        setSelectedPatientName(name);
        setHistoryLoading(true);
        setHistoryRecords([]);
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: Endpoint /api/records/patient/{id}
            const res = await fetch(`http://localhost:8000/api/v1/records/patient/${patientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // SỬA: Mapping dữ liệu mới
                const records = (data.records || data || []).map((r: any) => ({
                    id: r.id,
                    date: new Date(r.upload_date).toLocaleDateString('vi-VN'),
                    result: r.ai_result || "Đang phân tích...", // Map ai_result -> result để hiển thị
                    status: r.ai_analysis_status
                }));
                setHistoryRecords(records); 
            }
        } catch (error) { console.error(error); } finally { setHistoryLoading(false); }
    };

    const fetchMessageHistory = async (partnerId: string) => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const res = await fetch(`http://localhost:8000/api/v1/chat/history/${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return data.messages || [];
        } catch (err) { return []; }
    };

    const openChat = async (partnerId: string) => {
        setSelectedChatId(partnerId);
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        const token = localStorage.getItem('token');
        if (token) {
            setChatData(prev => prev.map(c => c.id === partnerId ? { ...c, unread: false } : c));
            await fetch(`http://localhost:8000/api/v1/chat/read/${partnerId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }});
            fetchChatData(token);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;
        const textToSend = newMessageText;
        setNewMessageText(''); 
        const now = new Date();
        // Lấy giờ phút và tự thêm số 0 đằng trước nếu < 10
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: timeString, // <--- Dùng biến này thay vì toLocaleTimeString
            is_read: false
        };
        setCurrentMessages(prev => [...prev, tempMsg]);
        setChatData(prevList => {
            const newList = [...prevList];
            const chatIndex = newList.findIndex(c => c.id === selectedChatId);
            if (chatIndex > -1) {
                const updatedChat = { ...newList[chatIndex], preview: "Bạn: " + textToSend, time: "Vừa xong", unread: false };
                newList.splice(chatIndex, 1);
                newList.unshift(updatedChat);
            }
            return newList;
        });
        try {
            const token = localStorage.getItem('token');
            await fetch('http://localhost:8000/api/v1/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
            });
        } catch (err) { alert("Lỗi gửi tin!"); }
    };

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [currentMessages]);

    // Polling
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const interval = setInterval(async () => {
             // Chỉ gọi khi cần thiết
             if (activeTab === 'chat') fetchChatData(token); 
             if (selectedChatId) {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                if (serverMsgs && serverMsgs.length >= currentMessages.length) setCurrentMessages(serverMsgs);
             }
        }, 3000); 
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData, currentMessages.length, activeTab]);

    // INIT DATA
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }
        const initData = async () => {
            try {
                const userRes = await fetch('http://localhost:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!userRes.ok) throw new Error("Token lỗi");
                
                const userData = await userRes.json();
                const info = userData.user_info || userData;
                const userProfile = info.profile || userData.profile || {}

                if (info.role !== 'doctor') { 
                    alert("Tài khoản không có quyền Bác sĩ"); 
                    handleLogout(); 
                    return; 
                }

                setUserName(info.username || info.userName);
                setFullName(userProfile.full_name || info.full_name || '');
                setUserRole(info.role);

                // Fetch patients
                const patientsRes = await fetch('http://localhost:8000/api/v1/doctor/my-patients', { headers: { 'Authorization': `Bearer ${token}` } });
                if (patientsRes.ok) { 
                    const data = await patientsRes.json(); 
                    setPatientsData(data.patients || []); 
                }
                await fetchChatData(token); 
            } catch (error) { console.error(error); } finally { setIsLoading(false); }
        };
        initData();
    }, []); // eslint-disable-line

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    // --- HELPER DATA & LOGIC ---
    const unreadMessagesCount = chatData.filter(chat => chat.unread).length;
    
    // SỬA: Logic lọc hồ sơ cần xử lý (Pending) dựa trên trường ai_result mới
    const pendingRecords = patientsData
        .filter(p => {
            if (!p.latest_scan) return false;
            const res = (p.latest_scan.ai_result || "").toLowerCase(); // SỬA: ai_result
            const status = (p.latest_scan.ai_analysis_status || "").toUpperCase(); // SỬA: ai_analysis_status
            
            const isHighRisk = res.includes('nặng') || res.includes('severe') || res.includes('moderate') || res.includes('pdr');
            const isCompleted = status === 'COMPLETED';
            
            return isCompleted && isHighRisk;
        })
        .map(p => ({ 
            id: p.latest_scan.record_id || '', 
            patientName: p.full_name || p.userName, 
            date: new Date(p.latest_scan.upload_date).toLocaleDateString('vi-VN'), // SỬA: format date
            aiResult: p.latest_scan.ai_result, // SỬA: ai_result
            status: 'Chờ Bác sĩ' 
        }));

    const totalPending = pendingRecords.length;

    // --- TÍNH TOÁN BIỂU ĐỒ ---
    const chartData = (() => {
        let severe = 0, moderate = 0, mild = 0, safe = 0;
        patientsData.forEach(p => {
            const res = (p.latest_scan?.ai_result || '').toLowerCase(); // SỬA: ai_result
            if (res.includes('nặng') || res.includes('severe')) severe++;
            else if (res.includes('trung bình') || res.includes('moderate')) moderate++;
            else if (res.includes('nhẹ') || res.includes('mild')) mild++;
            else safe++;
        });
        const max = Math.max(severe, moderate, mild, safe, 1);
        return { severe, moderate, mild, safe, max };
    })();

    // --- HÀM XỬ LÝ BÁO CÁO ---
    const handleOpenReport = () => {
        setReportForm({
            patientId: '', 
            aiResult: 'Nguy cơ cao (AI)', 
            doctorDiagnosis: '',
            accuracy: 'CORRECT',
            notes: ''
        });
        setShowReportModal(true);
    };

    // --- RENDER ---
    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu Bác sĩ...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        {/* <img src="/logo.svg" alt="Logo" style={{width:'30px', filter: 'brightness(0) invert(1)'}} /> */}
                        <FaUserMd size={24} color="#fff" />
                        <span style={styles.logoText}>AURA DOCTOR</span>
                    </div>
                </div>
                <nav style={styles.nav}>
                    <div style={activeTab === 'home' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('home')}>
                        <FaClipboardList style={styles.menuIcon} /> Tổng quan
                    </div>
                    <div style={activeTab === 'patients' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('patients')}>
                        <FaUsers style={styles.menuIcon} /> Bệnh nhân
                    </div>
                    <div style={activeTab === 'chat' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('chat')}>
                        <FaCommentDots style={styles.menuIcon} /> Chat Tư vấn
                        {unreadMessagesCount > 0 && <span style={styles.badge}>{unreadMessagesCount}</span>}
                    </div>

                    <div style={activeTab === 'reports' ? styles.menuItemActive: styles.menuItem} onClick={() => setActiveTab('reports')}>
                        <FaFileAlt style={styles.menuIcon} /> Báo cáo
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.headerLeft}>
                        <h2 style={{margin:0, fontSize:'18px'}}>Chào Bác sĩ, {full_name || userName} 👋</h2>
                        {totalPending > 0 && <span style={styles.headerAlert}>Bạn có {totalPending} ca cần xem xét</span>}
                    </div>
                    <div style={styles.headerRight}>
                         <div style={{position:'relative'}} ref={notificationRef}>
                            <button style={styles.iconBtn} onClick={() => setShowNotifications(!showNotifications)}>
                                <FaBell color="#555" size={18}/>
                                {totalPending > 0 && <span style={styles.bellBadge}></span>}
                            </button>
                            {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    <div style={{padding:'15px', color:'#666', fontSize:'13px'}}>
                                        {totalPending > 0 ? `Có ${totalPending} hồ sơ bệnh nhân rủi ro cao.` : "Không có thông báo mới."}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{position:'relative'}} ref={profileRef}>
                            <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>{userName.charAt(0).toUpperCase()}</div>
                                <span style={styles.userNameText}>{full_name}</span>
                            </div>
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    <button style={styles.dropdownItem} onClick={() => navigate('/profile-dr')}><FaUserMd style={{marginRight:8}}/> Hồ sơ</button>
                                    <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}><FaSignOutAlt style={{marginRight:8}}/> Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    
                    {/* --- TAB HOME --- */}
                    {activeTab === 'home' && (
                        <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                            {/* 1. GRID: THỐNG KÊ & BIỂU ĐỒ */}
                            <div style={styles.statsGrid}>
                                {/* Cột Trái: Cards */}
                                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                                    <div style={styles.statCard}>
                                        <div style={styles.statIconBox}><FaUsers color="#3498db" size={24}/></div>
                                        <div>
                                            <div style={styles.statLabel}>Tổng Bệnh nhân</div>
                                            <div style={styles.statValue}>{patientsData.length}</div>
                                        </div>
                                    </div>
                                    <div style={styles.statCard}>
                                        <div style={{...styles.statIconBox, background: totalPending > 0 ? '#fdecea' : '#e8f5e9'}}>
                                            <FaClipboardList color={totalPending > 0 ? '#e74c3c' : '#2ecc71'} size={24}/>
                                        </div>
                                        <div>
                                            <div style={styles.statLabel}>Hồ sơ cần xử lý</div>
                                            <div style={{...styles.statValue, color: totalPending > 0 ? '#e74c3c' : '#2ecc71'}}>{totalPending}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Cột Phải: Biểu đồ CSS */}
                                <div style={styles.chartCard}>
                                    <div style={styles.cardHeader}>
                                        <h3 style={styles.pageTitle}><FaChartBar style={{marginRight:8}}/> Phân bố Mức độ rủi ro</h3>
                                    </div>
                                    <div style={styles.chartContainer}>
                                        {/* Bar: Safe */}
                                        <div style={styles.barGroup}>
                                            <div style={{height: '100%', display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                                                <div style={{...styles.bar, height: `${(chartData.safe / chartData.max) * 100}%`, background: '#2ecc71'}}>
                                                    <span style={styles.barValue}>{chartData.safe}</span>
                                                </div>
                                            </div>
                                            <div style={styles.barLabel}>Bình thường</div>
                                        </div>
                                        {/* Bar: Mild */}
                                        <div style={styles.barGroup}>
                                            <div style={{height: '100%', display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                                                <div style={{...styles.bar, height: `${(chartData.mild / chartData.max) * 100}%`, background: '#f1c40f'}}>
                                                    <span style={styles.barValue}>{chartData.mild}</span>
                                                </div>
                                            </div>
                                            <div style={styles.barLabel}>Nhẹ</div>
                                        </div>
                                        {/* Bar: Moderate */}
                                        <div style={styles.barGroup}>
                                            <div style={{height: '100%', display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                                                <div style={{...styles.bar, height: `${(chartData.moderate / chartData.max) * 100}%`, background: '#e67e22'}}>
                                                    <span style={styles.barValue}>{chartData.moderate}</span>
                                                </div>
                                            </div>
                                            <div style={styles.barLabel}>Trung bình</div>
                                        </div>
                                        {/* Bar: Severe */}
                                        <div style={styles.barGroup}>
                                            <div style={{height: '100%', display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                                                <div style={{...styles.bar, height: `${(chartData.severe / chartData.max) * 100}%`, background: '#e74c3c'}}>
                                                    <span style={styles.barValue}>{chartData.severe}</span>
                                                </div>
                                            </div>
                                            <div style={styles.barLabel}>Nặng</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. TABLE: CẢNH BÁO */}
                            <div style={styles.card}>
                                <div style={{...styles.cardHeader, borderLeft: '4px solid #e74c3c'}}>
                                    <h3 style={{...styles.pageTitle, color: '#c0392b'}}>⚠️ Hồ sơ cần xem xét ({totalPending})</h3>
                                </div>
                                <table style={styles.table}>
                                    <thead><tr><th style={styles.th}>Bệnh nhân</th><th style={styles.th}>Ngày khám</th><th style={styles.th}>Kết quả AI</th><th style={styles.th}>Hành động</th></tr></thead>
                                    <tbody>
                                        {pendingRecords.length === 0 ? (
                                            <tr><td colSpan={4} style={styles.emptyCell}>Tuyệt vời! Không có hồ sơ nào cần xử lý gấp.</td></tr>
                                        ) : (
                                            pendingRecords.map((item, index) => (
                                                <tr key={index} style={styles.tr}>
                                                    <td style={styles.td}><b>{item.patientName}</b></td>
                                                    <td style={styles.td}>{item.date}</td>
                                                    <td style={styles.td}><span style={{color:'#e74c3c', fontWeight:'bold'}}>{item.aiResult}</span></td>
                                                    <td style={styles.td}>
                                                        {/* SỬA: Link tới AnalysisResult (thay vì /result/) */}
                                                        <button onClick={() => navigate(`/analysis-result/${item.id}`)} style={styles.primaryBtnSm}>
                                                            <FaStethoscope style={{marginRight:5}}/> Chẩn đoán
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB PATIENTS --- */}
                    {activeTab === 'patients' && (
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <h3 style={styles.pageTitle}><FaUsers style={{marginRight:8}}/> Danh sách Bệnh nhân</h3>
                                <div style={{display:'flex', gap:'10px'}}>
                                    <div style={styles.searchBox}>
                                        <FaSearch color="#999" />
                                        <input style={styles.searchInput} placeholder="Tìm tên, SĐT..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                                    </div>
                                    <select style={styles.selectInput} value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}>
                                        <option value="ALL">Tất cả mức độ</option>
                                        <option value="SEVERE">Nguy hiểm</option>
                                        <option value="MODERATE">Trung bình</option>
                                        <option value="SAFE">Bình thường</option>
                                    </select>
                                </div>
                            </div>
                            <table style={styles.table}>
                                <thead><tr><th style={styles.th}>Bệnh nhân</th><th style={styles.th}>Liên hệ</th><th style={styles.th}>Kết quả gần nhất</th><th style={styles.th}>Thao tác</th></tr></thead>
                                <tbody>
                                    {patientsData.filter(p => {
                                        const matchName = (p.full_name||p.userName).toLowerCase().includes(searchTerm.toLowerCase());
                                        const res = (p.latest_scan?.ai_result || '').toLowerCase(); // SỬA: ai_result
                                        let matchRisk = true;
                                        if (riskFilter === 'SEVERE') matchRisk = res.includes('nặng') || res.includes('severe');
                                        if (riskFilter === 'MODERATE') matchRisk = res.includes('trung bình') || res.includes('moderate');
                                        if (riskFilter === 'SAFE') matchRisk = res.includes('bình thường') || res.includes('normal');
                                        return matchName && matchRisk;
                                    }).map(p => (
                                        <tr key={p.id} style={styles.tr}>
                                            <td style={styles.td}><b>{p.full_name || p.userName}</b></td>
                                            <td style={styles.td}>{p.email}<br/><small>{p.phone}</small></td>
                                            <td style={styles.td}>
                                                {p.latest_scan?.ai_result ? (
                                                     <span style={{
                                                        color: p.latest_scan.ai_result.toLowerCase().includes('nặng') ? '#e74c3c' : 
                                                               p.latest_scan.ai_result.toLowerCase().includes('trung bình') ? '#e67e22' : '#2ecc71',
                                                        fontWeight:'bold'
                                                     }}>{p.latest_scan.ai_result}</span>
                                                ) : <span style={{color:'#999'}}>Chưa khám</span>}
                                            </td>
                                            <td style={styles.td}>
                                                <div style={{display:'flex', gap:'5px'}}>
                                                    <button onClick={() => {setActiveTab('chat'); openChat(p.id)}} style={styles.actionBtn}>Chat</button>
                                                    <button onClick={() => handleViewHistory(p.id, p.full_name)} style={styles.actionBtn}>Hồ sơ</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* --- TAB CHAT --- */}
                    {activeTab === 'chat' && (
                        <div style={styles.messengerCard}>
                            <div style={styles.chatListPanel}>
                                <div style={styles.chatHeaderLeft}>
                                    <h3 style={{margin:0, fontSize:'16px'}}>Tư vấn Trực tuyến</h3>
                                </div>
                                <div style={styles.chatListScroll}>
                                    {chatData.map(c => (
                                        <div key={c.id} onClick={()=>openChat(c.id)} style={{...styles.chatListItem, background: selectedChatId === c.id ? '#f0f8ff' : 'transparent'}}>
                                            <div style={styles.avatarLarge}>{(c.display_name||c.sender).charAt(0).toUpperCase()}</div>
                                            <div style={{flex:1, overflow:'hidden'}}>
                                                <div style={{fontWeight: c.unread?'bold':'normal', fontSize:'14px'}}>{c.display_name||c.sender}</div>
                                                <div style={{fontSize:'12px', color: c.unread?'#333':'#888', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.preview}</div>
                                            </div>
                                            {c.unread && <div style={styles.unreadDot}></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={styles.chatWindowPanel}>
                                {selectedChatId ? (
                                    <>
                                        <div style={styles.chatWindowHeader}>
                                            <h4 style={{margin:0}}>{chatData.find(c=>c.id===selectedChatId)?.display_name}</h4>
                                        </div>
                                        
                                        {/* --- PHẦN HIỂN THỊ TIN NHẮN --- */}
                                        <div style={styles.messagesBody}>
                                            {currentMessages.map((m, i) => (
                                                <div key={i} style={{
                                                    ...styles.messageRow, 
                                                    justifyContent: m.is_me ? 'flex-end' : 'flex-start'
                                                }}>
                                                    {/* Avatar người đối diện */}
                                                    {!m.is_me && (
                                                        <div style={{
                                                            width:'28px', height:'28px', borderRadius:'50%', 
                                                            background:'#ddd', marginRight:'8px', display:'flex', 
                                                            alignItems:'center', justifyContent:'center', fontSize:'10px',
                                                            alignSelf: 'flex-end', marginBottom: '20px'
                                                        }}>
                                                            {(chatData.find(c=>c.id===selectedChatId)?.display_name || '').charAt(0)}
                                                        </div>
                                                    )}
                                                    
                                                    <div style={{display:'flex', flexDirection:'column', alignItems: m.is_me ? 'flex-end' : 'flex-start', maxWidth:'70%'}}>
                                                        {/* Bong bóng chat */}
                                                        <div style={m.is_me ? styles.bubbleMe : styles.bubbleOther}>
                                                            {m.content}
                                                        </div>

                                                        {/* Dòng hiển thị Thời gian & Trạng thái */}
                                                        <div style={{
                                                            display:'flex', alignItems:'center', gap:'4px', 
                                                            marginTop:'2px', marginBottom:'10px', 
                                                            fontSize:'11px', color:'#999',
                                                            paddingRight: m.is_me ? '5px' : '0',
                                                            paddingLeft: !m.is_me ? '5px' : '0'
                                                        }}>
                                                            <span>{m.time}</span>
                                                            {m.is_me && (
                                                                <span style={{marginLeft:'2px', display:'flex', alignItems:'center'}}>
                                                                    {m.is_read ? (
                                                                        <span title="Đã xem" style={{display:'flex', alignItems:'center', color: '#007bff'}}>
                                                                            <FaCheckDouble size={10}/> 
                                                                            <span style={{fontSize:'10px', marginLeft:'2px'}}>Đã xem</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span title="Đã gửi" style={{color: '#ccc'}}>
                                                                            <FaCheck size={10}/>
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={messagesEndRef}/>
                                        </div>
                                        {/* ----------------------------------------------------- */}

                                        <form onSubmit={handleSendMessage} style={styles.chatInputArea}>
                                            <input style={styles.messengerInput} value={newMessageText} onChange={e=>setNewMessageText(e.target.value)} placeholder="Nhập tin nhắn..."/>
                                            <button type="submit" style={{border:'none', background:'none', cursor:'pointer'}}><FaPaperPlane color="#3498db" size={20}/></button>
                                        </form>
                                    </>
                                ) : (
                                    <div style={styles.emptyChatState}><FaCommentDots size={50} color="#ddd"/><p>Chọn bệnh nhân để chat</p></div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- TAB REPORTS (BÁO CÁO) --- */}
                    {activeTab === 'reports' && (
                        <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                            
                            {/* Card 1: Thống kê & Nút tạo báo cáo */}
                            <div style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.pageTitle}><FaChartBar style={{marginRight:8}}/> Thống kê & Phản hồi chuyên môn</h3>
                                    
                                    {/* NÚT TẠO BÁO CÁO MỚI */}
                                    <button style={styles.primaryBtnSm} onClick={handleOpenReport}>
                                        <FaEdit style={{marginRight:5}}/> Viết báo cáo / Góp ý AI
                                    </button>
                                </div>
                                <div style={{padding:'25px', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'20px'}}>
                                    <div style={{...styles.reportBox, borderLeft:'4px solid #3498db'}}>
                                        <div style={styles.reportLabel}>Tổng hồ sơ</div>
                                        <div style={styles.reportValue}>{patientsData.length}</div>
                                    </div>
                                    <div style={{...styles.reportBox, borderLeft:'4px solid #e74c3c'}}>
                                        <div style={styles.reportLabel}>Ca Nặng</div>
                                        <div style={{...styles.reportValue, color:'#e74c3c'}}>{chartData.severe}</div>
                                    </div>
                                    <div style={{...styles.reportBox, borderLeft:'4px solid #f1c40f'}}>
                                        <div style={styles.reportLabel}>Ca Nhẹ</div>
                                        <div style={{...styles.reportValue, color:'#f39c12'}}>{chartData.mild}</div>
                                    </div>
                                    <div style={{...styles.reportBox, borderLeft:'4px solid #2ecc71'}}>
                                        <div style={styles.reportLabel}>Bình thường</div>
                                        <div style={{...styles.reportValue, color:'#2ecc71'}}>{chartData.safe}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Danh sách báo cáo đã gửi */}
                            <div style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.pageTitle}><FaFileAlt style={{marginRight:8}}/> Lịch sử Báo cáo gửi Admin</h3>
                                </div>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Ngày gửi</th>
                                            <th style={styles.th}>Loại báo cáo</th>
                                            <th style={styles.th}>Liên quan đến</th>
                                            <th style={styles.th}>Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submittedReports.map((rp, idx) => (
                                            <tr key={idx} style={styles.tr}>
                                                <td style={styles.td}>{new Date(rp.created_at || rp.date).toLocaleDateString()}</td>
                                                <td style={styles.td}>
                                                    <span style={{
                                                        display:'flex', alignItems:'center', gap:'5px', fontWeight:'bold',
                                                        color: (rp.accuracy || '').includes('INCORRECT') ? '#e74c3c' : '#2ecc71'
                                                    }}>
                                                        {(rp.accuracy || '').includes('INCORRECT') ? <FaExclamationTriangle/> : <FaCheckCircle/>}
                                                        {rp.accuracy === 'INCORRECT' ? 'Báo cáo sai lệch' : 'Xác nhận đúng'}
                                                    </span>
                                                </td>
                                                <td style={styles.td}>{rp.patient_id}</td>
                                                <td style={styles.td}><span style={{background:'#e3f2fd', color:'#2196f3', padding:'3px 8px', borderRadius:'10px', fontSize:'11px'}}>Đã gửi</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

            {/* --- MODAL FORM BÁO CÁO --- */}
            {showReportModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}>
                            <h3>📝 Báo cáo Chuyên môn & Huấn luyện AI</h3>
                            <button onClick={()=>setShowReportModal(false)} style={styles.closeBtn}><FaTimes/></button>
                        </div>
                        <form onSubmit={submitReport} style={{padding:'20px'}}>
                            
                            {/* Chọn bệnh nhân */}
                            <div style={{marginBottom:'15px'}}>
                                <label style={styles.label}>Chọn Bệnh nhân:</label>
                                <select 
                                    style={styles.inputForm} 
                                    value={reportForm.patientId} 
                                    onChange={e => {
                                        const selectedId = e.target.value;
                                        const selectedPatient = patientsData.find(p => p.id === parseInt(selectedId));
                                        // Tự động lấy kết quả AI mới nhất
                                        const aiRes = selectedPatient?.latest_scan?.ai_result || 'Chưa có kết quả AI';

                                        setReportForm({
                                            ...reportForm, 
                                            patientId: selectedId,
                                            aiResult: aiRes 
                                        });
                                    }}
                                    required
                                >
                                    <option value="">-- Chọn hồ sơ --</option>
                                    {patientsData.map(p => (
                                        <option key={p.id} value={p.id}>{p.full_name || p.userName}</option>
                                    ))}
                                </select>
                            </div>

                            {/* HIỂN THỊ KẾT QUẢ AI */}
                            {reportForm.patientId && (
                                <div style={{marginBottom:'15px', background:'#f0f8ff', padding:'10px', borderRadius:'6px', border:'1px dashed #3498db'}}>
                                    <div style={{fontSize:'12px', color:'#555'}}>🤖 AI Chẩn đoán:</div>
                                    <div style={{fontWeight:'bold', color:'#2980b9', fontSize:'15px'}}>{reportForm.aiResult}</div>
                                </div>
                            )}

                            {/* Đánh giá AI */}
                            <div style={{marginBottom:'15px'}}>
                                <label style={styles.label}>Đánh giá kết quả AI:</label>
                                <div style={{display:'flex', gap:'20px', marginTop:'5px'}}>
                                    <label style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer'}}>
                                        <input type="radio" name="accuracy" value="CORRECT" checked={reportForm.accuracy === 'CORRECT'} onChange={()=>setReportForm({...reportForm, accuracy:'CORRECT'})} /> 
                                        <span style={{color:'#2ecc71', fontWeight:'bold'}}>AI Chính xác</span>
                                    </label>
                                    <label style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer'}}>
                                        <input type="radio" name="accuracy" value="INCORRECT" checked={reportForm.accuracy === 'INCORRECT'} onChange={()=>setReportForm({...reportForm, accuracy:'INCORRECT'})} /> 
                                        <span style={{color:'#e74c3c', fontWeight:'bold'}}>AI Sai lệch (Cần sửa)</span>
                                    </label>
                                </div>
                            </div>

                            {/* Chẩn đoán của Bác sĩ */}
                            <div style={{marginBottom:'15px'}}>
                                <label style={styles.label}>Chẩn đoán của Bác sĩ (Ground Truth):</label>
                                <input 
                                    style={styles.inputForm} 
                                    placeholder="Ví dụ: Viêm da cơ địa giai đoạn 2..." 
                                    value={reportForm.doctorDiagnosis}
                                    onChange={e => setReportForm({...reportForm, doctorDiagnosis: e.target.value})}
                                    required
                                />
                            </div>

                            {/* Ghi chú */}
                            <div style={{marginBottom:'20px'}}>
                                <label style={styles.label}>Ghi chú chi tiết / Đề xuất:</label>
                                <textarea 
                                    style={{...styles.inputForm, height:'80px'}} 
                                    placeholder="Mô tả chi tiết để đội ngũ kỹ thuật cải thiện model..."
                                    value={reportForm.notes}
                                    onChange={e => setReportForm({...reportForm, notes: e.target.value})}
                                />
                            </div>

                            <div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                                <button type="button" onClick={()=>setShowReportModal(false)} style={styles.actionBtn}>Hủy</button>
                                <button type="submit" style={styles.primaryBtnSm}>Gửi Báo cáo</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
                </div>
            </main>

            {/* MODAL HISTORY */}
            {showHistoryModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}><h3>Hồ sơ: {selectedPatientName}</h3><button onClick={()=>setShowHistoryModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <div style={{padding:'20px', maxHeight:'60vh', overflowY:'auto'}}>
                            {historyLoading ? <div style={{textAlign:'center'}}>Đang tải...</div> : (
                                <table style={styles.table}>
                                    <thead><tr><th>Ngày</th><th>Kết quả</th><th>Chi tiết</th></tr></thead>
                                    <tbody>
                                        {historyRecords.length > 0 ? historyRecords.map((r,i)=>(
                                            <tr key={i} style={styles.tr}>
                                                <td style={styles.td}>{r.date}</td>
                                                <td style={styles.td}><b style={{color: (r.result||"").includes('Nặng')?'red':'green'}}>{r.result}</b></td>
                                                <td style={styles.td}>
                                                    <button onClick={()=>navigate(`/analysis-result/${r.id}`)} style={styles.primaryBtnSm}>Xem</button>
                                                </td>
                                            </tr>
                                        )) : <tr><td colSpan={3} style={styles.emptyCell}>Chưa có lịch sử khám</td></tr>}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES (Đồng bộ với hệ thống nhưng giữ màu chủ đạo Bác sĩ #34495e) ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
    // Sidebar (Doctor Theme: Dark Blue)
    sidebar: { width: '260px', backgroundColor: '#34495e', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #2c3e50' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#fff' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#ecf0f1', display:'flex', alignItems:'center', transition:'0.2s' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#2c3e50', color: '#fff', borderLeft: '4px solid #3498db', display:'flex', alignItems:'center' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #2c3e50' },
    logoutBtn: { width: '100%', padding: '10px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    badge: { marginLeft: 'auto', backgroundColor: '#e74c3c', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' },

    // Main
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    headerLeft: { display:'flex', alignItems:'center', gap:'15px' },
    headerAlert: { background:'#fdecea', color:'#e74c3c', padding:'5px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'bold' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#3498db', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'bold' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    iconBtn: { background:'none', border:'none', cursor:'pointer', position:'relative', padding:'5px' },
    bellBadge: { position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px', backgroundColor: '#e74c3c', borderRadius: '50%' },
    
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },

    // Components (Cards, Tables)
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px' },
    cardHeader: { padding:'20px 25px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
    pageTitle: { fontSize: '16px', margin: 0, display:'flex', alignItems:'center', color: '#333' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px 25px', borderBottom: '1px solid #eee', color: '#8898aa', fontSize:'11px', textTransform:'uppercase', fontWeight:'700', background:'#fbfbfb' },
    tr: { borderBottom: '1px solid #f5f5f5' },
    td: { padding: '15px 25px', verticalAlign: 'middle', color:'#333' },
    emptyCell: { textAlign: 'center', padding: '30px', color: '#999', fontStyle: 'italic' },
    
    // Stats & Chart
    statsGrid: { display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px', marginBottom:'20px' },
    statCard: { background:'white', padding:'20px', borderRadius:'12px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)', display:'flex', alignItems:'center', gap:'15px', border:'1px solid #eaeaea' },
    statIconBox: { width:'50px', height:'50px', borderRadius:'12px', background:'#eaf2f8', display:'flex', alignItems:'center', justifyContent:'center' },
    statLabel: { fontSize:'13px', color:'#666', marginBottom:'5px' },
    statValue: { fontSize:'24px', fontWeight:'bold', color:'#333' },
    
    chartCard: { background:'white', borderRadius:'12px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', display:'flex', flexDirection:'column' },
    chartContainer: { padding:'20px 40px', display:'flex', justifyContent:'space-between', alignItems:'flex-end', height:'180px' },
    barGroup: { display:'flex', flexDirection:'column', alignItems:'center', height:'100%', width:'15%' },
    bar: { width:'100%', borderRadius:'4px 4px 0 0', position:'relative', transition:'height 0.5s' },
    barValue: { position:'absolute', top:'-20px', width:'100%', textAlign:'center', fontSize:'12px', fontWeight:'bold', color:'#333' },
    barLabel: { marginTop:'10px', fontSize:'12px', color:'#666', textAlign:'center' },

    // Buttons
    primaryBtnSm: { background: '#3498db', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display:'flex', alignItems:'center' },
    actionBtn: { background: '#fff', border: '1px solid #3498db', color: '#3498db', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },

    // Inputs
    searchBox: { display: 'flex', alignItems: 'center', background: '#f8f9fa', borderRadius: '6px', padding: '5px 10px', border: '1px solid #ddd' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '5px', width: '150px' },
    selectInput: { padding: '5px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' },

    // Messenger & Modal
    messengerCard: { display: 'flex', height: 'calc(100vh - 140px)', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border:'1px solid #e1e4e8', overflow: 'hidden' },
    chatListPanel: { width: '300px', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' },
    chatHeaderLeft: { padding: '15px', borderBottom: '1px solid #f0f0f0', background:'#f9f9f9' },
    chatListScroll: { flex: 1, overflowY: 'auto' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '12px', cursor: 'pointer', gap: '10px', borderBottom:'1px solid #fcfcfc' },
    avatarLarge: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#555' },
    unreadDot: { width:'10px', height:'10px', borderRadius:'50%', background:'#3498db' },
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column' },
    chatWindowHeader: { padding: '15px', borderBottom: '1px solid #f0f0f0', background:'#fff' },
    messagesBody: { flex: 1, padding: '20px', overflowY: 'auto', background:'#fdfdfd' },
    chatInputArea: { padding: '15px 20px', borderTop: '1px solid #f0f0f0', display:'flex', gap:'10px', alignItems: 'center', flexShrink: 0},
    messengerInput: { flex:1, padding:'10px', borderRadius:'20px', border:'1px solid #ddd', outline:'none' },
    emptyChatState: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#999' },
    messageRow: {
        display: 'flex',
        marginBottom: '4px',
        width: '100%'
    },
    bubbleMe: {
        padding: '10px 16px',
        borderRadius: '18px 18px 4px 18px',
        backgroundColor: '#3498db', // Màu xanh
        color: 'white',
        maxWidth: '65%',
        fontSize: '14.5px',
        lineHeight: '1.5',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        wordWrap: 'break-word' as 'break-word'
    },
    bubbleOther: {
        padding: '10px 16px',
        borderRadius: '18px 18px 18px 4px',
        backgroundColor: '#f1f0f0', // Màu xám
        color: '#1c1e21',
        maxWidth: '65%',
        fontSize: '14.5px',
        lineHeight: '1.5',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        wordWrap: 'break-word' as 'break-word'
    },
    timestamp: {
        fontSize: '10px',
        color: '#999',
        marginTop: '4px',
        marginLeft: '5px',
        marginRight: '5px'
    },
    
    // Dropdowns & Modals
    notificationDropdown: { position: 'absolute', top: '40px', right: '-10px', width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 1100, border:'1px solid #eee' },
    dropdownMenu: { position: 'absolute', top: '50px', right: '0', width: '160px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #eee' },
    dropdownHeader: { padding: '10px', background:'#f8f9fa', fontSize:'13px', fontWeight:'bold', borderBottom:'1px solid #eee' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '10px 15px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#333', fontSize:'14px' },
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000 },
    modalContent: { background:'white', padding:'0', borderRadius:'12px', width:'600px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', overflow:'hidden' },
    modalHeader: { padding:'15px 20px', background:'#f8f9fa', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' },
    closeBtn: { border:'none', background:'none', fontSize:'16px', cursor:'pointer', color:'#666' },
    reportBox: { background:'#f8f9fa', padding:'15px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.02)' },
    reportLabel: { fontSize:'13px', color:'#7f8c8d', marginBottom:'5px', textTransform:'uppercase', fontWeight:'600' as '600' }, 
    reportValue: { fontSize:'28px', fontWeight:'bold', color:'#2c3e50' },
    label: { display:'block', marginBottom:'5px', fontSize:'13px', fontWeight:'600', color:'#555' },
    inputForm: { width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'14px', outline:'none' },
};

export default DashboardDr;