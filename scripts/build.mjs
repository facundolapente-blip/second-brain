// Build de producción. En Vercel (solo producción) aplica las migraciones antes
// de compilar, para que nunca se despliegue código que espera columnas que no
// existen. En local o en previews no toca la base.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") run("npx prisma migrate deploy");
run("npx next build");
