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

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPatient, setSelectedPatient] = useState<User | null>(null);
    const [assignedDoctorId, setAssignedDoctorId] = useState<string>('');
    const [isAssigning, setIsAssigning] = useState(false);
    
    // ⭐ STATE MỚI: LƯU TÊN ADMIN ĐANG ĐĂNG NHẬP
    const [adminName, setAdminName] = useState('Admin');

    // --- HÀM TẢI DỮ LIỆU TỪ ADMIN API ---
    const fetchUserData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }

        try {
            // Lấy thông tin user hiện tại (chủ yếu là tên)
            const userRes = await fetch('http://127.0.0.1:8000/api/users/me', { 
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                setAdminName(userData.user_info.userName); 
            }

            const res = await fetch('http://127.0.0.1:8000/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                // Nếu không có quyền Admin, chuyển hướng
                throw new Error("Không có quyền truy cập Admin.");
            }
            
            const data = await res.json();
            const users = data.users;
            
            // Lọc ra các Doctor và các User/Bệnh nhân
            setUserList(users.filter((u: User) => u.role !== 'ADMIN'));
            setDoctorList(users.filter((u: User) => u.role === 'DOCTOR'));

        } catch (error) {
            console.error("Lỗi tải dữ liệu Admin:", error);
            alert("Lỗi tải dữ liệu. Bạn có phải là Admin không?");
            navigate('/dashboard'); // Quay về dashboard user nếu lỗi
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    // ⭐ HÀM ĐĂNG XUẤT MỚI ⭐
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user_info');
        navigate('/login', { replace: true });
    };

    // --- XỬ LÝ PHÂN CÔNG BÁC SĨ (GỌI API MỚI) ---
    const handleAssignDoctor = async () => {
        if (!selectedPatient || !assignedDoctorId) return;

        const token = localStorage.getItem('token');
        setIsAssigning(true);

        try {
            const res = await fetch('http://127.0.0.1:8000/api/admin/assign-doctor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_id: selectedPatient.id,
                    doctor_id: assignedDoctorId
                })
            });

            const data = await res.json();

            if (res.ok) {
                alert(`Phân công thành công cho ${selectedPatient.userName} (${data.doctor_name})`);
                await fetchUserData(); 
                setSelectedPatient(null);
            } else {
                alert(data.detail || "Lỗi phân công.");
            }
        } catch (error) {
            alert("Lỗi kết nối server khi phân công.");
        } finally {
            setIsAssigning(false);
        }
    };
    
    // --- XỬ LÝ KÍCH HOẠT/VÔ HIỆU HÓA TÀI KHOẢN ---
    const toggleUserStatus = async (user: User) => {
        const token = localStorage.getItem('token');
        const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        
        if (!window.confirm(`Bạn có chắc chắn muốn ${newStatus === 'ACTIVE' ? 'KÍCH HOẠT' : 'VÔ HIỆU HÓA'} tài khoản ${user.userName}?`)) return;

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/admin/users/${user.id}/status?status=${newStatus}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                alert(`Cập nhật trạng thái thành công: ${newStatus}`);
                fetchUserData(); 
            } else {
                const data = await res.json();
                alert(data.detail || "Lỗi cập nhật trạng thái.");
            }
        } catch (error) {
            alert("Lỗi kết nối server.");
        }
    };


    if (isLoading) return <div style={styles.loading}>Đang tải Bảng điều khiển Admin...</div>;

    return (
        <div style={styles.container}>
            {/* --- HEADER CHỨA NÚT LOGOUT --- */}
            <div style={styles.header}>
                <h1 style={styles.title}>🛠️ Admin Dashboard</h1>
                <div style={styles.headerActions}>
                    <span style={{marginRight: '15px', color: '#555', fontWeight: 'bold'}}>Chào mừng, {adminName}</span>
                    <button onClick={handleLogout} style={styles.logoutBtn}>🚪 Đăng xuất</button>
                </div>
            </div>
            
            <p style={styles.subtitle}>Quản lý người dùng và phân công bác sĩ.</p>

            {/* --- MODAL PHÂN CÔNG BÁC SĨ --- */}
            {selectedPatient && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h3 style={{borderBottom: '1px solid #eee', paddingBottom: '15px'}}>Phân công Bác sĩ cho {selectedPatient.userName}</h3>
                        
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Chọn Bác sĩ Phụ trách:</label>
                            <select 
                                onChange={(e) => setAssignedDoctorId(e.target.value)}
                                value={assignedDoctorId}
                                style={styles.input}
                            >
                                <option value="">--- Chọn Bác sĩ ---</option>
                                {doctorList.map(doctor => (
                                    <option key={doctor.id} value={doctor.id}>{doctor.userName} ({doctor.email})</option>
                                ))}
                            </select>
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setSelectedPatient(null)} style={styles.secondaryBtn} disabled={isAssigning}>Hủy</button>
                            <button onClick={handleAssignDoctor} style={styles.primaryBtn} disabled={!assignedDoctorId || isAssigning}>
                                {isAssigning ? 'Đang phân công...' : 'Xác nhận Phân công'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* --- BẢNG DANH SÁCH NGƯỜI DÙNG --- */}
            <div style={styles.card}>
                <h3>Danh sách Người dùng/Bệnh nhân ({userList.length} tài khoản)</h3>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Username</th>
                            <th style={styles.th}>Email</th>
                            <th style={styles.th}>Role</th>
                            <th style={styles.th}>Trạng thái</th>
                            <th style={styles.th}>Bác sĩ phụ trách</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {userList.map(user => (
                            <tr key={user.id} style={styles.tr} className="admin-table-row"> {/* <--- THÊM CLASS NÀY */}
                                <td style={styles.td}>{user.userName}</td>
                                <td style={styles.td}>{user.email}</td>
                                <td style={styles.td}><span style={{...styles.badge, backgroundColor: user.role === 'DOCTOR' ? '#007bff' : '#28a745'}}>{user.role}</span></td>
                                <td style={styles.td}>
                                    <span style={{...styles.badge, backgroundColor: user.status === 'ACTIVE' ? '#28a745' : '#dc3545'}}>
                                        {user.status}
                                    </span>
                                </td>
                                <td style={styles.td}>
                                    {user.assigned_doctor_id ? doctorList.find(d => d.id === user.assigned_doctor_id)?.userName : '--- Chưa gán ---'}
                                </td>
                                <td style={styles.td}>
                                    <button 
                                        onClick={() => { setSelectedPatient(user); setAssignedDoctorId(user.assigned_doctor_id || ''); }}
                                        style={styles.actionBtn}
                                    >
                                        Gán Bác sĩ
                                    </button>
                                    <button 
                                        onClick={() => toggleUserStatus(user)}
                                        style={{...styles.actionBtn, backgroundColor: user.status === 'ACTIVE' ? '#dc3545' : '#28a745', marginLeft: '5px'}}
                                    >
                                        {user.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Thêm phần thống kê (FR-35, FR-36) sau */}
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '24px', color: '#007bff' },
    container: { minHeight: '100vh', backgroundColor: '#f4f6f9', padding: '40px 20px', fontFamily: "'Segoe UI', sans-serif" },
    
    // ⭐ STYLES MỚI CHO HEADER ⭐
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    headerActions: { display: 'flex', alignItems: 'center' },
    logoutBtn: { 
        padding: '8px 15px', 
        border: 'none', 
        borderRadius: '6px', 
        cursor: 'pointer', 
        backgroundColor: '#e74c3c', 
        color: 'white', 
        fontWeight: 'bold', 
        fontSize: '14px',
    },
    
    title: { color: '#1e293b', borderBottom: '2px solid #241c1cff', paddingBottom: '10px', marginBottom: '10px' },
    subtitle: { color: '#666', marginBottom: '30px' },
    card: { backgroundColor: 'white', maxWidth: '1200px', margin: '0 auto', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', padding: '30px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    th: { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #000000ff', backgroundColor: '#000000ff' },
    td: { padding: '12px 15px', borderBottom: '1px solid #000000ff', fontSize: '14px' },
    tr: { transition: 'background 0.2s' },
    badge: { padding: '5px 10px', borderRadius: '4px', color: 'white', fontSize: '12px' },
    actionBtn: { padding: '8px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', fontWeight: 'bold', fontSize: '13px' },
    
    // Modal Styles
    modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', width: '400px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', padding: '30px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' },
    label: { fontSize: '14px', fontWeight: '500', color: '#444' },
    input: { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', outline: 'none' },
    modalFooter: { paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    primaryBtn: { backgroundColor: '#007bff', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: '0.2s' },
    secondaryBtn: { backgroundColor: '#e2e8f0', color: '#475569', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
};

export default DashboardAdmin;