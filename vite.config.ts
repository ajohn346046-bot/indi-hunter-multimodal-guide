// j06-5 / Block3 — Vite 設定（注入 GEMINI_API_KEY）

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '', '');

  return {
    // ★ GitHub Pages 子路徑，要和 repo 名稱完全一樣 ★
    base: '/indi-hunter-multimodal-guide/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [react()],

    define: {
      // 這裡改成用 env.API_KEY（就是 deploy.yml 裡設定的那個）
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

