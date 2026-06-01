import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIAK TIAK — Moto Taxi Sénégal",
  description: "Le Tiak Tiak de ta génération",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}