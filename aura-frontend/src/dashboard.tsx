import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPaperPlane } from 'react-icons/fa';

// --- Dashboard Component ---
const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('Guest');
    const [userName, setUserName] = useState<string>('');
    const [_id, setUserId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true); 
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [hasViewedNotifications, setHasViewedNotifications] = useState(false);

    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- 1. HÀM TẢI DANH SÁCH CHAT ---
    const fetchChatData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('http://127.0.0.1:8000/api/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats;

                setChatData(prevChats => {
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    const mergedChats = serverChats.map((sChat: any) => {
                        const pChat: any = prevMap.get(sChat.id);
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
        if (partnerId === 'system') {
             setCurrentMessages([{id: 'sys', content: 'Chào mừng bạn đến với AURA!', is_me: false, time: ''}]);
             return;
        }
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        fetchChatData(); 
    };

    // --- 3. HÀM GỬI TIN NHẮN ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;

        const textToSend = newMessageText;
        setNewMessageText(''); 

        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        setCurrentMessages(prev => [...prev, tempMsg]);

        setChatData(prevList => {
            const newList = [...prevList];
            const chatIndex = newList.findIndex(c => c.id === selectedChatId);
            if (chatIndex > -1) {
                const updatedChat = { 
                    ...newList[chatIndex], 
                    preview: "Bạn: " + textToSend, 
                    time: "Vừa xong",
                    unread: false 
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

    // --- POLLING ---
    useEffect(() => {
        const interval = setInterval(async () => {
             fetchChatData(); 
             if (selectedChatId && selectedChatId !== 'system') {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                if (serverMsgs && serverMsgs.length > currentMessages.length) {
                    setCurrentMessages(serverMsgs);
                }
             }
        }, 3000); 
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData, currentMessages.length]);

    // --- LOGIC KHỞI TẠO ---
    const fetchMedicalRecords = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const historyRes = await fetch('http://127.0.0.1:8000/api/medical-records', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (historyRes.ok) {
                const historyData = await historyRes.json();
                setHistoryData(historyData.history);
            }
        } catch (err) { console.error("Lỗi cập nhật:", err); }
    };

    useEffect(() => {
        const initData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }
            try {
                const userResponse = await fetch('http://127.0.0.1:8000/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!userResponse.ok) { handleLogout(); return; }
                const userData = await userResponse.json();
                setUserName(userData.user_info.userName);
                setUserRole(userData.user_info.role);
                setUserId(userData.user_info.id);
                await fetchMedicalRecords();
                await fetchChatData(); 
            } catch (error) { console.error("Lỗi tải dữ liệu:", error); } 
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

    const handleNavClick = (tabName: string) => {
        setActiveTab(tabName);
        setShowNotifications(false);
        setShowUserMenu(false);
    };
    
    const goToProfilePage = () => {
        setShowUserMenu(false);
        navigate('/profile'); 
    };
    
    const goToUpload = () => navigate('/upload');
    const goToHistory = () => navigate('/history');
    const goToDetail = (recordId: string) => navigate(`/result/${recordId}`);
    
    const toggleNotifications = () => {
        const newState = !showNotifications;
        setShowNotifications(newState);
        setShowUserMenu(false);
        if (newState) setHasViewedNotifications(true);
    };

    // --- RENDER ---
    const totalScans = historyData.length;
    const highRiskCount = historyData.filter(item => item.result.includes('Nặng') || item.result.includes('Trung Bình')).length;
    const recentNotifications = historyData.slice(0, 5);
    const serverHasUnread = recentNotifications.some(item => item.status === 'Hoàn thành');
    const showRedDot = serverHasUnread && !hasViewedNotifications;
    const unreadMessagesCount = chatData.filter(chat => chat.unread).length; 

    const renderContent = () => {
        if (activeTab === 'messages') {
            const currentPartner = chatData.find(c => c.id === selectedChatId);
            return (
                <div style={styles.messengerContainer}>
                    {/* CỘT TRÁI: DANH SÁCH CHAT */}
                    <div style={styles.chatListPanel}>
                        <div style={styles.chatHeaderLeft}>
                            <h2 style={{margin: 0, fontSize: '24px'}}>Chat</h2>
                        </div>
                        <div style={styles.chatListScroll}>
                            {chatData.map(msg => (
                                <div key={msg.id} style={{...styles.chatListItem, backgroundColor: selectedChatId === msg.id ? '#ebf5ff' : 'transparent'}} onClick={() => openChat(msg.id)}>
                                    <div style={styles.avatarLarge}>
                                    {/* Lấy chữ cái đầu của full_name, nếu không có thì dùng sender */}
                                    {(msg.full_name || msg.sender).charAt(0).toUpperCase()}
                                </div>
                                <div style={{flex: 1, overflow: 'hidden'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                    {/* Hiển thị full_name */}
                                    <span style={{fontWeight: msg.unread ? '800' : '500', fontSize: '15px', color: '#050505'}}>
                                        {msg.full_name || msg.sender}
                                    </span>
                                </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                            <p style={{margin: 0, fontSize: '13px', color: msg.unread ? '#050505' : '#65676b', fontWeight: msg.unread ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                                {msg.preview}
                                            </p>
                                            <span style={{fontSize: '11px', color: '#65676b'}}>• {msg.time}</span>
                                        </div>
                                    </div>
                                    {msg.unread && <div style={styles.unreadBlueDot}></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* CỘT PHẢI: KHUNG CHAT */}
                    <div style={styles.chatWindowPanel}>
                        {selectedChatId ? (
                            <>
                                <div style={styles.chatWindowHeader}>
                                    <div style={styles.avatarMedium}>
                                        {(currentPartner?.full_name || currentPartner?.sender || '').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{flex: 1}}>
                                        <h4 style={{margin: 0, fontSize: '16px'}}>
                                            {currentPartner?.full_name || currentPartner?.sender}
                                        </h4>
                                        <span style={{fontSize: '12px', color: '#65676b'}}>
                                            {currentPartner?.id === 'system' ? 'Hệ thống' : 'Bác sĩ'}
                                        </span>
                                    </div>
                                </div>
                                <div style={styles.messagesBody}>
                                    {currentMessages.map((msg, idx) => (
                                        <div key={idx} style={{display: 'flex', justifyContent: msg.is_me ? 'flex-end' : 'flex-start', marginBottom: '10px'}}>
                                            {!msg.is_me && <div style={styles.avatarSmall}>{currentPartner?.sender.charAt(0).toUpperCase()}</div>}
                                            <div style={{maxWidth: '65%', padding: '8px 12px', borderRadius: '18px', backgroundColor: msg.is_me ? '#0084ff' : '#e4e6eb', color: msg.is_me ? 'white' : 'black', fontSize: '14.5px', lineHeight: '1.4', position: 'relative'}} title={msg.time}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                
                                {/* ẨN THANH INPUT NẾU LÀ SYSTEM */}
                                {selectedChatId !== 'system' && (
                                    <div style={styles.chatInputArea}>
                                        <form onSubmit={handleSendMessage} style={{flex: 1, display: 'flex'}}>
                                            <input type="text" placeholder="Nhắn tin..." value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} style={styles.messengerInput} />
                                        </form>
                                        <div onClick={handleSendMessage} style={{cursor: 'pointer'}}><FaPaperPlane size={20} color="#0084ff" /></div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={styles.emptyChatState}>
                                <div style={{width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}>
                                    <img src="/logo.svg" alt="AURA Logo" style={{width: '50px'}}  />
                                </div>
                                <h3>Chào mừng đến với AURA Chat</h3>
                                <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin.</p>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        if (activeTab === 'payments') return <div style={styles.contentContainer}><h2>💳 Dịch vụ & Thanh toán</h2><p>Chức năng đang phát triển...</p></div>;
        if (historyData.length === 0) return <div style={styles.emptyStateContainer}><img src="/logo.svg" alt="Welcome" style={{ width: '120px', marginBottom: '20px' }} /><h2>Chào mừng bạn đến với AURA!</h2><p>Bạn chưa có dữ liệu sàng lọc nào.</p><button onClick={goToUpload} style={styles.bigPrimaryBtn}>Bắt đầu ngay</button></div>;
        
        return (
            <div style={styles.contentGrid}>
                <div style={styles.cardInfo}>
                    <h3>📊 Tổng quan</h3>
                    <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
                        <div><span style={{ fontSize: '14px', color: '#666' }}>Tổng lần khám</span><h1 style={{ margin: '5px 0 0', color: '#007bff' }}>{totalScans}</h1></div>
                        <div><span style={{ fontSize: '14px', color: '#666' }}>Nguy cơ cao</span><h1 style={{ margin: '5px 0 0', color: highRiskCount > 0 ? '#dc3545' : '#28a745' }}>{highRiskCount}</h1></div>
                    </div>
                </div>
                <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}><h3 style={{ margin: 0 }}>🕒 Lịch sử gần đây</h3><button onClick={goToHistory} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontWeight: 'bold' }}>Xem tất cả &rarr;</button></div>
                    <table style={styles.table}>
                        <thead><tr style={{ textAlign: 'left' }}><th style={{padding:'12px'}}>Ngày</th><th style={{padding:'12px'}}>Kết quả</th><th style={{padding:'12px'}}>Hành động</th></tr></thead>
                        <tbody>
                            {historyData.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{padding:'12px'}}>{item.date} <small style={{color:'#999'}}>{item.time}</small></td>
                                    <td style={{padding:'12px', fontWeight:'bold'}}>{item.result}</td>
                                    <td style={{padding:'12px'}}><button onClick={() => goToDetail(item.id)} style={styles.viewDetailBtn}>Xem</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh'}}>Loading...</div>;

    return (
        <div style={styles.container}>
            <aside style={styles.sidebar}>
                <div style={styles.logoArea}><img src="/logo.svg" alt="AURA" style={styles.logoImage}/><h2>AURA</h2></div>
                <nav style={styles.navMenu}>
                    <button style={activeTab === 'home' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('home')}>🏠 Trang chủ</button>
                    <button style={activeTab === 'messages' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('messages')}>
                        💬 Tin nhắn {unreadMessagesCount > 0 && <span style={styles.chatBadge}>{unreadMessagesCount}</span>}
                    </button>
                    <button style={activeTab === 'payments' ? styles.navItemActive : styles.navItem} onClick={() => handleNavClick('payments')}>💳 Thanh toán</button>
                </nav>
            </aside>
            <main style={styles.main}>
                <header style={styles.header}>
                    <div><h2 style={{margin:0}}>Xin chào, {userName}!</h2></div>
                    <div style={styles.headerActions}>
                        <div style={{position:'relative'}} ref={notificationRef}>
                            <button style={styles.bellBtn} onClick={toggleNotifications}>🔔 {showRedDot && <span style={styles.bellBadge}></span>}</button>
                            {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    {recentNotifications.length > 0 ? recentNotifications.map((n:any)=><div key={n.id} style={styles.notificationItem} onClick={()=>goToDetail(n.id)}>{n.result}</div>) : <div style={{padding:'10px'}}>Trống</div>}
                                </div>
                            )}
                        </div>
                        <div style={{position:'relative'}} ref={profileRef}>
                            <div style={styles.avatar} onClick={()=>setShowUserMenu(!showUserMenu)}>{userName.charAt(0)}</div>
                            
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    <div style={styles.dropdownHeader}>
                                        <strong>{userName}</strong><br/><small>{userRole}</small>
                                    </div>
                                    <button style={styles.dropdownItem} onClick={goToProfilePage}>👤 Hồ sơ cá nhân</button>
                                    <div style={{height: '1px', background: '#eee', margin: '5px 0'}}></div>
                                    <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}>🚪 Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                {renderContent()}
            </main>
            <div style={styles.fabContainer}>
                {showFabMenu && <div style={styles.fabMenu}><button style={styles.fabMenuItem} onClick={goToUpload}>📷 Tải ảnh</button></div>}
                <button style={styles.fabButton} onClick={() => setShowFabMenu(!showFabMenu)}>{showFabMenu ? '✕' : '+'}</button>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', width: '100vw', height: '100vh', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#f4f6f9', overflow: 'hidden' },
    sidebar: { width: '260px', backgroundColor: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', padding: '30px 20px', alignItems: 'center' },
    logoArea: { textAlign: 'center', marginBottom: '40px' }, logoImage: { width: '60px', marginBottom: '10px' },
    navMenu: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' },
    navItem: { width: '100%', padding: '12px 15px', textAlign: 'left', background: 'none', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' },
    navItemActive: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#007bff', border: 'none', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', overflowY: 'auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', backgroundColor: '#1e293b', padding: '20px 30px', borderRadius: '16px', color: 'white' },
    headerActions: { display: 'flex', alignItems: 'center', gap: '20px' },
    bellBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'white', position: 'relative' },
    bellBadge: { position: 'absolute', top: '0', right: '0', width: '8px', height: '8px', backgroundColor: '#dc3545', borderRadius: '50%' },
    notificationDropdown: { position: 'absolute', top: '45px', right: '-10px', width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 1100, color: '#333' },
    notificationItem: { padding: '12px', borderBottom: '1px solid #eee', cursor: 'pointer' },
    avatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', border: '2px solid white' },
    dropdownMenu: { position: 'absolute', top: '60px', right: '0', width: '220px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', padding: '10px 0', zIndex: 1000, border: '1px solid #eee' },
    dropdownItem: { display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#333' },
    contentContainer: { backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', height: '100%' },
    cardInfo: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    card: { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0' },
    viewDetailBtn: { backgroundColor: '#007bff', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
    emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: '16px', padding: '40px' },
    bigPrimaryBtn: { marginTop: '20px', padding: '15px 40px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '50px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' },
    fabContainer: { position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 2000 },
    fabButton: { width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', fontSize: '30px', border: 'none', boxShadow: '0 4px 10px rgba(0,123,255,0.4)', cursor: 'pointer' },
    fabMenu: { marginBottom: '15px', backgroundColor: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' },
    fabMenuItem: { padding: '10px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' },
    chatBadge: { marginLeft: 'auto', backgroundColor: '#dc3545', color: 'white', fontSize: '12px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' },
    dropdownHeader: { padding: '10px 20px', borderBottom: '1px solid #eee', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#f8f9fa', color: '#333' },
    messengerContainer: { display: 'flex', height: '80vh', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e4e6eb' },
    chatListPanel: { width: '350px', borderRight: '1px solid #e4e6eb', display: 'flex', flexDirection: 'column' },
    chatHeaderLeft: { padding: '15px 16px', borderBottom: '1px solid transparent' },
    chatListScroll: { flex: 1, overflowY: 'auto', padding: '8px' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s', gap: '12px' },
    avatarLarge: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#65676b', position: 'relative' },
    unreadBlueDot: { width: '12px', height: '12px', backgroundColor: '#0084ff', borderRadius: '50%' },
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' },
    chatWindowHeader: { padding: '12px 16px', borderBottom: '1px solid #e4e6eb', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)', zIndex: 10 },
    avatarMedium: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#65676b' },
    messagesBody: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '2px' },
    avatarSmall: { width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '8px', alignSelf: 'flex-end', marginBottom: '8px' },
    chatInputArea: { padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #e4e6eb' },
    messengerInput: { flex: 1, backgroundColor: '#f0f2f5', border: 'none', borderRadius: '20px', padding: '9px 16px', fontSize: '15px', outline: 'none' },
    emptyChatState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#65676b', textAlign: 'center' }
};

export default Dashboard;