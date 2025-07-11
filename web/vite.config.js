import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    rollupOptions: {
      external: ['/config.js'], // config.jsを外部モジュールとして指定
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.10.99:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://192.168.10.99:8080',
        ws: true,
        changeOrigin: true,
      },
      '/config.js': {
        target: 'http://192.168.10.99:8080',
        changeOrigin: true,
      }
    }
  }
})