import { badgeIcon } from "@/lib/app-icon";

/** Silueta para la barra de avisos de Android (ver `public/sw.js`, evento push). */
export function GET() {
  return badgeIcon(96);
}
