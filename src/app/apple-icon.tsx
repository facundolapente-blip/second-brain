import { appIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS redondea las esquinas solo: el ícono va cuadrado.
export default function AppleIcon() {
  return appIcon(180, 0);
}
