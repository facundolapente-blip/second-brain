import type { MetadataRoute } from "next";

/** Para instalarla en el celular ("Agregar a pantalla de inicio") y que abra como app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "Second Brain",
    description: "Hábitos, journal, gastos y plan semanal.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: "#fbfbfa",
    lang: "es-UY",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Mantener apretado el ícono de la app.
    shortcuts: [
      { name: "Cargar gasto", short_name: "Gasto", url: "/gastos?nuevo=1", icons: [{ src: "/icon-192", sizes: "192x192" }] },
      { name: "Escribir en el journal", short_name: "Escribir", url: "/journal/escribir", icons: [{ src: "/icon-192", sizes: "192x192" }] },
      { name: "Hábitos de hoy", short_name: "Hábitos", url: "/habitos", icons: [{ src: "/icon-192", sizes: "192x192" }] },
      { name: "Plan de la semana", short_name: "Plan", url: "/plan", icons: [{ src: "/icon-192", sizes: "192x192" }] },
    ],
    // Aparece en "Compartir" de otras apps (Android, con la app instalada).
    share_target: {
      action: "/compartir",
      method: "post",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "fotos", accept: ["image/*"] }] },
    },
  };
}
