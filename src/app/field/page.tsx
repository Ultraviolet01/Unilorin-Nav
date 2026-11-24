import { readFileSync } from "node:fs";
import path from "node:path";
import FieldCollector from "@/components/FieldCollector";

export const metadata = { title: "Field collector · Unilorin Navigator" };

export default function FieldPage() {
  const csv = readFileSync(path.join(process.cwd(), "data/faculty-checklist.csv"), "utf8");
  return <FieldCollector csv={csv} />;
}
