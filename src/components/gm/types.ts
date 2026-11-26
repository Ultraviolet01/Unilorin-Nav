import { type LL, type Poi, type RouteOption } from "@/lib/pois";

export interface Start extends LL { name: string }
export interface Dir { dest: Poi; start: Start | null; routes: RouteOption[]; active: number; sq: string; sfocus: boolean; locating: boolean }
