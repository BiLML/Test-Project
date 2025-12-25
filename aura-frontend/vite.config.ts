import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 1. Cho phép Docker map port ra ngoài (quan trọng nhất)
    host: true, 
    
    // 2. Cố định port 5173 để khớp với docker-compose.yml
    port: 5173, 
    
    // 3. Nếu port 5173 bận thì báo lỗi luôn chứ không tự đổi sang port khác
    strictPort: true,
    
    // 4. Cơ chế này giúp Hot Reload hoạt động mượt mà trên Docker (Windows/Linux)
    watch: {
      usePolling: true,
    },
  },
})