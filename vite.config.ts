import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // ใช้สำหรับการ deploy
    server: {
        open: true, // เปิดเบราว์เซอร์อัตโนมัติ
    },
});