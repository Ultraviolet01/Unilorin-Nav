export type Tab = "main" | "cohs" | "uith";
export type NavTab = "explore" | "browse" | "saved" | "settings";

export const CAMPUS: Record<Tab, { label: string; center: [number, number]; zoom: number; hint: string }> = {
  main: { label: "Main Campus", center: [4.6727, 8.4805], zoom: 15.3, hint: "Search Unilorin" },
  cohs: { label: "COHS & Colleges", center: [4.6505, 8.513], zoom: 15, hint: "Search COHS & Colleges" },
  uith: { label: "UITH", center: [4.6456, 8.5390], zoom: 15.5, hint: "Search UITH" },
};

export const campusTab = (campus: string): Tab => campus === "cohs" ? "cohs" : campus === "uith" ? "uith" : "main";
