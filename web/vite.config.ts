import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発時は /api を API のサーバーに転送し、本番と同じく同一オリジンにする（D-22）。
export default defineConfig({
  // ルーターのプラグインは React のプラグインより前に置く
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
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
