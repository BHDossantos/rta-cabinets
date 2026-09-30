/**
 * Versioned structured design document (spec sections 8, 23). Geometry is the
 * source of truth for 2D, 3D, estimates and production references.
 */
import type { Point } from './geometry';
import type { Purchasability } from './catalog';

export const DESIGN_SCHEMA_VERSION = 1;

export type RoomType = 'kitchen' | 'bathroom' | 'closet' | 'laundry' | 'other_interior' | 'exterior';
export type MeasurementSource = 'customer' | 'professional' | 'unverified';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  exposure: 'interior' | 'exterior';
  /** Closed polygon, canonical mm; wall i runs from point i to point i+1. */
  outline: Point[];
  ceilingHeightMm: number | null;
  ceilingSource: 'measured' | 'suggested' | 'unknown';
  measurementSource: MeasurementSource;
}

export interface Opening {
  id: string;
  kind: 'door' | 'window' | 'column' | 'obstruction';
  wallId: string;
  offsetMm: number;
  widthMm: number;
  /** Bottom of opening above floor (0 for doors). */
  sillMm: number;
  heightMm: number;
}

export interface Appliance {
  id: string;
  kind: 'range' | 'refrigerator' | 'dishwasher' | 'sink' | 'hood' | 'microwave' | 'other';
  wallId: string;
  offsetMm: number;
  /** null = Unknown; never invent measurements (spec section 8, step 4). */
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  elevationMm: number;
}

export interface DesignInstance {
  id: string;
  skuCode: string;
  wallId: string;
  offsetMm: number;
  elevationMm: number;
  frontSkuCode?: string;
  hingeSkuCode?: string;
  handleSkuCode?: string;
}

export interface SurfaceSelection {
  id: string;
  kind: 'flooring' | 'wall_covering' | 'paint' | 'tile' | 'backsplash' | 'countertop';
  skuCode?: string;
  label: string;
  purchasability: Purchasability;
  /** For wall coverings/paint: which walls; omitted = all walls. */
  wallIds?: string[];
  coats?: number;
  /** Approved waste factor in basis points (1000 = 10%). */
  wasteBp?: number;
}

export interface DesignDocument {
  schemaVersion: number;
  catalogVersion: string;
  room: Room;
  openings: Opening[];
  appliances: Appliance[];
  instances: DesignInstance[];
  surfaces: SurfaceSelection[];
}

/** Stable JSON (sorted keys) for content hashes and reproducibility (AC09.4). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function emptyDesign(catalogVersion: string, room: Room): DesignDocument {
  return { schemaVersion: DESIGN_SCHEMA_VERSION, catalogVersion, room, openings: [], appliances: [], instances: [], surfaces: [] };
}
