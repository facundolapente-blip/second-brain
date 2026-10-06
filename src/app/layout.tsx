import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_COOKIE, isTheme } from "@/lib/theme";
import "./globals.css";

// Geist para toda la interfaz y la lectura; Geist Mono para números, fechas y rótulos.
const sans = Geist({ variable: "--font-ui-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Hábitos, journal, gastos y plan semanal en un solo lugar.",
  appleWebApp: { capable: true, title: "Second Brain", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8e1d3" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El tema se lee del servidor para que la primera pintada ya salga con el color elegido.
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(saved) ? saved : "auto";
  return (
    <html lang="es" data-theme={theme} className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
