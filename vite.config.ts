import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = (dir: string) => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));

// En GitHub Pages la app vive en /<repositorio>/: el workflow pasa BASE_PATH al compilar.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  // El catálogo de 181 personajes y el cliente de Supabase pesan; ~200 kB comprimido está bien.
  build: { chunkSizeWarningLimit: 800 },
  resolve: {
    alias: {
      "@domain": src("domain"),
      "@application": src("application"),
      "@infrastructure": src("infrastructure"),
      "@presentation": src("presentation"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
