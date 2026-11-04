import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TestaFila",
    short_name: "TestaFila",
    description: "Editor visual de filas.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#f5f4ef",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
