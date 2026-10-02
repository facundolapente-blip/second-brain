import type { MetadataRoute } from "next";

/** Para instalarla en el celular ("Agregar a pantalla de inicio") y que abra como app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "Second Brain",
    description: "Hábitos, journal, gastos y plan semanal.",
    start_url: "/habitos",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: "#fbfbfa",
    lang: "es-UY",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
