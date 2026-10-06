import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Los backups (HabitNow, My Diary, Gastos) se suben desde Datos.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
