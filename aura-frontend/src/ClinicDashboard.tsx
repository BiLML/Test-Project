import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ClinicDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview'); // overview | doctors
    const [data, setData] = useState<any>(null);
    const [doctors, setDoctors] = useState<any[]>([]);
    
    // State form tạo bác sĩ
    const [showDocForm, setShowDocForm] = useState(false);
    const [newDoc, setNewDoc] = useState({ userName: '', password: '', full_name: '', email: '' });
    
    // ⭐ STATE MỚI: Danh sách ID bệnh nhân được chọn để gán
    const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);

    // --- FETCH DATA ---
    const fetchDashboard = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('http://127.0.0.1:8000/api/clinic/dashboard-data', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setData(await res.json());
    };

    const fetchDoctors = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('http://127.0.0.1:8000/api/clinic/doctors', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const json = await res.json();
            setDoctors(json.doctors);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        if(!token) navigate('/login');
        fetchDashboard();
    }, [navigate]);

    useEffect(() => {
        if (activeTab === 'doctors') fetchDoctors();
    }, [activeTab]);

    // ⭐ HÀM CHECKBOX: Chọn/Bỏ chọn bệnh nhân
    const handleTogglePatient = (patientId: string) => {
        setSelectedPatientIds(prev => 
            prev.includes(patientId) 
                ? prev.filter(id => id !== patientId) // Bỏ chọn
                : [...prev, patientId] // Chọn thêm
        );
    };

    // ⭐ HÀM TẠO BÁC SĨ (Đã cập nhật gửi patient_ids)
    const handleCreateDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        
        const payload = { ...newDoc, patient_ids: selectedPatientIds }; // Gửi kèm danh sách ID

        try {
            const res = await fetch('http://127.0.0.1:8000/api/clinic/create-doctor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                const json = await res.json();
                alert(json.message);
                setShowDocForm(false);
                setNewDoc({ userName: '', password: '', full_name: '', email: '' });
                setSelectedPatientIds([]); // Reset chọn
                fetchDoctors(); // Refresh list bác sĩ
                fetchDashboard(); // Refresh list bệnh nhân (để cập nhật trạng thái mới nếu cần)
            } else {
                const err = await res.json();
                alert(err.detail || "Lỗi tạo tài khoản");
            }
        } catch (error) { alert("Lỗi kết nối"); }
    };

    if (!data) return <div>Đang tải...</div>;

    return (
        <div style={styles.container}>
            {/* HEADER */}
            <header style={styles.header}>
                <h2 style={{color: '#007bff'}}>🏥 {data.clinic?.name}</h2>
                <div style={{display:'flex', gap:'15px'}}>
                    <button style={activeTab==='overview'?styles.tabActive:styles.tab} onClick={()=>setActiveTab('overview')}>Tổng quan</button>
                    <button style={activeTab==='doctors'?styles.tabActive:styles.tab} onClick={()=>setActiveTab('doctors')}>👨‍⚕️ Quản lý Bác sĩ</button>
                    <button style={styles.logoutBtn} onClick={()=>{localStorage.clear(); navigate('/login')}}>Đăng xuất</button>
                </div>
            </header>

            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
                <div style={styles.content}>
                    <h3>Danh sách Bệnh nhân ({data.patients.length})</h3>
                    <table style={styles.table}>
                        <thead><tr><th>Tên</th><th>SĐT</th><th>Kết quả khám gần nhất</th></tr></thead>
                        <tbody>
                            {data.patients.map((p:any) => (
                                <tr key={p.id}>
                                    <td style={styles.td}>{p.full_name}</td>
                                    <td style={styles.td}>{p.phone}</td>
                                    <td style={styles.td}>{p.last_result}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB: DOCTORS */}
            {activeTab === 'doctors' && (
                <div style={styles.content}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                        <h3>Đội ngũ Bác sĩ ({doctors.length})</h3>
                        <button onClick={()=>setShowDocForm(!showDocForm)} style={styles.addBtn}>+ Thêm Bác sĩ mới</button>
                    </div>

                    {/* FORM TẠO BÁC SĨ */}
                    {showDocForm && (
                        <div style={styles.formBox}>
                            <h4>Tạo tài khoản Bác sĩ & Phân công Bệnh nhân</h4>
                            <form onSubmit={handleCreateDoctor} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                                {/* Cột trái: Thông tin */}
                                <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                                    <input placeholder="Tên đăng nhập" style={styles.input} value={newDoc.userName} onChange={e=>setNewDoc({...newDoc, userName:e.target.value})} required />
                                    <input placeholder="Mật khẩu" type="password" style={styles.input} value={newDoc.password} onChange={e=>setNewDoc({...newDoc, password:e.target.value})} required />
                                    <input placeholder="Họ và tên" style={styles.input} value={newDoc.full_name} onChange={e=>setNewDoc({...newDoc, full_name:e.target.value})} required />
                                    <input placeholder="Email" type="email" style={styles.input} value={newDoc.email} onChange={e=>setNewDoc({...newDoc, email:e.target.value})} />
                                </div>

                                {/* Cột phải: Chọn bệnh nhân */}
                                <div style={{border:'1px solid #ddd', borderRadius:'5px', padding:'10px', maxHeight:'200px', overflowY:'auto', background:'white'}}>
                                    <p style={{margin:'0 0 10px 0', fontWeight:'bold', fontSize:'14px'}}>Gán bệnh nhân ngay (Tùy chọn):</p>
                                    {data?.patients?.length > 0 ? (
                                        data.patients.map((p:any) => (
                                            <div key={p.id} style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px'}}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedPatientIds.includes(p.id)}
                                                    onChange={() => handleTogglePatient(p.id)}
                                                    style={{cursor:'pointer'}}
                                                />
                                                <span style={{fontSize:'13px'}}>{p.full_name} ({p.phone})</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{fontSize:'13px', color:'#666'}}>Chưa có bệnh nhân nào.</p>
                                    )}
                                </div>

                                <div style={{gridColumn:'1/-1', marginTop:'10px'}}>
                                    <button type="submit" style={styles.saveBtn}>Lưu & Phân công</button>
                                    <button type="button" onClick={()=>setShowDocForm(false)} style={styles.cancelBtn}>Hủy</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* DANH SÁCH BÁC SĨ (TABLE MỚI) */}
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Họ tên</th>
                                <th>Email</th>
                                <th>Bệnh nhân phụ trách</th> {/* Cột mới */}
                                <th>Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            {doctors.length === 0 ? <tr><td colSpan={5} style={{textAlign:'center', padding:'20px'}}>Chưa có bác sĩ nào.</td></tr> : 
                            doctors.map(d => (
                                <tr key={d.id}>
                                    <td style={styles.td}><b>{d.userName}</b></td>
                                    <td style={styles.td}>{d.full_name}</td>
                                    <td style={styles.td}>{d.email || '--'}</td>
                                    {/* Hiển thị tags bệnh nhân */}
                                    <td style={styles.td}>
                                        {d.assigned_patients && d.assigned_patients.length > 0 ? (
                                            <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px'}}>
                                                {d.assigned_patients.map((pName: string, index: number) => (
                                                    <span key={index} style={styles.patientTag}>{pName}</span>
                                                ))}
                                            </div>
                                        ) : <span style={{color: '#999', fontSize:'12px'}}>Chưa có</span>}
                                    </td>
                                    <td style={styles.td}><span style={styles.badge}>{d.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const styles: {[key:string]: React.CSSProperties} = {
    container: { minHeight:'100vh', backgroundColor:'#f4f6f9', fontFamily:'"Segoe UI", sans-serif' },
    header: { background:'white', padding:'15px 30px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' },
    tab: { background:'none', border:'none', padding:'10px', cursor:'pointer', color:'#555', fontSize:'15px' },
    tabActive: { background:'#eef2ff', border:'none', padding:'10px 20px', borderRadius:'20px', color:'#007bff', fontWeight:'bold', cursor:'pointer' },
    logoutBtn: { background:'#dc3545', color:'white', border:'none', padding:'8px 15px', borderRadius:'5px', cursor:'pointer', marginLeft:'20px' },
    content: { maxWidth:'1000px', margin:'30px auto', background:'white', padding:'30px', borderRadius:'10px', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' },
    table: { width:'100%', borderCollapse:'collapse', marginTop:'15px' },
    td: { padding:'12px', borderBottom:'1px solid #eee', verticalAlign: 'top' },
    addBtn: { background:'#28a745', color:'white', border:'none', padding:'10px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'bold' },
    formBox: { background:'#f8f9fa', padding:'20px', borderRadius:'8px', marginBottom:'20px', border:'1px solid #ddd' },
    input: { padding:'10px', borderRadius:'5px', border:'1px solid #ccc', outline:'none' },
    saveBtn: { background:'#007bff', color:'white', border:'none', padding:'8px 20px', borderRadius:'5px', cursor:'pointer', marginRight:'10px' },
    cancelBtn: { background:'#6c757d', color:'white', border:'none', padding:'8px 20px', borderRadius:'5px', cursor:'pointer' },
    badge: { background:'#d1fae5', color:'#065f46', padding:'3px 8px', borderRadius:'10px', fontSize:'12px' },
    patientTag: { backgroundColor: '#e3f2fd', color: '#0d47a1', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', whiteSpace: 'nowrap' }
};

export default ClinicDashboard;