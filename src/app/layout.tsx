import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_COLOR, THEME_COOKIE, themeFromCookie } from "@/lib/theme";
import "./globals.css";

// Geist para toda la interfaz y la lectura; Geist Mono para números, fechas y rótulos.
const sans = Geist({ variable: "--font-ui-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Hábitos, journal, gastos y plan semanal en un solo lugar.",
  appleWebApp: { capable: true, title: "Second Brain", statusBarStyle: "default" },
};

/**
 * La barra de estado sigue al tema elegido (cookie), no al del sistema: con
 * Oscuro elegido y el celular en claro quedaba clara. Sin cookie el tema es Claro.
 * Al cambiar de tema, el Shell actualiza la etiqueta en el momento (`applyTheme`).
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return { themeColor: THEME_COLOR[theme], viewportFit: "cover" };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El tema se lee del servidor para que la primera pintada ya salga con el color elegido.
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="es" data-theme={theme} className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
