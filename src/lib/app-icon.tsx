import { ImageResponse } from "next/og";

/** Ícono de la app: la "F" del menú en tinta, con el cuadradito naranja de señalética. */
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
          position: "relative",
          background: "#161614",
          color: "#f8f7f3",
          borderRadius: size * radius,
          fontSize: size * 0.56,
          fontWeight: 800,
          letterSpacing: "-0.04em",
        }}
      >
        F
        <div
          style={{
            position: "absolute",
            top: size * 0.18,
            right: size * 0.18,
            width: size * 0.14,
            height: size * 0.14,
            background: "#ff5a1a",
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
