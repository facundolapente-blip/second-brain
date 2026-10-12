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
  poweredByHeader: false,
  // Cabeceras de seguridad en todas las respuestas. La CSP solo prohíbe que la app
  // se abra dentro de un marco de otro sitio (clickjacking): una de script-src
  // rompería los scripts en línea de Next.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Las fotos se eligen con el selector de archivos (no piden la cámara).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Los backups (HabitNow, My Diary, Gastos) se suben desde Datos.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
