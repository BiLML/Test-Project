import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import FacebookLogin from '@greatsumini/react-facebook-login'; // Import thư viện Facebook
import './App.css';

const Login = () => {
    const [userName, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    
    const navigate = useNavigate();

    // --- 1. XỬ LÝ SAU KHI ĐĂNG NHẬP THÀNH CÔNG (Dùng chung cho cả Google, Facebook, Thường) ---
    const handleLoginSuccess = (data: any) => {
        localStorage.setItem('token', data.access_token);
        
        if (rememberMe) {
            localStorage.setItem('user_info', JSON.stringify(data.user_info));
        } else {
            sessionStorage.setItem('user_info', JSON.stringify(data.user_info));
        }

        // Logic điều hướng
        if (data.is_new_user) {
            navigate('/set-username');
        } else {
            const userInfo = data.user_info;
            const standardizedRole = userInfo.role ? userInfo.role.toLowerCase() : '';
            
            if (standardizedRole === 'admin') navigate('/admin', { replace: true });
            else if (standardizedRole === 'doctor') navigate('/dashboarddr', { replace: true });
            else navigate('/dashboard', { replace: true });
        }
    };

    // --- 2. LOGIC GOOGLE ---
    const loginWithGoogle = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const response = await fetch('http://127.0.0.1:8000/api/google-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenResponse.access_token }),
                });
                const data = await response.json();
                if (!response.ok) setError(data.detail || 'Đăng nhập Google thất bại');
                else handleLoginSuccess(data);
            } catch (err) {
                setError('Lỗi kết nối Server (Google Login)');
            }
        },
        onError: () => setError('Đăng nhập Google thất bại (Popup đóng)'),
    });

    // --- 3. LOGIC FACEBOOK (MỚI) ---
    const handleFacebookResponse = async (response: any) => {
        try {
            const res = await fetch('http://127.0.0.1:8000/api/facebook-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: response.accessToken,
                    userID: response.userID
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                handleLoginSuccess(data);
            } else {
                setError(data.detail || "Đăng nhập Facebook thất bại");
            }
        } catch (error) {
            setError('Lỗi kết nối Server (Facebook Login)');
        }
    };

    // --- 4. LOGIC ĐĂNG NHẬP THƯỜNG ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch('http://127.0.0.1:8000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName, password }),
            });
            const data = await response.json();
            if (!response.ok) setError(data.detail || 'Đăng nhập thất bại');
            else handleLoginSuccess(data);
        } catch (err) {
            setError('Không thể kết nối đến Server!');
        }
    };

    return (
        <div className="login-box">
            <div className="form-title">
                <h3>Login</h3>
            </div>
            
            <form onSubmit={handleLogin}>
                {error && <p style={{color: '#ff6b6b', marginBottom: '15px', fontWeight: 'bold'}}>{error}</p>}

                <div className="input-group">
                    <i className="fas fa-user icon"></i> 
                    <input 
                        type="text" 
                        placeholder="Email/Username" 
                        value={userName} 
                        onChange={(e) => setUserName(e.target.value)} 
                        required
                    />
                </div>
                <div className="input-group">
                    <i className="fas fa-lock icon"></i>
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                
                <div className="login-options"> 
                    <div className="remember-me" onClick={() => setRememberMe(!rememberMe)}>
                        <input 
                            type="checkbox" 
                            id="remember-me" 
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="remember-me" style={{cursor: 'pointer'}}>Remember me</label>
                    </div>
                    <div className="forgot-password">
                        <a href="#">Forgot Password?</a>
                    </div>
                </div>

                <button type="submit">Login</button>
                
                <div className="divider">Or</div>
                
                {/* NÚT GOOGLE */}
                <button 
                    type="button" 
                    className="social-button google-btn"
                    onClick={() => loginWithGoogle()} 
                >
                    <i className="fab fa-google" style={{color: '#DB4437'}}></i> Login with Google
                </button>

                {/* NÚT FACEBOOK (ĐÃ TÍCH HỢP) */}
                <div style={{width: '100%', display: 'flex', justifyContent: 'center'}}>
                    <FacebookLogin
                        appId="836034659202730"  // <--- ⚠️ DÁN APP ID CỦA BẠN VÀO ĐÂY
                        onSuccess={handleFacebookResponse}
                        onFail={(error) => console.log('Login Failed!', error)}
                        style={{
                            width: '80%', // Khớp với CSS .social-button
                            padding: '15px',
                            marginBottom: '15px',
                            borderRadius: '4rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#1877f2', // Màu xanh Facebook chuẩn
                            color: 'white',
                            border: 'none',
                            fontSize: '0.83em',
                            transition: 'opacity 0.2s'
                        }}
                        // Style khi hover (thư viện hỗ trợ prop style nhưng hover thì CSS class tốt hơn, tạm thời dùng style inline)
                    >
                        <i className="fab fa-facebook-f" style={{marginRight: '10px', fontSize: '1.1em'}}></i>
                        Login with Facebook
                    </FacebookLogin>
                </div>

                <div className="register-section">
                    <p>Don't have an account?</p>
                    <span
                        className="register-link"
                        style={{cursor: 'pointer', marginLeft: '5px'}}
                        onClick={() => navigate('/register')}
                    >
                        Register
                    </span>
                </div>
            </form>
        </div>
    );
};

export default Login;