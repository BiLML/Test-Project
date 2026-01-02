import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaSearch, FaSignOutAlt, FaUserMd, FaRobot, FaUpload, FaSpinner,
    FaBoxOpen, FaChartLine, FaFileExport, FaExclamationTriangle,
    FaClipboardList, FaUserCircle, FaUserPlus, FaStethoscope, FaEdit, FaTrash, FaEye,
    FaHistory, FaArrowRight 
} from 'react-icons/fa';

// --- INTERFACES ---
interface Patient {
    id: string;
    full_name: string;
    phone: string;
    email?: string;
    last_result: string;
    assigned_doctor: string;
    assigned_doctor_id?: string;
}

interface Doctor {
    id: string;
    userName: string;
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
    const [patients, setPatients] = useState<Patient[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);

    // --- STATE MOCK SERVICES ---
    const [services, setServices] = useState<Service[]>([
        { id: 1, name: "Khám mắt tổng quát", price: "200.000 đ", description: "Kiểm tra thị lực, đo nhãn áp" },
        { id: 2, name: "Chụp đáy mắt AI", price: "500.000 đ", description: "Sử dụng AI AURA phát hiện bệnh lý võng mạc" },
    ]);

    // --- STATE AI ANALYSIS ---
    const [aiPatientId, setAiPatientId] = useState('');
    const [aiFile, setAiFile] = useState<File | null>(null);
    const [aiPreview, setAiPreview] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [aiHistory, setAiHistory] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- STATE MODALS ---
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [targetDoctorId, setTargetDoctorId] = useState('');

    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [searchDocTerm, setSearchDocTerm] = useState('');
    const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);
    
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [searchPatientTerm, setSearchPatientTerm] = useState('');
    const [availablePatients, setAvailablePatients] = useState<any[]>([]);

    // --- FETCH DATA ---
    const fetchDashboardData = async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            const res = await fetch('http://127.0.0.1:8000/api/clinic/dashboard-data', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClinicName(data.clinic?.name || "Phòng khám AURA");
                setPatients(data.patients);
                setDoctors(data.doctors);
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    useEffect(() => { fetchDashboardData(); }, []);

    // --- LOGIC AI ANALYSIS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAiFile(file);
            setAiPreview(URL.createObjectURL(file));
            setAnalysisResult(null); // Reset kết quả cũ
        }
    };

    const handleAnalyze = async () => {
        if (!aiPatientId) return alert("Vui lòng chọn bệnh nhân!");
        if (!aiFile) return alert("Vui lòng chọn ảnh!");

        setIsAnalyzing(true);
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('patient_id', aiPatientId);
        formData.append('file', aiFile);

        try {
            // 1. Upload ảnh & Tạo hồ sơ
            const res = await fetch('http://127.0.0.1:8000/api/clinic/upload-scan', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error("Lỗi upload");
            
            const data = await res.json();
            const recordId = data.record_id;

            // 2. Polling để lấy kết quả AI (Chờ tối đa 10s)
            let attempts = 0;
            const interval = setInterval(async () => {
                attempts++;
                const pollRes = await fetch(`http://127.0.0.1:8000/api/clinic/record/${recordId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (pollRes.ok) {
                    const recordData = await pollRes.json();
                    if (recordData.status === 'COMPLETED' || recordData.status === 'FAILED') {
                        clearInterval(interval);
                        setAnalysisResult(recordData);
                        setIsAnalyzing(false);
                        fetchDashboardData(); // Refresh lại danh sách tổng hợp
                    }
                }
                if (attempts > 20) { // Timeout sau 40s
                    clearInterval(interval);
                    setIsAnalyzing(false);
                    alert("AI đang xử lý lâu hơn dự kiến. Vui lòng kiểm tra lại lịch sử sau.");
                }
            }, 2000);

        } catch (error) {
            console.error(error);
            setIsAnalyzing(false);
            alert("Có lỗi xảy ra khi phân tích.");
        }
    };

    // --- OTHER HANDLERS (SEARCH, ADD, ASSIGN) ---
    const searchDoctors = async (query: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/doctors/available?query=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { const data = await res.json(); setAvailableDoctors(data.doctors); }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (showAddDoctorModal) { setSearchDocTerm(''); searchDoctors(''); } }, [showAddDoctorModal]);

    const handleAddExistingDoctor = async (doctorId: string) => {
        if(!window.confirm("Thêm bác sĩ này?")) return;
        const token = localStorage.getItem('token');
        await fetch('http://127.0.0.1:8000/api/clinic/add-existing-doctor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ doctor_id: doctorId })
        });
        setShowAddDoctorModal(false); fetchDashboardData();
    };

    const searchPatients = async (query: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/patients/available?query=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { const data = await res.json(); setAvailablePatients(data.patients); }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (showAddPatientModal) { setSearchPatientTerm(''); searchPatients(''); } }, [showAddPatientModal]);

    const handleAddExistingPatient = async (patientId: string) => {
        if(!window.confirm("Thêm bệnh nhân này?")) return;
        const token = localStorage.getItem('token');
        await fetch('http://127.0.0.1:8000/api/clinic/add-existing-patient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ patient_id: patientId })
        });
        setShowAddPatientModal(false); fetchDashboardData();
    };

    const submitAssignment = async () => {
        if (!selectedPatient || !targetDoctorId) return;
        const token = localStorage.getItem('token');
        await fetch('http://127.0.0.1:8000/api/clinic/assign-patient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ patient_id: selectedPatient.id, doctor_id: targetDoctorId })
        });
        setShowAssignModal(false); fetchDashboardData();
    };

    // [HÀM MỚI] Lấy lịch sử AI khi chuyển tab
    const fetchAiHistory = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/clinic/ai-history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAiHistory(data.history);
            }
        } catch (error) { console.error(error); }
    };

    // Gọi API khi chuyển sang tab 'ai'
    useEffect(() => {
        if (activeMenu === 'ai') {
            fetchAiHistory();
        }
    }, [activeMenu]);

    const exportToCSV = () => {
        const headers = ["ID,Họ Tên,Email,SĐT,Bác sĩ phụ trách,Kết quả AI"];
        const rows = patients.map(p => `"${p.id}","${p.full_name}","${p.email || ''}","${p.phone}","${p.assigned_doctor}","${p.last_result}"`);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = `AURA_ThongKe_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };
    const warningPatients = patients.filter(p => p.last_result.toLowerCase().match(/nặng|severe|cao/));



    if (loading) return <div style={styles.loading}>Đang tải dữ liệu...</div>;

    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <img src="/logo.svg" alt="Logo" style={{width:'30px'}} />
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
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.searchBox}><FaSearch color="#999" /><input type="text" placeholder="Tìm kiếm..." style={styles.searchInput} /></div>
                    <div style={styles.headerRight}>
                        <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                            <div style={styles.avatarCircle}>O</div><span style={styles.userNameText}>Clinic Owner</span>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    
                    {/* --- TAB 1: ACCOUNTS --- */}
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
                                        {doctors.map(d => (
                                            <tr key={d.id} style={styles.tr}>
                                                <td style={styles.td}><b>{d.full_name}</b><br/><small style={{color:'#888'}}>@{d.userName}</small></td>
                                                <td style={styles.td}>{d.email}<br/>{d.phone}</td>
                                                <td style={styles.td}><span style={styles.statusActive}>Hoạt động</span></td>
                                                <td style={styles.td}><span style={styles.badge}>{d.patient_count} bệnh nhân</span></td>
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
                                    <thead><tr><th style={styles.th}>BỆNH NHÂN</th><th style={styles.th}>THÔNG TIN</th><th style={styles.th}>BÁC SĨ PHỤ TRÁCH</th><th style={styles.th}>KẾT QUẢ AI</th><th style={styles.th}>HÀNH ĐỘNG</th></tr></thead>
                                    <tbody>
                                        {patients.map(p => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><b>{p.full_name}</b></td>
                                                <td style={styles.td}>{p.email}<br/><small>{p.phone}</small></td>
                                                <td style={styles.td}>{p.assigned_doctor_id ? <span style={styles.doctorTagActive}><FaStethoscope style={{marginRight:5}}/> {p.assigned_doctor}</span> : <span style={styles.doctorTagWarning}>Chưa phân công</span>}</td>
                                                <td style={styles.td}>{p.last_result}</td>
                                                <td style={styles.td}><button onClick={() => {setSelectedPatient(p); setTargetDoctorId(p.assigned_doctor_id||''); setShowAssignModal(true)}} style={styles.actionBtn}>Phân công</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

{/* --- [TAB 2: PHÂN TÍCH AI - GIAO DIỆN MỚI] --- */}
                    {activeMenu === 'ai' && (
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                    <h2 style={styles.pageTitle}><FaHistory style={{marginRight: 10}}/>Lịch sử Phân tích AI</h2>
                                    <span style={styles.badge}>{aiHistory.length} Ca khám</span>
                                </div>
                                
                                {/* NÚT PHÂN TÍCH NGAY -> DẪN SANG TRANG UPLOAD */}
                                <button 
                                    onClick={() => navigate('/upload')} 
                                    style={{...styles.primaryBtn, display:'flex', alignItems:'center', gap:'8px'}}
                                >
                                    <FaRobot /> Phân tích ngay <FaArrowRight style={{fontSize:'12px'}}/>
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {aiHistory.length === 0 ? (
                                        <tr><td colSpan={5} style={styles.emptyCell}>Chưa có dữ liệu phân tích nào.</td></tr>
                                    ) : (
                                        aiHistory.map((item) => (
                                            <tr key={item.id} style={styles.tr}>
                                                <td style={styles.td}>{item.date}</td>
                                                <td style={styles.td}><b>{item.patient_name}</b></td>
                                                <td style={styles.td}>
                                                    <img 
                                                        src={item.image_url} 
                                                        alt="Eye" 
                                                        style={{width:'50px', height:'50px', objectFit:'cover', borderRadius:'6px', border:'1px solid #eee'}} 
                                                    />
                                                </td>
                                                <td style={styles.td}>
                                                    <span style={{
                                                        color: item.result.includes("Normal") ? 'green' : 
                                                               item.result.includes("Severe") ? 'red' : 'orange',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {item.result}
                                                    </span>
                                                </td>
                                                <td style={styles.td}>
                                                    {item.status === 'COMPLETED' 
                                                        ? <span style={{background:'#d4edda', color:'green', padding:'4px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold'}}>Hoàn tất</span>
                                                        : <span style={{background:'#fff3cd', color:'orange', padding:'4px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold'}}>Đang xử lý</span>
                                                    }
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
                                                    <button style={{border:'none', background:'transparent', color:'#555'}}><FaEdit/></button>
                                                    <button style={{border:'none', background:'transparent', color:'red'}}><FaTrash/></button>
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
                                                <td style={styles.td}>{p.last_result}</td>
                                                <td style={styles.td}><button style={{...styles.primaryBtnSm, background:'#dc3545'}}>Liên hệ gấp</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={styles.card}>
                                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaFileExport style={{marginRight: 10}}/>Xuất Báo cáo</h2></div>
                                <div style={{padding: '25px'}}>
                                    <p style={{color: '#555', marginBottom: '20px'}}>Tải xuống danh sách bệnh nhân và kết quả chẩn đoán.</p>
                                    <button onClick={exportToCSV} style={{...styles.primaryBtn, display:'flex', alignItems:'center', gap:'10px'}}><FaFileExport/> Tải xuống (.CSV)</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* --- MODALS --- */}
            {/* Modal Phân công (Giữ nguyên logic) */}
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
            
            {/* Modal Tìm Bác sĩ & Bệnh nhân (Giữ nguyên code bảng tìm kiếm đã làm trước đó) */}
            {showAddPatientModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}}> 
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3>Thêm Bệnh nhân</h3><button onClick={()=>setShowAddPatientModal(false)} style={{border:'none',background:'none',fontSize:'18px'}}>✖</button></div>
                        <input type="text" placeholder="Tìm kiếm..." style={styles.selectInput} value={searchPatientTerm} onChange={(e)=>{setSearchPatientTerm(e.target.value); searchPatients(e.target.value)}}/>
                        <div style={{maxHeight:'300px', overflowY:'auto'}}>
                            <table style={styles.table}>
                                <tbody>{availablePatients.map(p=>(<tr key={p.id}><td style={{padding:'10px'}}>{p.full_name}<br/><small>{p.email}</small></td><td><button onClick={()=>handleAddExistingPatient(p.id)} style={styles.primaryBtnSm}>Thêm</button></td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
             {showAddDoctorModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}}> 
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3>Thêm Bác sĩ</h3><button onClick={()=>setShowAddDoctorModal(false)} style={{border:'none',background:'none',fontSize:'18px'}}>✖</button></div>
                        <input type="text" placeholder="Tìm kiếm..." style={styles.selectInput} value={searchDocTerm} onChange={(e)=>{setSearchDocTerm(e.target.value); searchDoctors(e.target.value)}}/>
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
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
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
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    searchBox: { display: 'flex', alignItems: 'center', background: '#f8f9fa', borderRadius: '8px', padding: '8px 15px', width: '350px', border: '1px solid #eee' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px' },
    userNameText: { fontSize:'14px', fontWeight:'600' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px' },
    cardHeader: { padding:'20px 25px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
    pageTitle: { fontSize: '16px', margin: 0, display:'flex', alignItems:'center', color: '#333' },
    badge: { background:'#eef2ff', color:'#007bff', padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px 25px', borderBottom: '1px solid #eee', color: '#8898aa', fontSize:'11px', textTransform:'uppercase', fontWeight:'700', background:'#fbfbfb' },
    tr: { borderBottom: '1px solid #f5f5f5' },
    td: { padding: '15px 25px', verticalAlign: 'middle', color:'#333' },
    emptyCell: { textAlign: 'center', padding: '30px', color: '#999', fontStyle: 'italic' },
    statusActive: { background: '#d4edda', color: '#155724', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' },
    doctorTagActive: { background: '#e3f2fd', color: '#0d47a1', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', display:'inline-flex', alignItems:'center' },
    doctorTagWarning: { background: '#fff3cd', color: '#856404', padding: '5px 10px', borderRadius: '6px', fontSize: '12px' },
    primaryBtnSm: { background: '#007bff', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center' },
    primaryBtn: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600' },
    secondaryBtn: { padding: '10px 20px', background: '#e9ecef', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600' },
    actionBtn: { background: '#fff', border: '1px solid #007bff', color: '#007bff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000 },
    modalContent: { background:'white', padding:'25px', borderRadius:'12px', width:'420px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
    formLabel: { display:'block', marginBottom:'8px', fontSize:'14px', fontWeight:'600' },
    selectInput: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', outline: 'none', fontSize: '14px', background:'#f9f9f9', marginBottom:'20px' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
};

export default ClinicDashboard;