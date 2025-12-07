// j06-5 / Block3 — Vite 設定（注入 GEMINI_API_KEY）

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    // ★ GitHub Pages 子路徑，要和 repo 名稱完全一樣 ★
    base: '/indi-hunter-multimodal-guide/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [react()],

    define: {
      // 在 build 時把 server 環境變數 GEMINI_API_KEY 寫死進去
      // 之後在前端用 import.meta.env.VITE_GEMINI_API_KEY 讀
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(
        process.env.GEMINI_API_KEY || '',
      ),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
