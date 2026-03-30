import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.CSV_WEB_BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4318",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/testSetup.ts"
  }
});
