/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages のリポジトリ名
  base: '/futari-no-dilemma/',
  // public/ は使わない(reference/ などをビルドに混ぜないため)
  publicDir: false,
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
