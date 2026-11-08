import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch:
      process.env.VITE_USE_POLLING?.toLowerCase() === "true"
        ? { usePolling: true }
        : undefined,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:5251",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
