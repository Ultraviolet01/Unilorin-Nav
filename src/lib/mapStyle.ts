import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type Base = "map" | "sat";
const region = process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1";
const awsName = process.env.NEXT_PUBLIC_LOCATION_MAP_NAME;
const awsKey = process.env.NEXT_PUBLIC_LOCATION_API_KEY;
export const HAS_AWS_MAP = !!(awsName && awsKey);

const k = (v: string) => ["==", ["get", "k"], v] as any;
const c = (v: string) => ["==", ["get", "c"], v] as any;
const w = (z0: number, a: number, z1: number, b: number) => ["interpolate", ["linear"], ["zoom"], z0, a, z1, b] as any;
const round = { "line-cap": "round", "line-join": "round" } as const;
const road = (id: string, cls: string, color: string, width: any, casing = false): LayerSpecification => ({ id, type: "line", source: "osm", filter: ["all", k("road"), c(cls)], layout: round, paint: { "line-color": color, "line-width": casing ? width : width } } as LayerSpecification);

/** Clean, Google-like street map drawn from the bundled OpenStreetMap extract (public/basemap.json) — no tiles, works offline. */
const local: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "geojson", data: "/basemap.json", attribution: "© OpenStreetMap contributors" } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#F2EFE9" } },
    { id: "campus", type: "fill", source: "osm", filter: k("campus"), paint: { "fill-color": "#E9EEE1" } },
    { id: "green", type: "fill", source: "osm", filter: ["all", k("green"), c("veg")], paint: { "fill-color": "#D3E8C9" } },
    { id: "pitch", type: "fill", source: "osm", filter: ["all", k("green"), c("pitch")], paint: { "fill-color": "#BFE0AF" } },
    { id: "water", type: "fill", source: "osm", filter: k("water"), paint: { "fill-color": "#AADAFF" } },
    { id: "bldg", type: "fill", source: "osm", filter: k("building"), minzoom: 14, paint: { "fill-color": "#E4DED3", "fill-outline-color": "#D2CABB" } },
    road("path", "path", "#CFC8BA", w(15, 0.8, 19, 2)),
    road("service-case", "service", "#D8D2C6", w(14, 1.6, 19, 8), true), road("minor-case", "minor", "#D2CCC0", w(13, 1.6, 19, 13), true), road("major-case", "major", "#E1B955", w(12, 2.6, 19, 18), true),
    road("service", "service", "#FFFFFF", w(14, 0.8, 19, 6)), road("minor", "minor", "#FFFFFF", w(13, 1, 19, 11)), road("major", "major", "#FFF0B5", w(12, 1.8, 19, 15.5)),
  ] as LayerSpecification[],
};

const sat: StyleSpecification = {
  version: 8,
  sources: { base: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
  layers: [{ id: "base", type: "raster", source: "base" }],
};

/** "map": Amazon Location when configured, otherwise the bundled OSM vector map. "sat": Esri satellite imagery. */
export function getMapStyle(base: Base): string | StyleSpecification {
  if (base === "sat") return sat;
  return HAS_AWS_MAP ? `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${awsName}/style-descriptor?key=${awsKey}` : local;
}
