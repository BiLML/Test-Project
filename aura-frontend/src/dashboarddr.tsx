import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPaperPlane, FaUserMd, FaUsers, FaClipboardList, FaCommentDots } from 'react-icons/fa';
import ProfileDr from './ProfileDr';

// --- Dashboard Component (Bác sĩ) ---
const DashboardDr: React.FC = () => {
    const navigate = useNavigate();

    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('DOCTOR');
    const [userName, setUserName] = useState<string>('');   
    const [full_name, setFullName] = useState<string>(''); 
    const [_id, setUserId] = useState<string>('');    
    const [isLoading, setIsLoading] = useState(true);
    
    // DỮ LIỆU TỪ API
    const [patientsData, setPatientsData] = useState<any[]>([]); 
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [hasViewedNotifications, setHasViewedNotifications] = useState(false);
    
    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- 1. HÀM TẢI DANH SÁCH CHAT (QUAN TRỌNG: ĐÃ THÊM LOGIC MERGE) ---
    const fetchChatData = useCallback(async (token: string) => {
        try {
            const res = await fetch('http://127.0.0.1:8000/api/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats;

                // --- LOGIC GIỮ TIN NHẮN "VỪA XONG" (GIỐNG BÊN USER) ---
                setChatData(prevChats => {
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    
                    const mergedChats = serverChats.map((sChat: any) => {
                        const pChat: any = prevMap.get(sChat.id);
                        // Nếu local đang có tin "Vừa xong" mà server chưa có tin mới hơn -> Giữ nguyên local
                        if (pChat && pChat.time === "Vừa xong" && sChat.preview !== pChat.preview) {
                            return pChat; 
                        }
                        return sChat;
                    });

                    return mergedChats.sort((a: any, b: any) => {
                        if (a.time === "Vừa xong") return -1;
                        if (b.time === "Vừa xong") return 1;
                        return (b.time || "").localeCompare(a.time || ""); 
                    });
                });
                // -----------------------------------------------------
            }
        } catch (error) { console.error("Lỗi chat:", error); }
    }, []);

    // --- 2. HÀM TẢI LỊCH SỬ TIN NHẮN ---
    const fetchMessageHistory = async (partnerId: string) => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/chat/history/${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return data.messages;
        } catch (err) { return []; }
    };

    const openChat = async (partnerId: string) => {
        setSelectedChatId(partnerId);
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        
        const token = localStorage.getItem('token');
        if(token) fetchChatData(token); 
    };

    // --- 3. HÀM GỬI TIN NHẮN (OPTIMISTIC UPDATE CHUẨN) ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;

        const textToSend = newMessageText;
        setNewMessageText(''); 

        // A. Cập nhật Khung Chat (Phải)
        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        setCurrentMessages(prev => [...prev, tempMsg]);

        // B. Cập nhật Danh Sách Chat (Trái) -> Đánh dấu là "Vừa xong"
        setChatData(prevList => {
            const newList = [...prevList];
            const chatIndex = newList.findIndex(c => c.id === selectedChatId);
            
            if (chatIndex > -1) {
                const updatedChat = { 
                    ...newList[chatIndex], 
                    preview: "Bạn: " + textToSend, // Hiện chữ "Bạn:"
                    time: "Vừa xong",              // Đánh dấu để không bị Server ghi đè
                    unread: false                  // Tắt chấm đỏ ngay
                };
                newList.splice(chatIndex, 1);
                newList.unshift(updatedChat);
            }
            return newList;
        });

        try {
            const token = localStorage.getItem('token');
            await fetch('http://127.0.0.1:8000/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
            });
        } catch (err) { alert("Lỗi gửi tin!"); }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [currentMessages]);

    // --- 4. POLLING (Cập nhật thông minh) ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        const interval = setInterval(async () => {
             fetchChatData(token); // Cập nhật danh sách bên trái
             
             // Cập nhật khung chat bên phải
             if (selectedChatId) {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                // Chỉ cập nhật nếu server có NHIỀU tin hơn hoặc BẰNG (để không mất tin vừa gửi)
                if (serverMsgs) {
                    setCurrentMessages(prev => {
                        if (serverMsgs.length >= prev.length) return serverMsgs;
                        return prev;
                    });
                }
             }
        }, 3000); 
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData]);

    // --- LOGIC KHỞI TẠO ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        const initData = async () => {
            try {
                const userRes = await fetch('http://127.0.0.1:8000/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!userRes.ok) throw new Error("Token không hợp lệ.");
                const userData = await userRes.json();
                
                if (userData.user_info.role !== 'DOCTOR') {
                    alert("Bạn không có quyền truy cập trang này!");
                    handleLogout(); return;
                }

                setUserName(userData.user_info.userName);
                setFullName(userData.user_info.full_name || '');
                setUserRole(userData.user_info.role);
                setUserId(userData.user_info.id);

                const patientsRes = await fetch('http://127.0.0.1:8000/api/doctor/my-patients', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (patientsRes.ok) {
                    const data = await patientsRes.json();
                    setPatientsData(data.patients);
                }

                await fetchChatData(token); 
                
            } catch (error) { console.error("Lỗi khởi tạo:", error); } 
            finally { setIsLoading(false); }
        };
        initData();
    }, [navigate, fetchChatData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login', { replace: true });
    };
    
    const handleNavClick = (tabName: string) => setActiveTab(tabName);
    const toggleMenu = () => setShowUserMenu(!showUserMenu);
    
    const toggleNotifications = () => {
        const newState = !showNotifications;
        setShowNotifications(newState);
        if (newState) setHasViewedNotifications(true);
    };

    const goToProfilePage = () => {
        setShowUserMenu(false);
        navigate('/profile-dr'); 
    };
    
    const goToReviewDetail = (recordId: string) => navigate(`/result/${recordId}`);

    // --- TÍNH TOÁN DỮ LIỆU ---
    const unreadMessagesCount = chatData.filter(chat => chat.unread).length;
    
    const pendingRecords = patientsData
        .filter(p => p.latest_scan?.ai_status === 'COMPLETED' && 
                     (p.latest_scan.result.includes('Nặng') || p.latest_scan.result.includes('Tăng sinh') || p.latest_scan.result.includes('Trung bình')))
        .map(p => ({
            id: p.latest_scan.record_id || '',
            patientName: p.userName,
            date: p.latest_scan.date,
            aiResult: p.latest_scan.result,
            status: 'Chờ Bác sĩ',
        }));
        
    const totalPending = pendingRecords.length;
    
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'COMPLETED': return { text: 'Hoàn thành', color: '#28a745' };
            case 'PENDING': return { text: 'Đang xử lý', color: '#ffc107' };
            case 'FAILED': return { text: 'Lỗi', color: '#dc3545' };
            case 'NA': return { text: 'Chưa khám', color: '#6c757d' };
            default: return { text: 'Khác', color: '#6c757d' };
        }
    };
    
    // --- RENDER CONTENT ---
    const renderContent = () => {
        // === TAB CHAT ===
        if (activeTab === 'chat') {
            const currentPartner = chatData.find(c => c.id === selectedChatId);
            return (
                <div style={styles.messengerContainer}>
                    <div style={styles.chatListPanel}>
                        <div style={styles.chatHeaderLeft}>
                            <h2 style={{margin: 0, fontSize: '20px', color: '#333'}}>Chat Tư Vấn</h2>
                        </div>
                        <div style={styles.chatListScroll}>
                            {chatData.map(msg => (
                                <div key={msg.id} style={{...styles.chatListItem, backgroundColor: selectedChatId === msg.id ? '#ebf5ff' : 'transparent'}} onClick={() => openChat(msg.id)}>
                                    <div style={styles.avatarLarge}>
                                        {msg.sender.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{flex: 1, overflow: 'hidden'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                            <span style={{fontWeight: msg.unread ? '800' : '500', fontSize: '15px', color: '#050505'}}>{msg.sender}</span>
                                        </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                            <p style={{margin: 0, fontSize: '13px', color: msg.unread ? '#050505' : '#65676b', fontWeight: msg.unread ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                {msg.preview}
                                            </p>
                                            <span style={{fontSize: '11px', color: '#65676b'}}>• {msg.time}</span>
                                        </div>
                                    </div>
                                    {msg.unread && <div style={styles.unreadRedDot}></div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={styles.chatWindowPanel}>
                        {selectedChatId ? (
                            <>
                                <div style={styles.chatWindowHeader}>
                                    <div style={styles.avatarMedium}>{currentPartner?.sender.charAt(0).toUpperCase()}</div>
                                    <div style={{flex: 1}}>
                                        <h4 style={{margin: 0, fontSize: '16px', color: '#333'}}>{currentPartner?.sender}</h4>
                                        <span style={{fontSize: '12px', color: '#65676b'}}>
                                            {currentPartner?.id === 'system' ? 'Hệ thống' : 'Bệnh nhân'}
                                        </span>
                                    </div>
                                </div>
                                <div style={styles.messagesBody}>
                                    {currentMessages.map((msg, idx) => (
                                        <div key={idx} style={{display: 'flex', justifyContent: msg.is_me ? 'flex-end' : 'flex-start', marginBottom: '10px'}}>
                                            {!msg.is_me && <div style={styles.avatarSmall}>{currentPartner?.sender.charAt(0).toUpperCase()}</div>}
                                            <div style={{
                                                maxWidth: '65%', padding: '8px 12px', borderRadius: '18px', 
                                                backgroundColor: msg.is_me ? '#0084ff' : '#e4e6eb', 
                                                color: msg.is_me ? 'white' : 'black', 
                                                fontSize: '14.5px', lineHeight: '1.4', position: 'relative'
                                            }} title={msg.time}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div style={styles.chatInputArea}>
                                    <form onSubmit={handleSendMessage} style={{flex: 1, display: 'flex'}}>
                                        <input type="text" placeholder="Nhập tin nhắn tư vấn..." value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} style={styles.messengerInput} />
                                    </form>
                                    <div onClick={handleSendMessage} style={{cursor: 'pointer'}}><FaPaperPlane size={20} color="#0084ff" /></div>
                                </div>
                            </>
                        ) : (
                            <div style={styles.emptyChatState}>
                                <div style={{width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}>
                                    <FaCommentDots size={40} color="#65676b"/>
                                </div>
                                <h3>Chat Tư Vấn Bệnh Nhân</h3>
                                <p>Chọn bệnh nhân từ danh sách để bắt đầu.</p>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // --- Tab QUẢN LÝ BỆNH NHÂN ---
        if (activeTab === 'patients') {
            return (
                <div style={styles.contentContainer}>
                    <h2 style={{ marginBottom: '20px', color: '#333' }}>🧑‍⚕️ Danh sách Bệnh nhân được phân công ({patientsData.length})</h2>
                    <table style={styles.table}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                <th style={styles.th}>Tên bệnh nhân</th>
                                <th style={styles.th}>Email/SĐT</th>
                                <th style={styles.th}>Kết quả gần nhất</th>
                                <th style={styles.th}>Trạng thái</th>
                                <th style={styles.th}>Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patientsData.map(p => {
                                 const statusInfo = getStatusBadge(p.latest_scan?.ai_status || 'NA');
                                 const isDisabled = !p.latest_scan?.record_id || p.latest_scan.ai_status !== 'COMPLETED';
                                 return (
                                    <tr key={p.id} style={{borderBottom: '1px solid #f0f0f0'}}>
                                        <td style={{padding: '12px', fontWeight: 'bold', color: '#333'}}>{p.userName}</td>
                                        <td style={{padding: '12px', color: '#555'}}>{p.email}<br/><small>{p.phone}</small></td>
                                        <td style={{padding: '12px'}}>
                                            {p.latest_scan?.result ? (
                                                <span style={{color: p.latest_scan.result.includes('Nặng') ? '#dc3545' : '#28a745', fontWeight: 'bold'}}>
                                                    {p.latest_scan.result}
                                                </span>
                                            ) : <span style={{color: '#999'}}>Chưa khám</span>}
                                        </td>
                                        <td style={{padding: '12px'}}>
                                            <span style={{...styles.statusBadge, backgroundColor: statusInfo.color, color: 'white'}}>
                                                {statusInfo.text}
                                            </span>
                                        </td>
                                        <td style={{padding: '12px'}}>
                                            <div style={{display:'flex', gap:'5px'}}>
                                                <button 
                                                    style={{...styles.reviewBtn, backgroundColor: '#3498db'}}
                                                    onClick={() => { setActiveTab('chat'); openChat(p.id); }}
                                                >
                                                    Nhắn tin
                                                </button>
                                                <button 
                                                    style={{...styles.reviewBtn, backgroundColor: '#2ecc71', opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer'}}
                                                    onClick={() => goToReviewDetail(p.latest_scan?.record_id || '')}
                                                    disabled={isDisabled}
                                                >
                                                    Xem HS
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        // --- Tab HOME ---
        return (
            <div style={styles.contentGrid}>
                <div style={styles.cardInfo}>
                    <h3>🏥 Tổng quan công việc</h3>
                    <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Tổng Bệnh nhân</span>
                            <h1 style={{ margin: '5px 0 0', color: '#3498db', fontSize: '36px' }}>{patientsData.length}</h1>
                        </div>
                        <div>
                            <span style={{ fontSize: '14px', color: '#666' }}>Hồ sơ cần xử lý</span>
                            <h1 style={{ margin: '5px 0 0', color: totalPending > 0 ? '#e74c3c' : '#2ecc71', fontSize: '36px' }}>{totalPending}</h1>
                        </div>
                    </div>
                </div>
                
                <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
                    <h3 style={{ margin: 0, color: '#333' }}>⚠️ Hồ sơ cần xem xét gấp ({totalPending} ca)</h3>
                    {totalPending === 0 ? (
                        <p style={{ marginTop: '15px', color: '#666' }}>Bạn không có hồ sơ nào đang chờ xem xét.</p>
                    ) : (
                        <table style={{ ...styles.table, marginTop: '20px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                    <th style={styles.th}>Bệnh nhân</th>
                                    <th style={styles.th}>Ngày khám</th>
                                    <th style={styles.th}>Kết quả AI</th>
                                    <th style={styles.th}>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRecords.map((item, index) => (
                                    <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#333' }}>{item.patientName}</td>
                                        <td style={{ padding: '12px', color: '#666' }}>{item.date}</td>
                                        <td style={{ padding: '12px', color: '#e74c3c', fontWeight: 'bold' }}>{item.aiResult}</td>
                                        <td style={{ padding: '12px' }}>
                                            <button onClick={() => goToReviewDetail(item.id)} style={{...styles.reviewBtn, backgroundColor: '#e74c3c'}}>
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
            <aside style={styles.sidebar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="AURA Logo" style={styles.logoImage} />
                    <h2 style={{ margin: 0, fontSize: '20px', letterSpacing: '1px' }}>AURA Dr.</h2>
                </div>
                <nav style={styles.navMenu}>
                    <button style={activeTab === 'home' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('home')}>
                        <FaClipboardList style={{marginRight: '10px'}}/> Trang chủ
                    </button>
                    <button style={activeTab === 'patients' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('patients')}>
                        <FaUsers style={{marginRight: '10px'}}/> Bệnh nhân
                    </button>
                    <button style={activeTab === 'chat' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('chat')}>
                        <span style={{marginRight: '10px'}}>💬</span> Chat tư vấn
                        {unreadMessagesCount > 0 && <span style={styles.chatBadge}>{unreadMessagesCount}</span>}
                    </button>
                </nav>
            </aside>

            <main style={styles.main}>
                <header style={styles.header}>
                    <div>
                        <h2 style={{ margin: 0, color: 'white' }}>Chào mừng, {full_name || userName}!</h2>
                        <p style={{ margin: '5px 0 0', color: '#cbd5e1', fontSize: '14px' }}>Bạn có <strong>{totalPending} hồ sơ</strong> cần xem xét ngay.</p>
                    </div>
                    <div style={styles.headerActions}>
                        <div style={{ position: 'relative' }} ref={notificationRef}>
                            <button style={styles.bellBtn} onClick={toggleNotifications}>🔔 {(!hasViewedNotifications && unreadMessagesCount > 0) && <span style={styles.bellBadge}></span>}</button>
                            {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    <div style={{padding:'15px', textAlign: 'center', color: '#666'}}>Trống</div>
                                </div>
                            )}
                        </div>
                        <div style={{ position: 'relative' }} ref={profileRef}>
                            <div style={styles.avatar} onClick={toggleMenu}>{userName ? userName.charAt(0).toUpperCase() : 'D'}</div>
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    <div style={styles.dropdownHeader}><strong>BS. {full_name|| userName}</strong><br/><small>{userRole}</small></div>
                                    <button style={styles.dropdownItem} onClick={() => navigate('/profile-dr')}>👤 Hồ sơ cá nhân</button>
                                    <div style={{height: '1px', background: '#eee', margin: '5px 0'}}></div>
                                    <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}>🚪 Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {renderContent()}
            </main>
        </div>
    );
};

// --- STYLES: GIỮ NGUYÊN MÀU SẮC THEO YÊU CẦU ---
const styles: { [key: string]: React.CSSProperties } = {
    // 1. Layout & Sidebar (Màu #34495e - Xanh đen bác sĩ)
    container: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#f4f6f9', margin: 0, padding: 0, overflow: 'hidden' },
    sidebar: { width: '260px', backgroundColor: '#34495e', color: 'white', display: 'flex', flexDirection: 'column', padding: '30px 20px', boxSizing: 'border-box', flexShrink: 0 },
    logoArea: { textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    logoImage: { width: '60px', height: 'auto', marginBottom: '10px', filter: 'brightness(0) invert(1)' },
    navMenu: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' },
    navItem: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: 'transparent', border: 'none', color: '#ecf0f1', fontSize: '15px', cursor: 'pointer', borderRadius: '8px', transition: '0.2s', display: 'flex', alignItems: 'center' },
    
    // 2. Active State (Màu #e74c3c - Đỏ cam nổi bật)
    navItemActive: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' },
    
    // 3. Header & Avatar
    main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', overflowY: 'auto', boxSizing: 'border-box' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexShrink: 0, backgroundColor: '#2c3e50', padding: '20px 30px', borderRadius: '12px', color: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    headerActions: { display: 'flex', alignItems: 'center', gap: '20px' },
    bellBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'white', position: 'relative' },
    bellBadge: { position: 'absolute', top: '0', right: '0', width: '8px', height: '8px', backgroundColor: '#e74c3c', borderRadius: '50%' },
    avatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e74c3c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', border: '2px solid white' },
    
    // 4. Dropdown Menu (Fix lỗi màu chữ)
    notificationDropdown: { position: 'absolute', top: '45px', right: '-10px', width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 1100, color: '#333' },
    dropdownMenu: { position: 'absolute', top: '50px', right: '0', width: '200px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', padding: '10px 0', zIndex: 1000, border: '1px solid #eee', color: '#333' },
    dropdownHeader: { padding: '10px 20px', borderBottom: '1px solid #eee', marginBottom: '5px', backgroundColor: '#f8f9fa', color: '#333' }, // Fix màu chữ
    dropdownItem: { display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', transition: 'background 0.2s', color: '#333' },

    // 5. Nội dung chung
    contentContainer: { backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' },
    cardInfo: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    card: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0' },
    th: { padding: '12px', color: '#555', fontWeight: '600', fontSize: '14px' },
    td: { padding: '12px', fontSize: '14px', verticalAlign: 'middle' },
    statusBadge: { padding: '5px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' },
    reviewBtn: { backgroundColor: '#3498db', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
    
    // 6. MESSENGER STYLES (Đã tích hợp)
    messengerContainer: { display: 'flex', height: '80vh', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e4e6eb' },
    chatListPanel: { width: '350px', borderRight: '1px solid #e4e6eb', display: 'flex', flexDirection: 'column' },
    chatHeaderLeft: { padding: '15px 16px', borderBottom: '1px solid transparent' },
    chatListScroll: { flex: 1, overflowY: 'auto', padding: '8px' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s', gap: '12px' },
    avatarLarge: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#65676b', position: 'relative' },
    unreadRedDot: { width: '12px', height: '12px', backgroundColor: '#e74c3c', borderRadius: '50%' }, // Chấm đỏ
    chatBadge: { marginLeft: 'auto', backgroundColor: 'white', color: '#e74c3c', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' },
    
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' },
    chatWindowHeader: { padding: '12px 16px', borderBottom: '1px solid #e4e6eb', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)', zIndex: 10 },
    avatarMedium: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#65676b' },
    messagesBody: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '2px' },
    avatarSmall: { width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '8px', alignSelf: 'flex-end', marginBottom: '8px' },
    chatInputArea: { padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #e4e6eb' },
    messengerInput: { flex: 1, backgroundColor: '#f0f2f5', border: 'none', borderRadius: '20px', padding: '9px 16px', fontSize: '15px', outline: 'none' },
    emptyChatState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#65676b', textAlign: 'center' }
};

export default DashboardDr;