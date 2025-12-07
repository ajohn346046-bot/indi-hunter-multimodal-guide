import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 讀取 Vite 的環境變數（.env.* 檔）
  const env = loadEnv(mode, process.cwd(), '');

  // 統一在這裡決定要用哪一個 key：
  // 1. 本機開發：可以放在 .env 的 GEMINI_API_KEY 或 VITE_GEMINI_API_KEY
  // 2. GitHub Actions：我們在 deploy.yml 裡面用 env: API_KEY: ${{ secrets.GEMINI_API_KEY }}
  const apiKey =
    env.GEMINI_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';

  return {
    // ★ GitHub Pages 子路徑，要和 repo 名稱完全一樣 ★
    base: '/indi-hunter-multimodal-guide/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [react()],

    define: {
      // 把「決定好的 apiKey」注入前端程式碼裡
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

