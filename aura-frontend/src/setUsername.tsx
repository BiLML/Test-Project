import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Thêm icon FaLock vào import
import { FaUser, FaCheckCircle, FaExclamationCircle, FaLock } from 'react-icons/fa';

import './App.css'; // Đường dẫn CSS của bạn

const SetUsername = () => {
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // --- VALIDATION FRONTEND ---
        if (newUsername.length < 3) {
            setError("Tên đăng nhập quá ngắn (tối thiểu 3 ký tự)");
            return;
        }

        if (newPassword.length < 6) {
            setError("Mật khẩu phải có ít nhất 6 ký tự");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp!");
            return;
        }

        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
                setLoading(false);
                return;
            }

            // Gửi cả username và password lên backend
            const res = await fetch('http://127.0.0.1:8000/api/users/set-username', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    new_username: newUsername,
                    new_password: newPassword 
                })
            });

            const data = await res.json();

            if (res.ok) {
                // Cập nhật Token mới
                localStorage.setItem('token', data.new_access_token);
                
                // Cập nhật User Info
                try {
                    const savedInfo = localStorage.getItem('user_info');
                    if (savedInfo) {
                        const parsed = JSON.parse(savedInfo);
                        parsed.userName = data.new_username;
                        localStorage.setItem('user_info', JSON.stringify(parsed));
                    }
                } catch (e) { console.log("Lỗi cache local"); }

                alert("Thiết lập tài khoản thành công!");
                navigate('/dashboard'); 
            } else {
                setError(data.detail || "Có lỗi xảy ra");
            }
        } catch (err) {
            setError("Lỗi kết nối Server");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-box">
            <div className="form-title">
                <h3> Setup an account </h3>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9em', marginTop: '-15px' }}>
                    Complete your account setup by choosing a username and password. 
                </p>
            </div>

            <form onSubmit={handleUpdate}>
                {error && (
                    <div style={{ 
                        color: '#ff6b6b', 
                        fontWeight: 'bold', 
                        marginBottom: '15px', 
                        fontSize: '0.9em',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '5px' 
                    }}>
                        <FaExclamationCircle /> {error}
                    </div>
                )}

                {/* 1. INPUT USERNAME */}
                <div className="input-group">
                    <FaUser className="icon" />
                    <input 
                        type="text" 
                        placeholder="Username" 
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        required
                    />
                </div>

                {/* 2. INPUT PASSWORD */}
                <div className="input-group">
                    <FaLock className="icon" />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                    />
                </div>

                {/* 3. INPUT CONFIRM PASSWORD */}
                <div className="input-group">
                    <FaLock className="icon" />
                    <input 
                        type="password" 
                        placeholder="Confirm Password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>

                <button type="submit" disabled={loading} style={{opacity: loading ? 0.7 : 1}}>
                    {loading ? 'Đang xử lý...' : (
                        <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                             Submit <FaCheckCircle />
                        </span>
                    )}
                </button>
            </form>

            <div className="register-section">
                <span 
                    className="register-link" 
                    style={{cursor: 'pointer'}}
                    onClick={() => {
                        localStorage.clear();
                        navigate('/login');
                    }}
                >
                    Back to Login
                </span>
            </div>
        </div>
    );
};

export default SetUsername;