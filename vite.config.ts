import { defineConfig } from 'vite';

// GitHub Pages serves the site at https://lenqis.github.io/keysvr/
export default defineConfig({
  base: '/keysvr/',
  resolve: { dedupe: ['three'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
