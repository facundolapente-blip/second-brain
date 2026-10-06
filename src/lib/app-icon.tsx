import { ImageResponse } from "next/og";

/** Colores de los cuatro módulos (coral, violeta, verde, azul), como en la marca del menú. */
const MODS = ["#cc4517", "#7c4ddb", "#0b7f62", "#1f6fe0"];

/** Ícono de la app: los cuatro cuadraditos de color de la marca sobre fondo claro. */
export function appIcon(size: number, radius = 0.22) {
  const pad = size * 0.2;
  const gap = size * 0.06;
  const cell = (size - pad * 2 - gap) / 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f2f2f7",
          borderRadius: size * radius,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", width: cell * 2 + gap, gap }}>
          {MODS.map((c) => (
            <div key={c} style={{ width: cell, height: cell, background: c, borderRadius: cell * 0.36 }} />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
