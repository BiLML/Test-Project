import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// 1. Import thư viện Google OAuth
import { GoogleOAuthProvider } from '@react-oauth/google';

// 2. Dán mã Client ID bạn vừa lấy được từ Google Cloud vào đây
// Ví dụ: "123456789-abcdef.apps.googleusercontent.com"
const CLIENT_ID = "413884508202-hmq7so5tjhnu9hib3vr9pruhqo1utlo3.apps.googleusercontent.com"; 

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 3. Bọc toàn bộ App bên trong GoogleOAuthProvider */}
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)