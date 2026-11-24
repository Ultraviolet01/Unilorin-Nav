import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type Base = "map" | "dark" | "sat" | "aws";
const region = process.env.NEXT_PUBLIC_AWS_REGION ?? "eu-north-1";
const awsName = process.env.NEXT_PUBLIC_LOCATION_MAP_NAME;
const awsKey = process.env.NEXT_PUBLIC_LOCATION_API_KEY;
export const HAS_AWS_MAP = !!(awsName && awsKey);

type Pal = { bg: string; campus: string; green: string; pitch: string; water: string; bldg: string; bldgLine: string; path: string; svcCase: string; minCase: string; majCase: string; svc: string; min: string; maj: string; label: string; sub: string; halo: string; waterLabel: string; poi: Record<string, string> };
const LIGHT: Pal = { bg: "#F2EFE9", campus: "#E9EEE1", green: "#D3E8C9", pitch: "#BFE0AF", water: "#AADAFF", bldg: "#E4DED3", bldgLine: "#D2CABB", path: "#CFC8BA", svcCase: "#D8D2C6", minCase: "#D2CCC0", majCase: "#E1B955", svc: "#FFFFFF", min: "#FFFFFF", maj: "#FFF0B5", label: "#5F6368", sub: "#70757A", halo: "#FFFFFF", waterLabel: "#4A7FB5",
  poi: { food: "#E8710A", shop: "#4285F4", health: "#D93025", edu: "#1A9AA8", worship: "#7B61FF", bank: "#188038", lodging: "#E52592", park: "#188038", fuel: "#5F6368" } };
const DARK: Pal = { bg: "#18213A", campus: "#1D2944", green: "#1C3A38", pitch: "#234638", water: "#0D2A4A", bldg: "#26324F", bldgLine: "#32416A", path: "#3A4A72", svcCase: "#1F2A47", minCase: "#243152", majCase: "#324C82", svc: "#2E3E66", min: "#364778", maj: "#4C6BA8", label: "#B4BFD8", sub: "#8895B5", halo: "#18213A", waterLabel: "#6FA8DC",
  poi: { food: "#F4A261", shop: "#8AB4F8", health: "#F28B82", edu: "#78D9EC", worship: "#B39DFF", bank: "#81C995", lodging: "#FF8BCB", park: "#81C995", fuel: "#9AA0A6" } };

const k = (v: string) => ["==", ["get", "k"], v] as any;
const c = (v: string) => ["==", ["get", "c"], v] as any;
const w = (z0: number, a: number, z1: number, b: number) => ["interpolate", ["linear"], ["zoom"], z0, a, z1, b] as any;
const round = { "line-cap": "round", "line-join": "round" } as const;
const FONT = ["Open Sans Regular"];
const byClass = (m: Record<string, string>, fallback: string) => ["match", ["get", "c"], ...Object.entries(m).flat(), fallback] as any;

/** Google-like street map drawn from the bundled OpenStreetMap extract (public/basemap.json), no tiles, works offline. */
function local(dark: boolean): StyleSpecification {
  const P = dark ? DARK : LIGHT;
  const road = (id: string, cls: string, color: string, width: any): LayerSpecification => ({ id, type: "line", source: "osm", filter: ["all", k("road"), c(cls)], layout: round, paint: { "line-color": color, "line-width": width } });
  const text = (size: any, color: string, extra: Record<string, any> = {}, paint: Record<string, any> = {}) => ({ layout: { "text-field": ["get", "n"], "text-font": FONT, "text-size": size, ...extra }, paint: { "text-color": color, "text-halo-color": P.halo, "text-halo-width": 1.8, ...paint } });
  return {
    version: 8,
    glyphs: "/fonts/{fontstack}/{range}.pbf",
    sources: { osm: { type: "geojson", data: "/basemap.json", attribution: "© OpenStreetMap contributors" } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": P.bg } },
      { id: "campus", type: "fill", source: "osm", filter: k("campus"), paint: { "fill-color": P.campus } },
      { id: "green", type: "fill", source: "osm", filter: ["all", k("green"), c("veg")], paint: { "fill-color": P.green } },
      { id: "pitch", type: "fill", source: "osm", filter: ["all", k("green"), c("pitch")], paint: { "fill-color": P.pitch } },
      { id: "water", type: "fill", source: "osm", filter: k("water"), paint: { "fill-color": P.water } },
      { id: "bldg", type: "fill", source: "osm", filter: k("building"), minzoom: 14, paint: { "fill-color": P.bldg, "fill-outline-color": P.bldgLine } },
      road("path", "path", P.path, w(15, 0.8, 19, 2)),
      road("service-case", "service", P.svcCase, w(14, 1.6, 19, 8)), road("minor-case", "minor", P.minCase, w(13, 1.6, 19, 13)), road("major-case", "major", P.majCase, w(12, 2.6, 19, 18)),
      road("service", "service", P.svc, w(14, 0.8, 19, 6)), road("minor", "minor", P.min, w(13, 1, 19, 11)), road("major", "major", P.maj, w(12, 1.8, 19, 15.5)),
      // ---- labels ----
      { id: "campus-label", type: "symbol", source: "osm", filter: k("campus"), minzoom: 11, maxzoom: 16, ...text(13, P.sub, { "text-transform": "uppercase", "text-letter-spacing": 0.18, "text-max-width": 8 }) },
      { id: "place-label", type: "symbol", source: "osm", filter: k("place"), minzoom: 10, ...text(w(10, 11, 15, 14), P.sub, { "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7 }) },
      { id: "water-label", type: "symbol", source: "osm", filter: ["all", k("water"), ["has", "n"]], minzoom: 13, ...text(12, P.waterLabel) },
      { id: "green-label", type: "symbol", source: "osm", filter: ["all", k("green"), ["has", "n"]], minzoom: 14.5, ...text(11, P.poi.park) },
      { id: "road-label", type: "symbol", source: "osm", filter: ["all", k("road"), ["has", "n"]], minzoom: 14, ...text(w(14, 10, 18, 13), P.label, { "symbol-placement": "line", "symbol-spacing": 280, "text-max-angle": 35 }) },
      { id: "poi-dot", type: "circle", source: "osm", filter: k("poi"), minzoom: 13.5, paint: { "circle-radius": w(13.5, 3, 18, 6.5), "circle-color": byClass(P.poi, "#5F6368"), "circle-stroke-color": dark ? "#18213A" : "#FFFFFF", "circle-stroke-width": 1.5 } },
      { id: "poi-label", type: "symbol", source: "osm", filter: k("poi"), minzoom: 15, ...text(12, P.label, { "text-anchor": "left", "text-offset": [0.9, 0], "text-max-width": 8, "text-optional": true }, { "text-color": byClass(P.poi, P.label) }) },
    ] as LayerSpecification[],
  };
}

const sat: StyleSpecification = {
  version: 8,
  sources: { base: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
  layers: [{ id: "base", type: "raster", source: "base" }],
};

/**
 * "map"/"dark": the detailed street map drawn from the bundled OpenStreetMap extract (offline-friendly).
 * "sat": Esri satellite imagery.  "aws": Amazon Location Service (HERE data), only when configured, else falls back to "map".
 */
export function getMapStyle(base: Base): string | StyleSpecification {
  if (base === "sat") return sat;
  if (base === "aws" && HAS_AWS_MAP) return `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${awsName}/style-descriptor?key=${awsKey}`;
  return local(base === "dark");
}
