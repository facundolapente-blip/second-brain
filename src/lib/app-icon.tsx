import { ImageResponse } from "next/og";
import { BRAIN_PATH, BRAIN_VIEWBOX, ICON_GRADIENT } from "./brand";

/**
 * Ícono de la app: el cerebro con circuito, blanco sobre el degradé. `scale` es el tamaño del
 * cerebro respecto del ícono (más chico en el "maskable", que Android recorta).
 */
export function appIcon(size: number, radius = 0.22, scale = 0.6) {
  const s = Math.round(size * scale);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: ICON_GRADIENT,
          borderRadius: size * radius,
        }}
      >
        <svg width={s} height={s} viewBox={BRAIN_VIEWBOX} fill="#ffffff">
          <path d={BRAIN_PATH} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}

/**
 * Ícono chico de los avisos en Android (la barra de arriba): solo la silueta, blanca sobre
 * transparente; Android usa únicamente el canal alfa, así que con el degradé saldría un cuadrado.
 */
export function badgeIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={Math.round(size * 0.86)} height={Math.round(size * 0.86)} viewBox={BRAIN_VIEWBOX} fill="#ffffff">
          <path d={BRAIN_PATH} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
