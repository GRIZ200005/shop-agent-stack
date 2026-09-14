import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/portal": {
        target: "http://127.0.0.1:18085",
        rewrite: (p) => p.replace("/api/portal", ""),
      },
      "/api/admin": {
        target: "http://127.0.0.1:18080",
        rewrite: (p) => p.replace("/api/admin", ""),
      },
    },
  },
});
