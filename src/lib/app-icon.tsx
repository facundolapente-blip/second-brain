import { ImageResponse } from "next/og";

/** Ícono de la app: la "F" del menú, en tinta sobre el fondo cálido. */
export function appIcon(size: number, radius = 0.22) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d1d1b",
          color: "#fafaf9",
          borderRadius: size * radius,
          fontSize: size * 0.56,
          fontWeight: 600,
          letterSpacing: "-0.04em",
        }}
      >
        F
      </div>
    ),
    { width: size, height: size },
  );
}
