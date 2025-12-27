import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './App.css';

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    
    // Lấy token từ URL (query param)
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp!');
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:8000/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    token: token, 
                    new_password: password 
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('Đặt lại mật khẩu thành công! Đang chuyển hướng...');
                setTimeout(() => navigate('/'), 3000); // Chuyển về login sau 3s
            } else {
                setError(data.detail || 'Token không hợp lệ hoặc đã hết hạn.');
            }
        } catch (err) {
            setError('Lỗi kết nối Server!');
        }
    };

    if (!token) {
        return (
            <div className="login-box">
                <p style={{color: 'red'}}>Đường dẫn không hợp lệ (thiếu token).</p>
                <button onClick={() => navigate('/')}>Back to Login</button>
            </div>
        );
    }

    return (
        <div className="login-box">
            <div className="form-title">
                <h3>Reset Password</h3>
            </div>
            
            <form onSubmit={handleResetPassword}>
                {error && <p style={{color: '#ff6b6b', marginBottom: '15px'}}>{error}</p>}
                {message && <p style={{color: '#4caf50', marginBottom: '15px'}}>{message}</p>}

                <div className="input-group">
                    <i className="fas fa-lock icon"></i>
                    <input 
                        type="password" 
                        placeholder="New Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <div className="input-group">
                    <i className="fas fa-lock icon"></i>
                    <input 
                        type="password" 
                        placeholder="Confirm Password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>

                <button type="submit">Change Password</button>
            </form>
        </div>
    );
};

export default ResetPassword;