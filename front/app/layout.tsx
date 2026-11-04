import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "TestaFila | Projetos",
  description: "Organize projetos de dimensionamento de filas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
