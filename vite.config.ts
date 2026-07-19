import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// HARNESS_ONLY=1 → harness 페이지만 빌드 (모델 룩덱 스크린샷용;
// 다른 모듈이 컴파일 깨져 있어도 모델 작업에 영향 없도록)
const harnessOnly = process.env.HARNESS_ONLY === '1'

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../public',
  server: { port: 5183, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: harnessOnly
        ? { harness: resolve(__dirname, 'src/harness.html') }
        : {
            main: resolve(__dirname, 'src/index.html'),
            harness: resolve(__dirname, 'src/harness.html'),
          },
    },
  },
})
