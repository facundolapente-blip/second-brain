import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

// Sans redondeada, amable y muy legible en tamaños chicos (opción "Vivo").
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Hábitos, journal, gastos y plan semanal en un solo lugar.",
  appleWebApp: { capable: true, title: "Second Brain", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${nunito.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
