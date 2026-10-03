import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Grotesca variable con eje de ancho: texto normal en 100, titulares anchos en 118.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
// Monoespaciada para números, fechas, montos y etiquetas técnicas.
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Hábitos, journal, gastos y plan semanal en un solo lugar.",
  appleWebApp: { capable: true, title: "Second Brain", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efeee9" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
