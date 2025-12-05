import React from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    const userRole = localStorage.getItem('role') || 'Không xác định';
    
    const handleLogout = () => {
        // Xóa thông tin đăng nhập
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        
        // Chuyển hướng người dùng về trang login
        navigate('/login');
    };

    return (
        <div style={{ padding: '40px', maxWidth: '900px', margin: '50px auto', backgroundColor: '#f9f9f9', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
            <h1 style={{ color: '#007bff', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
                🎉 Dashboard (Trang Chủ)
            </h1>
            
            <div style={{ marginBottom: '30px' }}>
                <p style={{ fontSize: '1.1em' }}>
                    Chào mừng bạn đã đăng nhập thành công! Vai trò của bạn là: 
                    <strong style={{ color: '#28a745', marginLeft: '5px' }}>{userRole}</strong>
                </p>
                <p>Đây là nơi hiển thị các nội dung quan trọng và chức năng chính của ứng dụng.</p>
            </div>

            <button 
                onClick={handleLogout}
                style={{ 
                    padding: '12px 25px', 
                    backgroundColor: '#dc3545', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    fontSize: '1em',
                    fontWeight: 'bold'
                }}
            >
                Đăng Xuất
            </button>
        </div>
    );
};

export default Dashboard;