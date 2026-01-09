import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaSearch, FaSignOutAlt, FaUserMd, FaRobot, FaUpload, FaSpinner,
    FaBoxOpen, FaChartLine, FaFileExport, FaExclamationTriangle,
    FaClipboardList, FaUserCircle, FaUserPlus, FaStethoscope, FaEdit, FaTrash, FaEye,
    FaHistory, FaArrowRight, FaCamera, FaTimes 
} from 'react-icons/fa';

// --- INTERFACES ---
interface Patient {
    id: string;
    username: string;
    full_name: string;
    phone: string;
    email?: string;
    latest_scan?: {
        ai_result: string;
        ai_analysis_status: string;
        upload_date: string;
    } | null;
    assigned_doctor?: string;
    assigned_doctor_id?: string;
}

interface Doctor {
    id: string;
    username: string;
    full_name: string;
    email: string;
    phone: string;
    patient_count: number;
    status: string;
}

interface Service {
    id: number;
    name: string;
    price: string;
    description: string;
}

const ClinicDashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI ---
    const [activeMenu, setActiveMenu] = useState('accounts');
    const [showUserMenu, setShowUserMenu] = useState(false);
    
    // --- STATE DATA ---
    const [clinicName, setClinicName] = useState('Phòng khám AURA');
    const [adminName, setAdminName] = useState('Clinic Admin'); // <--- Thêm state này
    const [patients, setPatients] = useState<Patient[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);

    // --- STATE MOCK SERVICES (Dữ liệu mẫu cho phần dịch vụ) ---
    const [services, setServices] = useState<Service[]>([
        { id: 1, name: "Khám mắt tổng quát", price: "200.000 đ", description: "Kiểm tra thị lực, đo nhãn áp" },
        { id: 2, name: "Chụp đáy mắt AI", price: "500.000 đ", description: "Sử dụng AI AURA phát hiện bệnh lý võng mạc" },
    ]);

    // --- STATE AI ANALYSIS & UPLOAD ---
    const [aiHistory, setAiHistory] = useState<any[]>([]);
    
    // --- STATE MODALS QUẢN LÝ ---
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [targetDoctorId, setTargetDoctorId] = useState('');

    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [searchDocTerm, setSearchDocTerm] = useState('');
    const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);
    
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [searchPatientTerm, setSearchPatientTerm] = useState('');
    const [availablePatients, setAvailablePatients] = useState<any[]>([]);

    // Refs
    const userMenuRef = useRef<HTMLDivElement>(null);

    // --- 1. FETCH DATA (General) ---
    const fetchDashboardData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            const res = await fetch('http://localhost:8000/api/v1/clinics/dashboard-data', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClinicName(data.clinic?.name || "Phòng khám AURA");
                setAdminName(data.admin_name || "Clinic Admin");
                setPatients(data.patients || []);
                setDoctors(data.doctors || []);

            }
        } catch (error) { 
            console.error("Lỗi tải dashboard:", error); 
        } finally { 
            setLoading(false); 
        }
    }, [navigate]);

// --- 2. FETCH AI HISTORY ---
// --- Trong file ClinicDashboard.tsx ---

const fetchAiHistory = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('http://localhost:8000/api/v1/medical-records/clinic-history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            
            // Backend trả về list trực tiếp
            const list = Array.isArray(data) ? data : (data.history || []);
            
            const mappedHistory = list.map((item: any) => ({
                id: item.id,
                // Format ngày tháng
                date: item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : "Vừa xong",
                time: item.created_at ? new Date(item.created_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : "",
                
                // QUAN TRỌNG: Lấy tên bệnh nhân. 
                // Nếu backend chưa join bảng User, nó có thể null -> hiển thị tạm ID hoặc placeholder
                patient_name: item.user ? item.user.full_name : (item.patient_name || `Bệnh nhân #${item.user_id}`),
                
                image_url: item.image_url,
                result: item.ai_result || "Đang xử lý...", 
                status: item.ai_analysis_status || "PENDING"
            }));
            
            setAiHistory(mappedHistory);
        }
    } catch (error) { console.error("Lỗi tải lịch sử AI:", error); }
}, []);

    // --- INITIAL LOAD & POLLING ---
    useEffect(() => {
        fetchDashboardData();
        fetchAiHistory();
    }, [fetchDashboardData, fetchAiHistory]);

    // Tự động refresh dữ liệu mỗi 5s
    useEffect(() => {
        const interval = setInterval(() => {
            if (activeMenu === 'ai') fetchAiHistory();
            if (activeMenu === 'accounts' || activeMenu === 'stats') fetchDashboardData();
        }, 5000);
        return () => clearInterval(interval);
    }, [activeMenu, fetchAiHistory, fetchDashboardData]);

    // Click outside to close menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

// --- HANDLERS: SEARCH & ADD DOCTOR/PATIENT ---
    const searchDoctors = async (query: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://localhost:8000/api/v1/clinics/doctors/available?query=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { 
                const data = await res.json(); 
                const foundDoctors = data.doctors || [];

                // --- SỬA ĐỔI Ở ĐÂY: Lọc bỏ những bác sĩ đã có trong danh sách ---
                // Chỉ giữ lại bác sĩ nào KHÔNG có id trùng với danh sách doctors hiện tại
                const filteredDoctors = foundDoctors.filter((d: any) => 
                    !doctors.some(existingDoc => existingDoc.id === d.id)
                );
                
                setAvailableDoctors(filteredDoctors); 
            }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (showAddDoctorModal) { setSearchDocTerm(''); searchDoctors(''); } }, [showAddDoctorModal]);

const handleAddExistingDoctor = async (doctorId: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://localhost:8000/api/v1/clinics/add-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: doctorId }) // Gửi ID lên server
            });

            if (res.ok) {
                setAvailableDoctors(prev => prev.filter(d => d.id !== doctorId));
                fetchDashboardData(); 
                // 2. Tải lại danh sách tìm kiếm để cập nhật trạng thái nút bấm
                searchDoctors(searchDocTerm);
            } else {
                alert("Lỗi khi thêm bác sĩ");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const searchPatients = async (query: string) => {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`http://localhost:8000/api/v1/clinics/patients/available?query=${query}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) { 
                    const data = await res.json(); 
                    const foundPatients = data.patients || [];

                    // --- SỬA ĐỔI Ở ĐÂY: Lọc bỏ những bệnh nhân đã có trong danh sách ---
                    const filteredPatients = foundPatients.filter((p: any) => 
                        !patients.some(existingPatient => existingPatient.id === p.id)
                    );

                    setAvailablePatients(filteredPatients); 
                }
            } catch (error) { console.error(error); }
        };

    useEffect(() => { if (showAddPatientModal) { setSearchPatientTerm(''); searchPatients(''); } }, [showAddPatientModal]);

    const handleAddExistingPatient = async (patientId: string) => {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch('http://localhost:8000/api/v1/clinics/add-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ user_id: patientId })
                });

                if (res.ok) {
                    setAvailablePatients(prev => prev.filter(p => p.id !== patientId));
                    fetchDashboardData(); // Refresh dashboard
                    searchPatients(searchPatientTerm); // Refresh modal list
                }
            } catch (error) {
                console.error(error);
            }
        };

    const submitAssignment = async () => {
        if (!selectedPatient || !targetDoctorId) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://localhost:8000/api/v1/clinics/assign-patient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ patient_id: selectedPatient.id, doctor_id: targetDoctorId })
            });
            if (res.ok) {
                setShowAssignModal(false); 
                fetchDashboardData();
                alert("Đã phân công thành công!");
            } else alert("Lỗi phân công.");
        } catch(e) { alert("Lỗi kết nối."); }
    };

    const exportToCSV = () => {
        const headers = ["ID,Họ Tên,Email,SĐT,Bác sĩ phụ trách,Kết quả AI,Ngày khám gần nhất"];
        const rows = patients.map(p => `"${p.id}","${p.full_name}","${p.email || ''}","${p.phone}","${p.assigned_doctor || 'Chưa có'}","${p.latest_scan?.ai_result || 'Chưa khám'}","${p.latest_scan?.upload_date || ''}"`);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = `AURA_Clinic_Report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    // Helper: Màu trạng thái
    const getStatusColor = (result: string) => {
        if (!result) return 'black';
        const r = result.toLowerCase();
        if (r.includes('nặng') || r.includes('severe') || r.includes('pdr')) return '#dc3545'; // Đỏ
        if (r.includes('vừa') || r.includes('moderate')) return '#fd7e14'; // Cam
        if (r.includes('bình thường') || r.includes('normal') || r.includes('không')) return '#28a745'; // Xanh
        return '#007bff'; // Xanh dương (khác)
    };

    // Filter Warning Patients
    const warningPatients = patients.filter(p => {
        const res = (p.latest_scan?.ai_result || "").toLowerCase();
        return res.includes('nặng') || res.includes('severe') || res.includes('pdr') || res.includes('moderate');
    });

    if (loading) return <div style={styles.loading}><FaSpinner className="spin" size={30} /> &nbsp; Đang tải dữ liệu phòng khám...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        {/* <img src="/logo.svg" alt="Logo" style={{width:'30px'}} /> */}
                        <FaUserMd size={24} color="#007bff"/>
                        <span style={styles.logoText}>AURA CLINIC</span>
                    </div>
                    <div style={styles.clinicName}>{clinicName}</div>
                </div>
                <nav style={styles.nav}>
                    <div style={activeMenu === 'accounts' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveMenu('accounts')}>
                        <FaClipboardList style={styles.menuIcon} /> Quản lý Tổng hợp
                    </div>
                    <div style={activeMenu === 'ai' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveMenu('ai')}>
                        <FaRobot style={styles.menuIcon} /> Phân tích AI
                    </div>
                    <div style={activeMenu === 'services' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveMenu('services')}>
                        <FaBoxOpen style={styles.menuIcon} /> Dịch vụ
                    </div>
                    <div style={activeMenu === 'stats' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveMenu('stats')}>
                        <FaChartLine style={styles.menuIcon} /> Thống kê & Cảnh báo
                        {warningPatients.length > 0 && <span style={styles.badgeWarn}>{warningPatients.length}</span>}
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.searchBox}><FaSearch color="#999" /><input type="text" placeholder="Tìm kiếm hồ sơ..." style={styles.searchInput} /></div>
                    <div style={styles.headerRight}>
                        <div style={{position:'relative'}} ref={userMenuRef}>
                            <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>C</div>
                                <span style={styles.userNameText}>{adminName}</span>
                            </div>
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    <button style={styles.dropdownItem} onClick={handleLogout}><FaSignOutAlt style={{marginRight:8}}/> Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    
                    {/* --- TAB 1: ACCOUNTS (QUẢN LÝ) --- */}
                    {activeMenu === 'accounts' && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '30px'}}>
                            {/* Bảng Bác sĩ */}
                            <div style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaUserMd style={{marginRight: 10}}/>Danh sách Bác sĩ</h2>
                                    <button onClick={() => setShowAddDoctorModal(true)} style={styles.primaryBtnSm}><FaUserPlus style={{marginRight: 5}}/> Thêm bác sĩ</button>
                                </div>
                                <table style={styles.table}>
                                    <thead><tr><th style={styles.th}>BÁC SĨ</th><th style={styles.th}>LIÊN HỆ</th><th style={styles.th}>TRẠNG THÁI</th><th style={styles.th}>SỐ BỆNH NHÂN</th></tr></thead>
                                    <tbody>
                                        {doctors.length === 0 ? <tr><td colSpan={4} style={styles.emptyCell}>Chưa có bác sĩ nào.</td></tr> : doctors.map(d => (
                                            <tr key={d.id} style={styles.tr}>
                                                <td style={styles.td}><b>{d.full_name}</b><br/><small style={{color:'#888'}}>@{d.username}</small></td>
                                                <td style={styles.td}>{d.email}<br/>{d.phone}</td>
                                                <td style={styles.td}><span style={styles.statusActive}>Hoạt động</span></td>
                                                <td style={styles.td}><span style={styles.badge}>{d.patient_count} BN</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Bảng Bệnh nhân */}
                            <div style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaUserCircle style={{marginRight: 10}}/>Danh sách Bệnh nhân</h2>
                                    <button onClick={() => setShowAddPatientModal(true)} style={styles.primaryBtnSm}><FaUserPlus style={{marginRight:5}}/> Thêm Bệnh nhân</button>
                                </div>
                                <table style={styles.table}>
                                    <thead><tr><th style={styles.th}>BỆNH NHÂN</th><th style={styles.th}>LIÊN HỆ</th><th style={styles.th}>BÁC SĨ PHỤ TRÁCH</th><th style={styles.th}>KẾT QUẢ AI GẦN NHẤT</th><th style={styles.th}>HÀNH ĐỘNG</th></tr></thead>
                                    <tbody>
                                        {patients.length === 0 ? <tr><td colSpan={5} style={styles.emptyCell}>Chưa có bệnh nhân nào.</td></tr> : patients.map(p => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><b>{p.full_name}</b><br/><small style={{color:'#888'}}>@{p.username}</small></td>
                                                <td style={styles.td}>{p.email}<br/><small>{p.phone}</small></td>
                                                <td style={styles.td}>{p.assigned_doctor_id ? <span style={styles.doctorTagActive}><FaStethoscope style={{marginRight:5}}/> {p.assigned_doctor}</span> : <span style={styles.doctorTagWarning}>Chưa phân công</span>}</td>
                                                <td style={styles.td}>
                                                    {p.latest_scan ? (
                                                        <span style={{fontWeight:'bold', color: getStatusColor(p.latest_scan.ai_result)}}>
                                                            {p.latest_scan.ai_result}
                                                        </span>
                                                    ) : <span style={{color:'#999'}}>--</span>}
                                                </td>
                                                <td style={styles.td}><button onClick={() => {setSelectedPatient(p); setTargetDoctorId(p.assigned_doctor_id||''); setShowAssignModal(true)}} style={styles.actionBtn}>Phân công</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 2: PHÂN TÍCH AI --- */}
                    {activeMenu === 'ai' && (
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                    <h2 style={styles.pageTitle}><FaHistory style={{marginRight: 10}}/>Lịch sử Phân tích AI</h2>
                                    <span style={styles.badge}>{aiHistory.length} Ca khám</span>
                                </div>
                                <button 
                                    onClick={() => navigate('/upload')} 
                                    style={{...styles.primaryBtn, display:'flex', alignItems:'center', gap:'8px'}}>
                                    <FaCamera /> Phân tích
                                </button>
                            </div>

                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Thời gian</th>
                                        <th style={styles.th}>Bệnh nhân</th>
                                        <th style={styles.th}>Hình ảnh</th>
                                        <th style={styles.th}>Kết quả AI</th>
                                        <th style={styles.th}>Trạng thái</th>
                                        <th style={styles.th}>Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aiHistory.length === 0 ? (
                                        <tr><td colSpan={6} style={styles.emptyCell}>Chưa có dữ liệu phân tích nào.</td></tr>
                                    ) : (
                                        aiHistory.map((item) => (
                                            <tr key={item.id} style={styles.tr}>
                                                <td style={styles.td}>{item.date}<br/><small style={{color:'#999'}}>{item.time}</small></td>
                                                <td style={styles.td}><b>{item.patient_name}</b></td>
                                                <td style={styles.td}>
                                                    <img src={item.image_url} alt="Scan" style={{width:'40px', height:'40px', objectFit:'cover', borderRadius:'4px', border:'1px solid #ddd'}} />
                                                </td>
                                                <td style={styles.td}>
                                                    <span style={{color: getStatusColor(item.result), fontWeight: 'bold'}}>{item.result}</span>
                                                </td>
                                                <td style={styles.td}>
                                                    {item.status === 'COMPLETED' 
                                                        ? <span style={styles.statusActive}>Hoàn tất</span>
                                                        : <span style={styles.statusPending}><FaSpinner className="spin"/> Đang xử lý</span>
                                                    }
                                                </td>
                                                <td style={styles.td}>
                                                    <button onClick={() => navigate(`/analysis-result/${item.id}`)} style={styles.actionBtn}>Xem</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* --- TAB 3: DỊCH VỤ --- */}
                    {activeMenu === 'services' && (
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <h2 style={styles.pageTitle}><FaBoxOpen style={{marginRight: 10}}/>Dịch vụ Phòng khám</h2>
                                <button style={styles.primaryBtnSm}>+ Thêm Dịch vụ</button>
                            </div>
                            <table style={styles.table}>
                                <thead><tr><th style={styles.th}>Tên Dịch vụ</th><th style={styles.th}>Mô tả</th><th style={styles.th}>Giá tiền</th><th style={styles.th}>Thao tác</th></tr></thead>
                                <tbody>
                                    {services.map(s => (
                                        <tr key={s.id} style={styles.tr}>
                                            <td style={styles.td}><b>{s.name}</b></td>
                                            <td style={styles.td}>{s.description}</td>
                                            <td style={styles.td}><span style={{color: '#007bff', fontWeight: 'bold'}}>{s.price}</span></td>
                                            <td style={styles.td}>
                                                <div style={{display:'flex', gap:'10px'}}>
                                                    <button style={{border:'none', background:'transparent', color:'#555', cursor:'pointer'}}><FaEdit/></button>
                                                    <button style={{border:'none', background:'transparent', color:'red', cursor:'pointer'}}><FaTrash/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* --- TAB 4: THỐNG KÊ --- */}
                    {activeMenu === 'stats' && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '30px'}}>
                            <div style={{...styles.card, borderLeft: '4px solid #dc3545'}}>
                                <div style={styles.cardHeader}>
                                    <h2 style={{...styles.pageTitle, color: '#dc3545'}}><FaExclamationTriangle style={{marginRight: 10}}/>Cảnh báo Bệnh nhân Nặng</h2>
                                    <span style={{background: '#ffe3e6', color: '#dc3545', padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'bold'}}>{warningPatients.length} Trường hợp</span>
                                </div>
                                <table style={styles.table}>
                                    <thead><tr><th style={styles.th}>Bệnh nhân</th><th style={styles.th}>SĐT</th><th style={styles.th}>Kết quả gần nhất</th><th style={styles.th}>Hành động</th></tr></thead>
                                    <tbody>
                                        {warningPatients.length === 0 ? <tr><td colSpan={4} style={styles.emptyCell}>Không có cảnh báo.</td></tr> : warningPatients.map(p => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><b style={{color:'#dc3545'}}>{p.full_name}</b></td>
                                                <td style={styles.td}>{p.phone}</td>
                                                <td style={styles.td}>{p.latest_scan?.ai_result}</td>
                                                <td style={styles.td}><button style={{...styles.primaryBtnSm, background:'#dc3545'}}>Liên hệ gấp</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={styles.card}>
                                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaFileExport style={{marginRight: 10}}/>Xuất Báo cáo</h2></div>
                                <div style={{padding: '25px'}}>
                                    <p style={{color: '#555', marginBottom: '20px'}}>Tải xuống danh sách bệnh nhân và kết quả chẩn đoán dưới dạng file Excel/CSV.</p>
                                    <button onClick={exportToCSV} style={{...styles.primaryBtn, display:'flex', alignItems:'center', gap:'10px'}}><FaFileExport/> Tải xuống (.CSV)</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* --- MODAL: ASSIGN DOCTOR --- */}
            {showAssignModal && selectedPatient && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h3>Phân công Bác sĩ</h3>
                        <p>Cho bệnh nhân: <b>{selectedPatient.full_name}</b></p>
                        <select style={styles.selectInput} value={targetDoctorId} onChange={(e) => setTargetDoctorId(e.target.value)}>
                            <option value="">-- Chọn bác sĩ --</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.patient_count} BN)</option>)}
                        </select>
                        <div style={styles.modalActions}><button onClick={() => setShowAssignModal(false)} style={styles.secondaryBtn}>Đóng</button><button onClick={submitAssignment} style={styles.primaryBtn}>Lưu</button></div>
                    </div>
                </div>
            )}
        
            {/* --- MODAL: ADD PATIENT --- */}
            {showAddPatientModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}}> 
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3>Thêm Bệnh nhân</h3><button onClick={()=>setShowAddPatientModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <input type="text" placeholder="Nhập tên, email hoặc SĐT..." style={styles.selectInput} value={searchPatientTerm} onChange={(e)=>{setSearchPatientTerm(e.target.value); searchPatients(e.target.value)}}/>
                        <div style={{maxHeight:'300px', overflowY:'auto'}}>
                            <table style={styles.table}>
                                <tbody>{availablePatients.map(p=>(<tr key={p.id}><td style={{padding:'10px'}}>{p.full_name}<br/><small>{p.email}</small></td><td><button onClick={()=>handleAddExistingPatient(p.id)} style={styles.primaryBtnSm}>Thêm</button></td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: ADD DOCTOR --- */}
            {showAddDoctorModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}}> 
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3>Thêm Bác sĩ</h3><button onClick={()=>setShowAddDoctorModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <input type="text" placeholder="Tìm kiếm bác sĩ..." style={styles.selectInput} value={searchDocTerm} onChange={(e)=>{setSearchDocTerm(e.target.value); searchDoctors(e.target.value)}}/>
                        <div style={{maxHeight:'300px', overflowY:'auto'}}>
                            <table style={styles.table}>
                                <tbody>{availableDoctors.map(d=>(<tr key={d.id}><td style={{padding:'10px'}}>{d.full_name}<br/><small>{d.email}</small></td><td><button onClick={()=>handleAddExistingDoctor(d.id)} style={styles.primaryBtnSm}>Thêm</button></td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', flexDirection:'column' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'35px' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center', position:'relative' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center', position:'relative' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    logoutBtn: { width: '100%', padding: '10px', background: '#fff0f0', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    searchBox: { display: 'flex', alignItems: 'center', background: '#f8f9fa', borderRadius: '8px', padding: '8px 15px', width: '350px', border: '1px solid #eee' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', fontWeight:'bold' },
    userNameText: { fontSize:'14px', fontWeight:'600' },
    dropdownMenu: { position: 'absolute', top: '50px', right: '0', width: '180px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #eee' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '10px 15px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545', fontSize:'14px' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px' },
    cardHeader: { padding:'20px 25px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
    pageTitle: { fontSize: '16px', margin: 0, display:'flex', alignItems:'center', color: '#333' },
    badge: { background:'#eef2ff', color:'#007bff', padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600' },
    badgeWarn: { background:'#dc3545', color:'white', padding:'2px 8px', borderRadius:'10px', fontSize:'10px', fontWeight:'bold', marginLeft:'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px 25px', borderBottom: '1px solid #eee', color: '#8898aa', fontSize:'11px', textTransform:'uppercase', fontWeight:'700', background:'#fbfbfb' },
    tr: { borderBottom: '1px solid #f5f5f5' },
    td: { padding: '15px 25px', verticalAlign: 'middle', color:'#333' },
    emptyCell: { textAlign: 'center', padding: '30px', color: '#999', fontStyle: 'italic' },
    statusActive: { background: '#d4edda', color: '#155724', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' },
    statusPending: { background: '#fff3cd', color: '#856404', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display:'flex', alignItems:'center', gap:'5px', width:'fit-content' },
    doctorTagActive: { background: '#e3f2fd', color: '#0d47a1', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', display:'inline-flex', alignItems:'center' },
    doctorTagWarning: { background: '#fff3cd', color: '#856404', padding: '5px 10px', borderRadius: '6px', fontSize: '12px' },
    primaryBtnSm: { background: '#007bff', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center' },
    primaryBtn: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600' },
    secondaryBtn: { padding: '10px 20px', background: '#e9ecef', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600' },
    actionBtn: { background: '#fff', border: '1px solid #007bff', color: '#007bff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000 },
    modalContent: { background:'white', padding:'25px', borderRadius:'12px', width:'420px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
    formLabel: { display:'block', marginBottom:'8px', fontSize:'14px', fontWeight:'600' },
    selectInput: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', outline: 'none', fontSize: '14px', background:'#f9f9f9', marginBottom:'20px', boxSizing: 'border-box' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    closeBtn: { border:'none', background:'transparent', fontSize:'18px', cursor:'pointer', color:'#666' },
    uploadBox: { border: '2px dashed #ccd0d5', borderRadius: '8px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', position: 'relative' },
    uploadLabel: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: '100%', height: '100%', justifyContent: 'center' },
    removeImgBtn: { position: 'absolute', top: 5, right: 5, background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: '25px', height: '25px', cursor: 'pointer', color: 'red' },
};

// CSS Animation for Spinner
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(styleSheet);

export default ClinicDashboard;