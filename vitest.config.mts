import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas de la lógica pura (sin base ni navegador): `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Los días se calculan en Montevideo; que la zona de la máquina no cambie nada.
    env: { TZ: "UTC" },
  },
});
