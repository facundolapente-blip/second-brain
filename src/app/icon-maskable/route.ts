import { appIcon } from "@/lib/app-icon";

// Android recorta el ícono "maskable" en círculo o gota: el cerebro va más chico.
export function GET() {
  return appIcon(512, 0, 0.48);
}
