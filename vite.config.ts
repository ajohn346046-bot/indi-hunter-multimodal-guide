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
      // 這兩行只是把 env 裡的 key 注入前端（注意：會暴露在瀏覽器，僅適合 demo）
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

