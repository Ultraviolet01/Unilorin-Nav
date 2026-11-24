import type { Metadata, Viewport } from "next";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unilorin Navigator", description: "Campus and UITH navigation for Unilorin students.",
  manifest: "/manifest.json",
};
export const viewport: Viewport = { themeColor: "#7C3AED", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<RegisterSW /></body></html>;
}
