import { ImageResponse } from "next/og";
import { BRAIN_PATH, ICON_GRADIENT } from "./brand";

/**
 * Ícono de la app: un cerebro blanco sobre el degradé. `scale` es el tamaño del
 * cerebro respecto del ícono (más chico en el "maskable", que Android recorta).
 */
export function appIcon(size: number, radius = 0.22, scale = 0.62) {
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
        <svg width={s} height={s} viewBox="0 0 256 256" fill="#ffffff">
          <path d={BRAIN_PATH} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
