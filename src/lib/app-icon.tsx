import { ImageResponse } from "next/og";

/** Ícono de la app: la "F" del menú en ámbar sobre azul noche. */
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
          background: "radial-gradient(circle at 30% 20%, #232a3d 0%, #0b0d13 70%)",
          color: "#ffab4a",
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
