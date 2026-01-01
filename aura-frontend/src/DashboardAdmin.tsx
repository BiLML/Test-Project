import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
    id: string;
    userName: string;
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
    const [activeTab, setActiveTab] = useState<'users' | 'clinics'>('users');
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    // Data Lists
    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]);
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]); // New State

    // Modal & Selection States
    const [selectedPatient, setSelectedPatient] = useState<User | null>(null);
    const [assignedDoctorId, setAssignedDoctorId] = useState<string>('');
    const [isAssigning, setIsAssigning] = useState(false);

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            // 1. Get Admin Info
            const meRes = await fetch('http://127.0.0.1:8000/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) {
                const meData = await meRes.json();
                setAdminName(meData.user_info.userName);
            }

            // 2. Get Users
            const userRes = await fetch('http://127.0.0.1:8000/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (userRes.ok) {
                const data = await userRes.json();
                setUserList(data.users.filter((u: User) => u.role !== 'ADMIN'));
                setDoctorList(data.users.filter((u: User) => u.role === 'DOCTOR'));
            }

            // 3. Get Clinic Requests
            const clinicRes = await fetch('http://127.0.0.1:8000/api/admin/clinics/pending', { headers: { 'Authorization': `Bearer ${token}` } });
            if (clinicRes.ok) {
                const data = await clinicRes.json();
                setClinicRequests(data.requests);
            }

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login', { replace: true });
    };

    // --- LOGIC: ASSIGN DOCTOR ---
    const handleAssignDoctor = async () => {
        if (!selectedPatient || !assignedDoctorId) return;
        const token = localStorage.getItem('token');
        setIsAssigning(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/api/admin/assign-doctor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ patient_id: selectedPatient.id, doctor_id: assignedDoctorId })
            });
            if (res.ok) {
                alert("Phân công thành công!");
                fetchData();
                setSelectedPatient(null);
            } else {
                alert("Lỗi phân công.");
            }
        } catch (e) { alert("Lỗi kết nối."); }
        finally { setIsAssigning(false); }
    };

    // --- LOGIC: APPROVE/REJECT CLINIC ---
    const handleClinicAction = async (clinicId: string, action: 'APPROVED' | 'REJECTED') => {
        if(!window.confirm(action === 'APPROVED' ? "Duyệt phòng khám này?" : "Từ chối yêu cầu này?")) return;
        
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/admin/clinics/${clinicId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: action })
            });
            if (res.ok) {
                alert("Đã xử lý thành công.");
                fetchData(); // Refresh list
            } else {
                alert("Có lỗi xảy ra.");
            }
        } catch (e) { alert("Lỗi server."); }
    };

    // --- LOGIC: TOGGLE USER STATUS ---
    const toggleUserStatus = async (user: User) => {
        // (Giữ nguyên logic cũ của bạn nếu cần, ở đây viết gọn để demo)
        alert("Tính năng bật/tắt user đang được cập nhật.");
    };

    if (isLoading) return <div style={styles.loading}>Đang tải...</div>;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>🛡️ Admin Dashboard</h1>
                <div style={styles.headerActions}>
                    <span style={{marginRight: '15px', fontWeight: 'bold'}}>Hi, {adminName}</span>
                    <button onClick={handleLogout} style={styles.logoutBtn}>Đăng xuất</button>
                </div>
            </div>

            {/* TAB NAVIGATION */}
            <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                <button onClick={() => setActiveTab('users')} style={activeTab === 'users' ? styles.tabActive : styles.tabInactive}>👥 Người dùng</button>
                <button onClick={() => setActiveTab('clinics')} style={activeTab === 'clinics' ? styles.tabActive : styles.tabInactive}>🏥 Duyệt Phòng khám ({clinicRequests.length})</button>
            </div>

            {/* TAB 1: USERS */}
            {activeTab === 'users' && (
                <div style={styles.card}>
                    <h3>Quản lý Người dùng ({userList.length})</h3>
                    <table style={styles.table}>
                        <thead>
                            <tr><th>User</th><th>Role</th><th>Status</th><th>Bác sĩ</th><th>Hành động</th></tr>
                        </thead>
                        <tbody>
                            {userList.map(u => (
                                <tr key={u.id}>
                                    <td style={styles.td}><b>{u.userName}</b><br/>{u.email}</td>
                                    <td style={styles.td}>
                                        <span style={{...styles.badge, background: u.role==='DOCTOR'?'#007bff': u.role==='CLINIC_OWNER'?'#6f42c1':'#28a745'}}>{u.role}</span>
                                    </td>
                                    <td style={styles.td}>{u.status}</td>
                                    <td style={styles.td}>{u.assigned_doctor_id ? doctorList.find(d=>d.id===u.assigned_doctor_id)?.userName : '--'}</td>
                                    <td style={styles.td}>
                                        {u.role === 'USER' && (
                                            <button onClick={() => {setSelectedPatient(u); setAssignedDoctorId(u.assigned_doctor_id||'')}} style={styles.actionBtn}>Gán Bác sĩ</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 2: CLINICS */}
            {activeTab === 'clinics' && (
                <div style={styles.card}>
                    <h3>Yêu cầu Mở Phòng khám ({clinicRequests.length})</h3>
                    {clinicRequests.length === 0 ? <p style={{padding:'20px', color:'#666'}}>Không có yêu cầu nào.</p> : (
                        <table style={styles.table}>
                            <thead><tr><th>Phòng khám</th><th>Chủ sở hữu</th><th>Giấy phép</th><th>Ảnh</th><th>Hành động</th></tr></thead>
                            <tbody>
                                {clinicRequests.map(req => (
                                    <tr key={req.id}>
                                        <td style={styles.td}><b>{req.name}</b><br/><small>{req.address}</small></td>
                                        <td style={styles.td}>{req.owner_name}<br/><small>{req.phone}</small></td>
                                        <td style={styles.td}>{req.license_number}</td>
                                        <td style={styles.td}>
                                            <div style={{display:'flex', gap:'5px', flexDirection:'column'}}>
                                                {req.images.front && <a href={req.images.front} target="_blank" rel="noreferrer" style={styles.linkBtn}>📄 Mặt trước</a>}
                                                {req.images.back && <a href={req.images.back} target="_blank" rel="noreferrer" style={styles.linkBtn}>📄 File/Mặt sau</a>}
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <button onClick={() => handleClinicAction(req.id, 'APPROVED')} style={{...styles.actionBtn, background:'#28a745', marginRight:'5px'}}>✓ Duyệt</button>
                                            <button onClick={() => handleClinicAction(req.id, 'REJECTED')} style={{...styles.actionBtn, background:'#dc3545'}}>✕ Hủy</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* MODAL ASSIGN */}
            {selectedPatient && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h3>Gán bác sĩ cho {selectedPatient.userName}</h3>
                        <select style={styles.input} value={assignedDoctorId} onChange={(e)=>setAssignedDoctorId(e.target.value)}>
                            <option value="">-- Chọn Bác sĩ --</option>
                            {doctorList.map(d => <option key={d.id} value={d.id}>{d.userName}</option>)}
                        </select>
                        <div style={styles.modalFooter}>
                            <button onClick={()=>setSelectedPatient(null)} style={styles.secondaryBtn}>Hủy</button>
                            <button onClick={handleAssignDoctor} style={styles.primaryBtn}>Lưu</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' },
    container: { minHeight: '100vh', backgroundColor: '#f4f6f9', padding: '20px', fontFamily: 'sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    title: { color: '#333' },
    logoutBtn: { padding: '8px 15px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
    
    tabActive: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', marginRight: '10px', cursor: 'pointer' },
    tabInactive: { padding: '10px 20px', background: 'white', color: '#333', border: '1px solid #ccc', borderRadius: '5px', marginRight: '10px', cursor: 'pointer' },

    card: { background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px' },
    td: { padding: '10px', borderBottom: '1px solid #eee' },
    badge: { padding: '4px 8px', borderRadius: '4px', color: 'white', fontSize: '12px' },
    actionBtn: { padding: '6px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: '#007bff', color: 'white' },
    linkBtn: { display: 'inline-block', padding: '4px 8px', background: '#17a2b8', color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '12px' },
    
    modalOverlay: { position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center' },
    modalContent: { background:'white', padding:'30px', borderRadius:'10px', width:'400px' },
    input: { width:'100%', padding:'10px', margin:'10px 0' },
    modalFooter: { display:'flex', justifyContent:'flex-end', gap:'10px' },
    primaryBtn: { padding:'8px 15px', background:'#007bff', color:'white', border:'none', borderRadius:'5px', cursor:'pointer' },
    secondaryBtn: { padding:'8px 15px', background:'#ccc', border:'none', borderRadius:'5px', cursor:'pointer' }
};

export default DashboardAdmin;