import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PanelPlus+",
    short_name: "PanelPlus+",
    description: "PanelPlus+ | Centro de operaciones",
    start_url: "/solicitudes",
    display: "standalone",
    background_color: "#fffdf5",
    theme_color: "#ffd400",
    icons: [
      {
        src: "/panelplus-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/panelplus-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
