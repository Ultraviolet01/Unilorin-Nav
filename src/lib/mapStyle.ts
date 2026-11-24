import type { StyleSpecification } from "maplibre-gl";

/** Amazon Location Service style when configured, otherwise free Esri satellite tiles for local dev. */
export function getMapStyle(): string | StyleSpecification {
  const region = process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1";
  const name = process.env.NEXT_PUBLIC_LOCATION_MAP_NAME;
  const key = process.env.NEXT_PUBLIC_LOCATION_API_KEY;
  if (name && key) return `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${name}/style-descriptor?key=${key}`;
  return {
    version: 8,
    sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
    layers: [{ id: "sat", type: "raster", source: "sat" }],
  };
}
