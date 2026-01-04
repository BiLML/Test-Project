import React, { useState, useEffect, useCallback } from 'react';
import { FaDatabase, FaUserMd } from 'react-icons/fa';
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
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback'>('users'); 
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]); 
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);

    const [feedbackList, setFeedbackList] = useState<any[]>([]); // Danh sách phản hồi
    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            const meRes = await fetch('http://127.0.0.1:8000/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) {
                const meData = await meRes.json();
                setAdminName(meData.user_info.userName);
            }

            const userRes = await fetch('http://127.0.0.1:8000/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (userRes.ok) {
                const data = await userRes.json();
                setUserList(data.users.filter((u: User) => u.role !== 'ADMIN'));
                setDoctorList(data.users.filter((u: User) => u.role === 'DOCTOR'));
            }

            const clinicRes = await fetch('http://127.0.0.1:8000/api/admin/clinics/pending', { headers: { 'Authorization': `Bearer ${token}` } });
            if (clinicRes.ok) {
                const data = await clinicRes.json();
                setClinicRequests(data.requests);
            }

            const reportRes = await fetch('http://127.0.0.1:8000/api/admin/reports', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (reportRes.ok) {
                const data = await reportRes.json();
                setFeedbackList(data.reports);
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
                fetchData(); 
            } else {
                alert("Có lỗi xảy ra.");
            }
        } catch (e) { alert("Lỗi server."); }
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

            <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                <button onClick={() => setActiveTab('users')} style={activeTab === 'users' ? styles.tabActive : styles.tabInactive}>👥 Người dùng</button>
                <button onClick={() => setActiveTab('clinics')} style={activeTab === 'clinics' ? styles.tabActive : styles.tabInactive}>🏥 Duyệt Phòng khám ({clinicRequests.length})</button>
                <button onClick={() => setActiveTab('feedback')} style={activeTab === 'feedback' ? styles.tabActive : styles.tabInactive}>🧠 Dữ liệu Huấn luyện AI</button>
            </div>

            {activeTab === 'users' && (
                <div style={styles.card}>
                    <h3>Quản lý Người dùng ({userList.length})</h3>
                    <table style={styles.table}>
                        <thead>
                            <tr><th>User</th><th>Role</th><th>Status</th><th>Bác sĩ Phụ trách</th></tr>
                        </thead>
                        <tbody>
                            {userList.map(u => (
                                <tr key={u.id}>
                                    <td style={styles.td}><b>{u.userName}</b><br/>{u.email}</td>
                                    <td style={styles.td}>
                                        <span style={{...styles.badge, background: u.role==='DOCTOR'?'#007bff': u.role==='CLINIC_OWNER'?'#6f42c1':'#28a745'}}>{u.role}</span>
                                    </td>
                                    <td style={styles.td}>{u.status}</td>
                                    <td style={styles.td}>
                                        {/* READ ONLY - ADMIN KHÔNG THỂ SỬA */}
                                        {u.assigned_doctor_id ? (
                                            <span style={{color: '#007bff', fontWeight: 'bold'}}>
                                                {doctorList.find(d => d.id === u.assigned_doctor_id)?.userName || 'ID: ' + u.assigned_doctor_id}
                                            </span>
                                        ) : (
                                            <span style={{color: '#999', fontStyle: 'italic'}}>-- Chưa có --</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

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
                                                {req.images.back && <a href={req.images.back} target="_blank" rel="noreferrer" style={styles.linkBtn}>📄 Mặt sau</a>}
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

            {activeTab === 'feedback' && (
                <div style={styles.card}>
                    <h3>Dữ liệu Huấn luyện AI (Feedback từ Bác sĩ)</h3>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th>Ngày tạo</th>
                                <th>Bác sĩ</th>
                                <th>Bệnh nhân</th>
                                <th>Kết quả AI</th>
                                <th>Chẩn đoán thật (Bác sĩ)</th>
                                <th>Đánh giá</th>
                            </tr>
                        </thead>
                        <tbody>
                            {feedbackList.length === 0 ? (
                                <tr><td colSpan={6} style={{padding:'20px', textAlign:'center'}}>Chưa có dữ liệu huấn luyện.</td></tr>
                            ) : (
                                feedbackList.map(item => (
                                    <tr key={item.id}>
                                        {/* Lưu ý: Backend trả về chuỗi ISO date, ta format lại hiển thị */}
                                        <td style={styles.td}>{new Date(item.created_at).toLocaleDateString('vi-VN')}</td>
                                        
                                        {/* Các key khớp với Python: doctor_name, patient_name... */}
                                        <td style={styles.td}><b>{item.doctor_name}</b></td>
                                        <td style={styles.td}>{item.patient_name}</td>
                                        
                                        <td style={styles.td}>
                                            <span style={{color:'red'}}>{item.ai_result}</span>
                                        </td>
                                        
                                        <td style={styles.td}>
                                            <b style={{color:'#28a745'}}>{item.doctor_diagnosis}</b>
                                            {item.notes && <div style={{fontSize:'12px', color:'#666', marginTop:'4px'}}>Note: {item.notes}</div>}
                                        </td>
                                        
                                        <td style={styles.td}>
                                            {item.accuracy === 'INCORRECT' ? (
                                                <span style={{background:'#fdecea', color:'#c0392b', padding:'4px 8px', borderRadius:'4px', fontWeight:'bold', fontSize:'12px'}}>
                                                    ⚠️ Sai lệch
                                                </span>
                                            ) : (
                                                <span style={{background:'#e8f5e9', color:'#27ae60', padding:'4px 8px', borderRadius:'4px', fontWeight:'bold', fontSize:'12px'}}>
                                                    ✅ Chính xác
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' },
    container: { minHeight: '100vh', backgroundColor: '#f4f6f9', padding: '20px', fontFamily: 'sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    headerActions: { display: 'flex', alignItems: 'center' },
    title: { color: '#333' },
    logoutBtn: { padding: '8px 15px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
    tabActive: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', marginRight: '10px', cursor: 'pointer' },
    tabInactive: { padding: '10px 20px', background: 'white', color: '#333', border: '1px solid #ccc', borderRadius: '5px', marginRight: '10px', cursor: 'pointer' },
    card: { background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px' },
    td: { padding: '10px', borderBottom: '1px solid #eee' },
    badge: { padding: '4px 8px', borderRadius: '4px', color: 'white', fontSize: '12px' },
    actionBtn: { padding: '6px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: '#007bff', color: 'white' },
    linkBtn: { display: 'inline-block', padding: '4px 8px', background: '#17a2b8', color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '12px' }
};

export default DashboardAdmin;