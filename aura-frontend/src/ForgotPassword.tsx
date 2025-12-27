import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css'; // Dùng chung CSS với Login cho đồng bộ

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');

        try {
            // Gọi API gửi yêu cầu quên mật khẩu
            const response = await fetch('http://127.0.0.1:8000/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('Vui lòng kiểm tra email của bạn để đặt lại mật khẩu.');
            } else {
                setError(data.detail || 'Không tìm thấy email này trong hệ thống.');
            }
        } catch (err) {
            setError('Lỗi kết nối Server!');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-box">
            <div className="form-title">
                <h3>Forgot Password</h3>
            </div>
            
            <form onSubmit={handleForgotPassword}>
                {error && <p style={{color: '#ff6b6b', marginBottom: '15px'}}>{error}</p>}
                {message && <p style={{color: '#4caf50', marginBottom: '15px'}}>{message}</p>}

                <p style={{marginBottom: '15px', fontSize: '0.9em', color: '#ffffffff'}}>
                    Nhập email đăng ký của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
                </p>

                <div className="input-group">
                    <i className="fas fa-envelope icon"></i> 
                    <input 
                        type="email" 
                        placeholder="Enter your email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required
                    />
                </div>

                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Confirm Email'}
                </button>

                <div className="register-section" style={{marginTop: '20px'}}>
                    <span
                        className="register-link"
                        style={{cursor: 'pointer'}}
                        onClick={() => navigate('/')}
                    >
                        <i className="fas fa-arrow-left"></i> Back to Login
                    </span>
                </div>
            </form>
        </div>
    );
};

export default ForgotPassword;