import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DermFace Cloud",
  description: "Valoración facial clínica — versión clínica multiusuario",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
