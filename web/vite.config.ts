import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import licenseModule from "rollup-plugin-license";
import { defineConfig } from "vite";
import { formatLicenses } from "./build/third-party-licenses.ts";

// rollup-plugin-license の型は export default だが、実体は CJS の module.exports = 関数。
// Node の default の読み込みでは関数そのものが来るので、型だけを合わせる。
const license = licenseModule as unknown as typeof licenseModule.default;

// 開発時は /api を API のサーバーに転送し、本番と同じく同一オリジンにする（D-22）。
export default defineConfig({
  // ルーターのプラグインは React のプラグインより前に置く
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // バンドルに入ったライブラリのライセンス一覧を dist に書く（D-69）。画面の「Tadori について」から開く
    license({
      thirdParty: {
        includePrivate: false,
        output: { file: "dist/THIRD_PARTY_LICENSES.txt", template: formatLicenses },
      },
    }),
  ],
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
