import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発時は /api を API のサーバーに転送し、本番と同じく同一オリジンにする（D-22）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
});
