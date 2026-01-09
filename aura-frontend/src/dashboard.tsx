import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaTrash, FaImage, FaFileAlt, 
    FaHome, FaComments, FaHospital, FaCreditCard, 
    FaBell, FaSignOutAlt, FaSearch, FaUserCircle, FaCamera 
} from 'react-icons/fa';

// --- Dashboard Component (USER / PATIENT) ---
const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('Guest');
    const [userName, setUserName] = useState<string>('');
    const [_id, setUserId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true); 
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [chatData, setChatData] = useState<any[]>([]); 
    const [full_name, setFullName] = useState<string>('');

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

    // --- STATE FORM ĐĂNG KÝ PHÒNG KHÁM ---
    const [clinicForm, setClinicForm] = useState({
        name: '', address: '', phone: '', license: '', description: ''
    });
    const [isSubmittingClinic, setIsSubmittingClinic] = useState(false);
    
    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // State ảnh upload
    const [clinicImages, setClinicImages] = useState<{ front: File | null, back: File | null }>({ 
        front: null, back: null 
    });
    const [previewImages, setPreviewImages] = useState<{ front: string | null, back: string | null }>({ 
        front: null, back: null 
    });

    // --- 1. HÀM TẢI DANH SÁCH CHAT ---
    const fetchChatData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: localhost
            const res = await fetch('http://localhost:8000/api/v1/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats || []; // Fallback mảng rỗng

                setChatData(prevChats => {
                    // Giữ nguyên logic sort của bạn
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

    // --- 2. HÀM TẢI LỊCH SỬ KHÁM (QUAN TRỌNG) ---
// Trong file dashboard.tsx

    const fetchMedicalRecords = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA 1: Thêm dấu '/' ở cuối URL để tránh lỗi 307 Redirect
            const historyRes = await fetch('http://localhost:8000/api/v1/medical-records/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (historyRes.ok) {
                const rawData = await historyRes.json();
                const list = Array.isArray(rawData) ? rawData : (rawData.items || rawData.history || []);

                console.log("Dữ liệu gốc từ API:", list); // Giữ log để debug

                const mappedHistory = list.map((item: any) => {
                // 1. Ngày tháng
                const rawDate = item.created_at || item.upload_date || new Date().toISOString();
                
                // 2. Lấy object kết quả (Do backend đã sửa trả về chuẩn field analysis_result)
                const analysisData = item.analysis_result || {};

                // 3. Xác định trạng thái và kết quả hiển thị
                // Ưu tiên lấy risk_level từ analysis_result
                const risk = analysisData.risk_level;
                
                let statusDisplay = "PENDING";
                let resultDisplay = "Đang phân tích...";

                // Logic: Nếu có risk_level thì coi như đã xong
                if (risk) {
                    statusDisplay = "COMPLETED";
                    resultDisplay = risk; 
                }

                return {
                    id: item.id,
                    date: new Date(rawDate).toLocaleDateString('vi-VN'),
                    time: new Date(rawDate).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}),
                    result: resultDisplay,
                    status: statusDisplay,
                    annotated_url: analysisData.annotated_image_url || null
                };
            });

                // Sắp xếp mới nhất lên đầu
                setHistoryData(mappedHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            }
        } catch (err) { console.error("Lỗi cập nhật hồ sơ:", err); }
    }, []);

    // --- 3. HÀM TẢI TIN NHẮN CHAT ---
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
        if (partnerId === 'system') {
             setCurrentMessages([{id: 'sys', content: 'Chào mừng bạn đến với AURA!', is_me: false, time: ''}]);
             return;
        }
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        
        const token = localStorage.getItem('token');
        if (token) {
            setChatData(prev => prev.map(c => c.id === partnerId ? { ...c, unread: false } : c));
            // Sửa method thành POST hoặc PUT tùy backend chat của bạn
            await fetch(`http://localhost:8000/api/v1/chat/read/${partnerId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        fetchChatData(); 
    };

    const checkRoleAndRedirect = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('http://localhost:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
            if (res.ok) {
                const data = await res.json();
                // SỬA: Lấy role trực tiếp
                const currentRole = data.role || (data.user_info && data.user_info.role);
                
                if (currentRole === 'clinic') {
                     alert("🎉 Hồ sơ đã được duyệt! Chuyển hướng...");
                     navigate('/clinic-dashboard', { replace: true });
                }
                if (currentRole !== userRole) setUserRole(currentRole);
            }
        } catch (e) {}
    }, [navigate, userRole]);


    // --- 4. GỬI TIN NHẮN ---
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
            await fetch('http://localhost:8000/api/v1/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
            });
        } catch (err) { alert("Lỗi gửi tin!"); }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [currentMessages]);

    // --- HÀM XỬ LÝ CHỌN ẢNH ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            let objectUrl: string | null = null;
            if (file.type.startsWith('image/')) {
                 objectUrl = URL.createObjectURL(file);
            }
            setClinicImages(prev => ({ ...prev, [type]: file }));
            setPreviewImages(prev => ({ ...prev, [type]: objectUrl }));
        }
    };

    const removeImage = (type: 'front' | 'back') => {
        setClinicImages(prev => ({ ...prev, [type]: null }));
        setPreviewImages(prev => ({ ...prev, [type]: null }));
    };

    // --- HÀM ĐĂNG KÝ PHÒNG KHÁM ---
    const handleClinicSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingClinic(true);
        const token = localStorage.getItem('token');
    
        try {
            const formData = new FormData();
            
            // 1. SỬA TÊN KEY CHO KHỚP VỚI BACKEND (api/clinic.py)
            formData.append('name', clinicForm.name);       // Backend: name
            formData.append('address', clinicForm.address); // Backend: address
            formData.append('phone', clinicForm.phone);     // Backend: phone (đã map map với biến phone_number trong service)
            
            // 2. XỬ LÝ MÃ GIẤY PHÉP (Do DB chưa có cột license, ta ghép vào mô tả)
            const fullDescription = `Mã GP: ${clinicForm.license}. \n${clinicForm.description}`;
            formData.append('description', fullDescription);

            // 3. XỬ LÝ FILE ẢNH
            // Backend chỉ nhận 1 file có key là "logo". 
            // Ta ưu tiên lấy ảnh mặt trước làm logo.
            if (clinicImages.front) {
                formData.append('logo', clinicImages.front); 
            } else if (clinicImages.back) {
                // Nếu không có mặt trước thì lấy mặt sau đỡ
                formData.append('logo', clinicImages.back);
            }

            // Gọi API
            const res = await fetch('http://localhost:8000/api/v1/clinics/register', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}` 
                    // Lưu ý: KHÔNG ĐƯỢC set 'Content-Type': 'multipart/form-data' thủ công 
                    // Fetch sẽ tự động set boundary cho FormData
                },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                alert("Gửi yêu cầu đăng ký thành công! Vui lòng chờ Admin phê duyệt.");
                // Reset form
                setClinicForm({ name: '', address: '', phone: '', license: '', description: '' }); 
                setClinicImages({ front: null, back: null });
                setPreviewImages({ front: null, back: null });
                
                // Chuyển tab hoặc reload data nếu cần
                setActiveTab('home');
            } else {
                // Hiển thị chi tiết lỗi trả về từ Backend
                console.error("Lỗi Backend:", data);
                alert(data.detail || "Có lỗi xảy ra, vui lòng kiểm tra lại thông tin.");
            }
        } catch (error) {
            console.error("Lỗi đăng ký:", error);
            alert("Lỗi kết nối server!");
        } finally {
            setIsSubmittingClinic(false);
        }
    };

    // --- 5. POLLING TỰ ĐỘNG ---
    useEffect(() => {
        const interval = setInterval(async () => {
             // Chỉ poll khi tab đang active để tiết kiệm tài nguyên
             if (activeTab === 'messages') fetchChatData(); 
             if (activeTab === 'home') fetchMedicalRecords();
             
             if (selectedChatId && selectedChatId !== 'system') {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                if (serverMsgs && serverMsgs.length > currentMessages.length) setCurrentMessages(serverMsgs);
             }
             // Check role nâng hạng
             if (userRole === 'USER') {
                 checkRoleAndRedirect();
             }
        }, 5000); // Tăng lên 5s cho đỡ lag
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData, fetchMedicalRecords, currentMessages.length, userRole, checkRoleAndRedirect, activeTab]);

    // --- LOGIC KHỞI TẠO (GET /api/users/me) ---
    useEffect(() => {
        const initData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }
            try {
                const userResponse = await fetch('http://localhost:8000/api/v1/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (!userResponse.ok) { handleLogout(); return; }
                
                const userData = await userResponse.json();
                
                // SỬA: Xử lý dữ liệu phẳng
                // Nếu backend trả về phẳng: { username: '...', role: '...' }
                // Nếu backend trả về lồng: { user_info: { ... } }
                const info = userData.user_info || userData;
                const userProfile = info.profile || {};

                setUserName(info.username || info.userName || '');
                setUserRole(info.role);
                setUserId(info.id);
                setFullName(userProfile.full_name || info.full_name || '');
                
                await fetchMedicalRecords(); 
                await fetchChatData(); 
            } catch (error) { console.error("Lỗi tải dữ liệu:", error); } 
            finally { setIsLoading(false); }
        };
        initData();
    }, [navigate, fetchChatData, fetchMedicalRecords]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };
    
    const goToProfilePage = () => { setShowUserMenu(false); navigate('/profile'); };
    const goToUpload = () => navigate('/upload');
    const goToHistory = () => navigate('/history');
    
    // SỬA: Link đúng tới trang chi tiết
    const goToDetail = (recordId: string) => navigate(`/analysis-result/${recordId}`);
    
    const toggleNotifications = () => {
        const newState = !showNotifications;
        setShowNotifications(newState);
        setShowUserMenu(false);
        if (newState) setHasViewedNotifications(true);
    };

    const getStatusColor = (status: string) => {
        if (!status) return "#e67e22";
        const s = status.toUpperCase();
        if (s.includes("HOÀN THÀNH") || s.includes("COMPLETED")) return "#28a745"; 
        if (s.includes("LỖI") || s.includes("FAILED")) return "#dc3545"; 
        return "#e67e22"; // Pending
    };

    const totalScans = historyData.length;
    // SỬA logic đếm nguy cơ cao dựa trên ai_result mới
    const highRiskCount = historyData.filter(item => {
        const res = (item.result || "").toLowerCase();
        return res.includes('nặng') || res.includes('severe') || res.includes('moderate') || res.includes('pdr');
    }).length;
    
    const recentNotifications = historyData.slice(0, 5);
    const serverHasUnread = recentNotifications.some(item => (item.status || "").toUpperCase() === 'COMPLETED');
    const showRedDot = serverHasUnread && !hasViewedNotifications;
    const unreadMessagesCount = chatData.filter(chat => chat.unread).length; 

    // --- RENDER CONTENT ---
    const renderContent = () => {
        // --- 1. RENDER FORM ĐĂNG KÝ ---
        if (activeTab === 'clinic-register') {
            return (
                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h2 style={styles.pageTitle}><FaHospital style={{marginRight: 10}}/>Đăng ký Phòng khám</h2>
                    </div>
                    <div style={{padding: '25px'}}>
                        <p style={{ color: '#666', marginBottom: '20px' }}>Vui lòng điền thông tin và tải lên giấy tờ chứng thực (Giấy phép kinh doanh / CCHN).</p>
                        
                        <form onSubmit={handleClinicSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={styles.formLabel}>Tên phòng khám <span style={{color:'red'}}>*</span></label>
                                    <input required type="text" style={styles.formInput} placeholder="Nhập tên phòng khám..." value={clinicForm.name} onChange={(e) => setClinicForm({...clinicForm, name: e.target.value})} />
                                </div>
                                 <div>
                                    <label style={styles.formLabel}>Mã số giấy phép <span style={{color:'red'}}>*</span></label>
                                    <input required type="text" style={styles.formInput} placeholder="GPKD/CCHN..." value={clinicForm.license} onChange={(e) => setClinicForm({...clinicForm, license: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label style={styles.formLabel}>Địa chỉ <span style={{color:'red'}}>*</span></label>
                                <input required type="text" style={styles.formInput} placeholder="Số nhà, đường, phường/xã..." value={clinicForm.address} onChange={(e) => setClinicForm({...clinicForm, address: e.target.value})} />
                            </div>
                            
                            <div>
                                <label style={styles.formLabel}>Số điện thoại <span style={{color:'red'}}>*</span></label>
                                <input required type="text" style={styles.formInput} placeholder="0912..." value={clinicForm.phone} onChange={(e) => setClinicForm({...clinicForm, phone: e.target.value})} />
                            </div>

                            {/* --- PHẦN UPLOAD ẢNH --- */}
                            <div style={{marginTop: '10px'}}>
                                <label style={styles.formLabel}>Ảnh chứng thực giấy tờ <span style={{color:'red'}}>*</span></label>
                                <div style={styles.uploadGrid}>
                                    <div style={styles.uploadBox}>
                                        {previewImages.front ? (
                                            <div style={styles.previewContainer}>
                                                <img src={previewImages.front} alt="Front" style={styles.previewImage} />
                                                <button type="button" onClick={() => removeImage('front')} style={styles.removeBtn}><FaTrash /></button>
                                            </div>
                                        ) : (
                                            <label style={styles.uploadLabel}>
                                                <FaImage size={30} color="#007bff" />
                                                <span style={{marginTop: '10px', fontSize:'14px', color:'#666'}}>Ảnh mặt trước</span>
                                                <input type="file" accept="image/*" hidden onChange={(e) => handleFileSelect(e, 'front')} />
                                            </label>
                                        )}
                                    </div>

                                    <div style={styles.uploadBox}>
                                        {clinicImages.back ? (
                                            <div style={styles.previewContainer}>
                                                {clinicImages.back.type.startsWith('image/') ? (
                                                    <img src={previewImages.back || ''} alt="Back" style={styles.previewImage} />
                                                ) : (
                                                    <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#555'}}>
                                                        <FaFileAlt size={40} color="#6c757d" />
                                                        <span style={{fontSize:'13px', marginTop:'10px', padding:'0 10px', textAlign:'center', wordBreak:'break-all'}}>
                                                            {clinicImages.back.name}
                                                        </span>
                                                    </div>
                                                )}
                                                <button type="button" onClick={() => removeImage('back')} style={styles.removeBtn}><FaTrash /></button>
                                            </div>
                                        ) : (
                                            <label style={styles.uploadLabel}>
                                                <FaFileAlt size={30} color="#007bff" />
                                                <span style={{marginTop: '10px', fontSize:'14px', color:'#666'}}>Ảnh mặt sau/PDF</span>
                                                <input type="file" accept='.pdf, .doc, .docx, .xls, .xlsx, .csv, image/*' hidden onChange={(e) => handleFileSelect(e, 'back')} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                                <p style={{fontSize:'12px', color:'#999', marginTop:'8px'}}>* Định dạng hỗ trợ: JPG, PNG, PDF. Dung lượng tối đa 5MB.</p>
                            </div>

                            <div>
                                <label style={styles.formLabel}>Giới thiệu ngắn</label>
                                <textarea rows={3} style={{...styles.formInput, resize: 'vertical'}} placeholder="Mô tả về chuyên khoa, dịch vụ..." value={clinicForm.description} onChange={(e) => setClinicForm({...clinicForm, description: e.target.value})} />
                            </div>

                            <button type="submit" style={{...styles.primaryBtn, width: 'fit-content', opacity: isSubmittingClinic ? 0.7 : 1}} disabled={isSubmittingClinic}>
                                {isSubmittingClinic ? 'Đang gửi hồ sơ...' : 'Gửi hồ sơ đăng ký'}
                            </button>
                        </form>
                    </div>
                </div>
            );
        }

        // --- 2. RENDER CHAT ---
        if (activeTab === 'messages') {
            const currentPartner = chatData.find(c => c.id === selectedChatId);
            return (
                <div style={styles.messengerCard}>
                    <div style={styles.chatListPanel}>
                        <div style={styles.chatHeaderLeft}><h2 style={{margin: 0, fontSize: '20px'}}>Tin nhắn</h2></div>
                        <div style={styles.chatListScroll}>
                            {chatData.map(msg => (
                                <div key={msg.id} style={{...styles.chatListItem, backgroundColor: selectedChatId === msg.id ? '#ebf5ff' : 'transparent'}} onClick={() => openChat(msg.id)}>
                                    <div style={styles.avatarLarge}>{(msg.full_name || msg.sender || 'U').charAt(0).toUpperCase()}</div>
                                    <div style={{flex: 1, overflow: 'hidden'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{fontWeight: msg.unread ? '800' : '500', fontSize: '15px', color: '#050505'}}>{msg.full_name || msg.sender}</span></div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}><p style={{margin: 0, fontSize: '13px', color: msg.unread ? '#050505' : '#65676b', fontWeight: msg.unread ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{msg.preview}</p><span style={{fontSize: '11px', color: '#65676b'}}>• {msg.time}</span></div>
                                    </div>
                                    {msg.unread && <div style={styles.unreadBlueDot}></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={styles.chatWindowPanel}>
                        {selectedChatId ? (
                            <>
                                <div style={styles.chatWindowHeader}>
                                    <div style={styles.avatarMedium}>{(currentPartner?.full_name || currentPartner?.sender || '').charAt(0).toUpperCase()}</div>
                                    <div style={{flex: 1}}><h4 style={{margin: 0, fontSize: '16px'}}>{currentPartner?.full_name || currentPartner?.sender}</h4><span style={{fontSize: '12px', color: '#65676b'}}>{currentPartner?.id === 'system' ? 'Hệ thống' : 'Bác sĩ'}</span></div>
                                </div>
                                <div style={styles.messagesBody}>
                                    {currentMessages.map((msg, idx) => (
                                        <div key={idx} style={{display: 'flex', justifyContent: msg.is_me ? 'flex-end' : 'flex-start', marginBottom: '10px'}}>
                                            {!msg.is_me && <div style={styles.avatarSmall}>{(currentPartner?.sender || 'U').charAt(0).toUpperCase()}</div>}
                                            <div style={{maxWidth: '65%', padding: '8px 12px', borderRadius: '18px', backgroundColor: msg.is_me ? '#007bff' : '#e4e6eb', color: msg.is_me ? 'white' : 'black', fontSize: '14.5px', lineHeight: '1.4', position: 'relative'}} title={msg.time}>{msg.content}</div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                {selectedChatId !== 'system' && (
                                    <div style={styles.chatInputArea}>
                                        <form onSubmit={handleSendMessage} style={{flex: 1, display: 'flex'}}><input type="text" placeholder="Nhắn tin..." value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} style={styles.messengerInput} /></form>
                                        <div onClick={handleSendMessage} style={{cursor: 'pointer'}}><FaPaperPlane size={20} color="#007bff" /></div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={styles.emptyChatState}><div style={{width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}><FaComments size={40} color="#007bff"/></div><h3>Chào mừng đến với AURA Chat</h3><p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin.</p></div>
                        )}
                    </div>
                </div>
            );
        }
        
        // --- 3. PAYMENTS ---
        if (activeTab === 'payments') return (
            <div style={styles.card}>
                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaCreditCard style={{marginRight:10}}/>Thanh toán & Dịch vụ</h2></div>
                <div style={{padding:'30px', textAlign:'center', color:'#666'}}>Chức năng đang được phát triển...</div>
            </div>
        );

        // --- 4. HOME (EMPTY STATE) ---
        if (historyData.length === 0 && activeTab === 'home') return (
            <div style={styles.card}>
                <div style={{...styles.emptyStateContainer, padding: '50px'}}>
                    {/* <img src="/logo.svg" alt="Welcome" style={{ width: '100px', marginBottom: '20px' }} /> */}
                    <FaUserCircle size={80} color="#ddd" style={{marginBottom: 20}}/>
                    <h2>Chào mừng bạn đến với AURA!</h2>
                    <p style={{color:'#666'}}>Bạn chưa có dữ liệu sàng lọc nào.</p>
                    <button onClick={goToUpload} style={styles.primaryBtn}>Bắt đầu ngay</button>
                </div>
            </div>
        );
        
        // --- 5. HOME (DASHBOARD) ---
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: '30px'}}>
                {/* Stats Cards */}
                <div style={styles.card}>
                    <div style={styles.cardHeader}><h2 style={styles.pageTitle}>📊 Tổng quan sức khỏe</h2></div>
                    <div style={{padding:'25px', display: 'flex', gap: '50px'}}>
                         <div><span style={{ fontSize: '14px', color: '#666' }}>Tổng lần khám</span><h1 style={{ margin: '5px 0 0', color: '#007bff' }}>{totalScans}</h1></div>
                         <div><span style={{ fontSize: '14px', color: '#666' }}>Nguy cơ cao</span><h1 style={{ margin: '5px 0 0', color: highRiskCount > 0 ? '#dc3545' : '#28a745' }}>{highRiskCount}</h1></div>
                    </div>
                </div>

                {/* History Table */}
                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h3 style={styles.pageTitle}>🕒 Lịch sử khám gần đây</h3>
                        <button onClick={goToHistory} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontWeight: 'bold' }}>Xem tất cả &rarr;</button>
                    </div>
                    <table style={styles.table}>
                        <thead><tr><th style={styles.th}>Ngày khám</th><th style={styles.th}>Kết quả AI</th><th style={styles.th}>Hành động</th></tr></thead>
                        <tbody>
                            {historyData.map((item, i) => (
                                <tr key={i} style={styles.tr}>
                                    <td style={styles.td}>{item.date} <br/><small style={{color:'#999'}}>{item.time}</small></td>
                                    <td style={styles.td}>
                                        <span style={{color: getStatusColor(item.status), fontWeight:'bold'}}>
                                            {item.status.includes('PENDING') || item.status.includes('Đang') ? 'Đang phân tích...' : item.result}
                                        </span>
                                        {(item.status.includes('PENDING') || item.status.includes('Đang')) && <span style={styles.spinner}> ⏳</span>}
                                    </td>
                                    <td style={styles.td}><button onClick={() => goToDetail(item.id)} style={{...styles.actionBtn, opacity: item.status.includes('PENDING') ? 0.6 : 1}}>Xem chi tiết</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        {/* <img src="/logo.svg" alt="Logo" style={{width:'30px'}} /> */}
                        <FaHome size={24} color="#007bff"/>
                        <span style={styles.logoText}>AURA HEALTH</span>
                    </div>
                    <div style={styles.clinicName}>Dành cho Bệnh nhân</div>
                </div>
                <nav style={styles.nav}>
                    <div style={activeTab === 'home' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('home')}>
                        <FaHome style={styles.menuIcon} /> Trang chủ
                    </div>
                    <div style={activeTab === 'messages' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('messages')}>
                        <FaComments style={styles.menuIcon} /> Tin nhắn 
                        {unreadMessagesCount > 0 && <span style={styles.badge}>{unreadMessagesCount}</span>}
                    </div>
                    <div style={activeTab === 'clinic-register' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('clinic-register')}>
                        <FaHospital style={styles.menuIcon} /> Đăng ký Phòng khám
                    </div>
                    <div style={activeTab === 'payments' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('payments')}>
                        <FaCreditCard style={styles.menuIcon} /> Thanh toán
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                     <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.searchBox}>
                        <FaSearch color="#999" />
                        <input type="text" placeholder="Tìm kiếm hồ sơ..." style={styles.searchInput} />
                    </div>
                    
                    <div style={styles.headerRight}>
                        {/* Notifications */}
                        <div style={{position:'relative'}} ref={notificationRef}>
                             <button style={styles.iconBtn} onClick={toggleNotifications}>
                                <FaBell color="#555" size={18}/>
                                {showRedDot && <span style={styles.bellBadge}></span>}
                             </button>
                             {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    {recentNotifications.length > 0 ? recentNotifications.map((n:any)=><div key={n.id} style={styles.notificationItem} onClick={()=>goToDetail(n.id)}>{n.result}</div>) : <div style={{padding:'15px', fontSize:'13px', color:'#999'}}>Không có thông báo mới</div>}
                                </div>
                            )}
                        </div>

                        {/* Profile */}
                        <div style={{ position: 'relative' }} ref={profileRef}>
                        <div 
                            style={styles.profileBox} 
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            >
                            <div style={styles.avatarCircle}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
                            <span style={styles.userNameText}>{full_name || userName || 'User'}</span>
                        </div>
                        {showUserMenu && (
                            <div style={styles.dropdownMenu}>
                                <div style={{padding:'15px', borderBottom:'1px solid #eee'}}>
                                    <strong>{full_name}</strong><br/><small style={{color:'#666'}}>{userRole}
                                    </small></div>
                                <button style={styles.dropdownItem} onClick={goToProfilePage}><FaUserCircle style={{marginRight:8}}/> Hồ sơ cá nhân</button>
                                <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}><FaSignOutAlt style={{marginRight:8}}/> Đăng xuất</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

                <div style={styles.contentBody}>
                    {renderContent()}
                </div>
            </main>
            
            {/* FAB BUTTON */}
            <div style={styles.fabContainer}>
                {showFabMenu && <div style={styles.fabMenu}><button style={styles.fabMenuItem} onClick={goToUpload}><FaCamera style={{marginRight:10}}/> Tải ảnh mới</button></div>}
                <button style={styles.fabButton} onClick={() => setShowFabMenu(!showFabMenu)}>{showFabMenu ? '✕' : '+'}</button>
            </div>
        </div>
    );
};

// --- STYLES (Giữ nguyên, chỉ đảm bảo tính đồng bộ) ---
const styles: { [key: string]: React.CSSProperties } = {
    // Layout
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    
    // Sidebar
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'40px' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    logoutBtn: { width: '100%', padding: '10px', background: '#fff0f0', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    badge: { marginLeft: 'auto', backgroundColor: '#dc3545', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' },

    // Main Content
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    searchBox: { display: 'flex', alignItems: 'center', background: '#f8f9fa', borderRadius: '8px', padding: '8px 15px', width: '350px', border: '1px solid #eee' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', fontWeight:'600' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    iconBtn: { background:'none', border:'none', cursor:'pointer', position:'relative', padding:'5px' },
    bellBadge: { position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px', backgroundColor: '#dc3545', borderRadius: '50%' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },

    // Cards & Tables (Unified)
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px' },
    cardHeader: { padding:'20px 25px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
    pageTitle: { fontSize: '16px', margin: 0, display:'flex', alignItems:'center', color: '#333' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px 25px', borderBottom: '1px solid #eee', color: '#8898aa', fontSize:'11px', textTransform:'uppercase', fontWeight:'700', background:'#fbfbfb' },
    tr: { borderBottom: '1px solid #f5f5f5' },
    td: { padding: '15px 25px', verticalAlign: 'middle', color:'#333' },
    actionBtn: { background: '#fff', border: '1px solid #007bff', color: '#007bff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
    primaryBtn: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600' },
    
    // Dropdowns
    notificationDropdown: { position: 'absolute', top: '40px', right: '-10px', width: '300px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', zIndex: 1100, border:'1px solid #eee' },
    notificationItem: { padding: '12px', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize:'13px', color:'#333' },
    dropdownMenu: { position: 'absolute', top: '60px', right: '30px', width: '220px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #eee' },
    dropdownHeader: { padding: '10px 15px', borderBottom: '1px solid #eee', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#f8f9fa', color: '#333' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '10px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#333', fontSize:'14px' },

    // Forms
    formLabel: { display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333', fontSize: '14px' },
    formInput: { width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box', background:'#fff' },
    uploadGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '10px' },
    uploadBox: { border: '2px dashed #ccd0d5', borderRadius: '12px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', position: 'relative', overflow: 'hidden' },
    uploadLabel: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: '100%', height: '100%', justifyContent: 'center', transition: 'background 0.2s' },
    previewContainer: { width: '100%', height: '100%', position: 'relative' },
    previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
    removeBtn: { position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems:'center',justifyContent:'center',color:'#dc3545',boxShadow:'0 2px 5px rgba(0, 0, 0, 0.2)' },

    // Chat Interface
    messengerCard: { display: 'flex', height: 'calc(100vh - 140px)', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow: 'hidden' },
    chatListPanel: { width: '320px', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' },
    chatHeaderLeft: { padding: '20px', borderBottom: '1px solid #f0f0f0' },
    chatListScroll: { flex: 1, overflowY: 'auto', padding: '10px' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s', gap: '12px' },
    avatarLarge: { width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#65676b', position: 'relative' },
    unreadBlueDot: { width: '10px', height: '10px', backgroundColor: '#007bff', borderRadius: '50%' },
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' },
    chatWindowHeader: { padding: '15px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '12px' },
    avatarMedium: { width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#65676b', fontSize:'14px' },
    messagesBody: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' },
    avatarSmall: { width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', marginRight: '8px', alignSelf: 'flex-end', marginBottom: '8px' },
    chatInputArea: { padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #f0f0f0' },
    messengerInput: { flex: 1, backgroundColor: '#f0f2f5', border: 'none', borderRadius: '20px', padding: '10px 16px', fontSize: '14px', outline: 'none' },
    emptyChatState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', textAlign: 'center' },

    // FAB
    fabContainer: { position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 2000 },
    fabButton: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', fontSize: '24px', border: 'none', boxShadow: '0 4px 10px rgba(0,123,255,0.4)', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    fabMenu: { marginBottom: '15px', backgroundColor: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' },
    fabMenuItem: { padding: '10px 15px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display:'flex', alignItems:'center', fontSize:'14px', color:'#333' },
    spinner: { display: 'inline-block', animation: 'spin 2s linear infinite' },
    emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: '16px', padding: '40px' },
};

// Keyframes
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Dashboard;