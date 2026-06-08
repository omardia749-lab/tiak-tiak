import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIAK TIAK – Moto Taxi Sénégal",
  description: "Le Tiak Tiak de ta génération — Transport moto rapide à votre service",
  manifest: "/manifest.json",
  themeColor: "#0F5138",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TIAK TIAK",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F5138" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TIAK TIAK" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}