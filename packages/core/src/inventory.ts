/**
 * Inventory with atomic reservations (spec section 15). Available-to-promise =
 * sellable on-hand − active reservations − safety stock. Quarantined units and
 * unconfirmed inbound supply are never counted.
 */
import { DomainError } from './errors';

export interface StockPosition {
  skuCode: string;
  warehouseId: string;
  onHand: number;
  quarantined: number;
  safetyStock: number;
  incomingConfirmed: number;
  lastSyncedAt?: string;
}

export interface Reservation {
  id: string;
  skuCode: string;
  warehouseId: string;
  quantity: number;
  holderId: string;
  expiresAt: string;
  status: 'active' | 'committed' | 'released' | 'expired';
}

export class InventoryLedger {
  private positions = new Map<string, StockPosition>();
  private reservations = new Map<string, Reservation>();
  private seq = 0;

  constructor(private readonly staleAfterMs = 15 * 60_000) {}

  private key(sku: string, wh: string) {
    return `${sku}@${wh}`;
  }

  setPosition(p: StockPosition): void {
    if (p.onHand < 0 || p.quarantined < 0 || p.safetyStock < 0) throw new DomainError('validation', 'Stock quantities must be non-negative');
    this.positions.set(this.key(p.skuCode, p.warehouseId), { ...p });
  }

  position(skuCode: string, warehouseId: string): StockPosition | undefined {
    return this.positions.get(this.key(skuCode, warehouseId));
  }

  private activeReserved(skuCode: string, warehouseId: string, now: Date): number {
    let total = 0;
    for (const r of this.reservations.values()) {
      if (r.skuCode !== skuCode || r.warehouseId !== warehouseId) continue;
      if (r.status === 'active' && Date.parse(r.expiresAt) <= now.getTime()) r.status = 'expired';
      if (r.status === 'active') total += r.quantity;
    }
    return total;
  }

  availableToPromise(skuCode: string, warehouseId: string, now: Date): number {
    const p = this.position(skuCode, warehouseId);
    if (!p) return 0;
    const sellable = p.onHand - p.quarantined;
    return Math.max(0, sellable - this.activeReserved(skuCode, warehouseId, now) - p.safetyStock);
  }

  isStale(skuCode: string, warehouseId: string, now: Date): boolean {
    const p = this.position(skuCode, warehouseId);
    return !p?.lastSyncedAt || now.getTime() - Date.parse(p.lastSyncedAt) > this.staleAfterMs;
  }

  /**
   * Reserve all lines or none. JS executes this synchronously, so it is atomic in
   * process; the database adapter must use a transaction with row locks (AC15.1).
   */
  reserveAll(
    lines: { skuCode: string; warehouseId: string; quantity: number }[],
    holderId: string, now: Date, ttlMs: number,
  ): Reservation[] {
    const shortfalls = lines
      .map((l) => ({ ...l, available: this.availableToPromise(l.skuCode, l.warehouseId, now) }))
      .filter((l) => l.available < l.quantity);
    if (shortfalls.length) {
      throw new DomainError('insufficient_stock', 'Not enough stock to reserve', {
        shortfalls: shortfalls.map(({ skuCode, warehouseId, quantity, available }) => ({ skuCode, warehouseId, requested: quantity, available })),
      });
    }
    return lines.map((l) => {
      const r: Reservation = {
        id: `res_${++this.seq}`, skuCode: l.skuCode, warehouseId: l.warehouseId, quantity: l.quantity,
        holderId, expiresAt: new Date(now.getTime() + ttlMs).toISOString(), status: 'active',
      };
      this.reservations.set(r.id, r);
      return r;
    });
  }

  /** Commit converts a live reservation into an allocation; an expired one cannot be committed. */
  commit(reservationId: string, now: Date): Reservation {
    const r = this.reservations.get(reservationId);
    if (!r) throw new DomainError('not_found', 'Reservation not found');
    if (r.status === 'active' && Date.parse(r.expiresAt) <= now.getTime()) r.status = 'expired';
    if (r.status !== 'active') throw new DomainError('conflict', `Reservation is ${r.status}`, { reservationId, status: r.status });
    r.status = 'committed';
    const p = this.position(r.skuCode, r.warehouseId)!;
    p.onHand -= r.quantity;
    return r;
  }

  release(reservationId: string): void {
    const r = this.reservations.get(reservationId);
    if (r && r.status === 'active') r.status = 'released';
  }

  reservation(id: string): Reservation | undefined {
    return this.reservations.get(id);
  }

  /** Plain-data copy for persistence. */
  snapshot(): { positions: StockPosition[]; reservations: Reservation[]; seq: number } {
    return {
      positions: [...this.positions.values()].map((p) => ({ ...p })),
      reservations: [...this.reservations.values()].map((r) => ({ ...r })),
      seq: this.seq,
    };
  }

  static restore(data: { positions: StockPosition[]; reservations: Reservation[]; seq: number }, staleAfterMs?: number): InventoryLedger {
    const l = new InventoryLedger(staleAfterMs);
    for (const p of data.positions) l.positions.set(l.key(p.skuCode, p.warehouseId), { ...p });
    for (const r of data.reservations) l.reservations.set(r.id, { ...r });
    l.seq = data.seq;
    return l;
  }
}
