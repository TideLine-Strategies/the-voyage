import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/factory/",
  build: {
    outDir: "../../public/factory",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./live.html", import.meta.url)) },
  },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8797" } },
});
