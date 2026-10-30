import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'apk-headers-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url.endsWith('.apk') || req.url.includes('/downloads/growmore.apk'))) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="growmore.apk"');
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    open: true,
    host: true,
    watch: {
      ignored: [
        '**/growmore_app/**', 
        '**/backend/**', 
        '**/dist/**', 
        '**/public/downloads/**', 
        '**/*.zip', 
        '**/*.apk'
      ]
    }
  }
});
