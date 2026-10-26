import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calé — On se voit quand ?",
  description:
    "Trouvez une date avec vos potes en 1 minute. Pas de compte, pas d'appli : un lien, chacun coche ses dispos, c'est calé.",
  openGraph: {
    title: "Calé — On se voit quand ?",
    description: "Un lien, chacun coche ses dispos, c'est calé.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#151311" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
