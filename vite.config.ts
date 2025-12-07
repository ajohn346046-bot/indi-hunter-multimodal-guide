// vite.config.ts
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // ★ GitHub Pages 子路徑，要和 repo 名稱完全一樣
  base: '/indi-hunter-multimodal-guide/',

  server: {
    host: '0.0.0.0',
    port: 3000,
  },

  plugins: [react()],

  // 這裡先不要再動 env / process.env，避免在瀏覽器端出錯
  define: {},

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
