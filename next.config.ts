import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma trae el compilador de consultas en base64 para cada base (y el motor
  // viejo en wasm) para runtimes edge; acá no se usan: el cliente generado carga
  // su propio `query_compiler_bg.wasm`. Sin esto, ~55 MB de más en cada función.
  outputFileTracingExcludes: {
    "/**": [
      "node_modules/@prisma/client/runtime/*.wasm-base64.*",
      "node_modules/@prisma/client/runtime/query_engine_bg.*",
    ],
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Los backups (HabitNow, My Diary, Gastos) se suben desde Datos.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
