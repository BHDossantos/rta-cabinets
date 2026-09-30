/**
 * Fulfillment groups and staged delivery (spec section 15, Example D).
 */
import { DomainError } from './errors';
import type { ShipmentState } from './state';

export interface OrderLineRef {
  id: string;
  skuCode: string;
  quantity: number;
  stage: string;
}

export interface ShipmentLine {
  orderLineId: string;
  quantity: number;
}

export interface Shipment {
  id: string;
  groupStage: string;
  state: ShipmentState;
  lines: ShipmentLine[];
  trackingNumbers: string[];
  isReplacement?: boolean;
}

export type OrderFulfillmentStatus = 'unfulfilled' | 'partially_shipped' | 'shipped' | 'partially_delivered' | 'delivered';

export interface GroupStatus {
  stage: string;
  orderedQuantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  outstanding: number;
  status: 'pending' | 'partially_shipped' | 'shipped' | 'partially_delivered' | 'delivered';
}

const shippedStates: ShipmentState[] = ['dispatched', 'in_transit', 'exception', 'delivered'];

/** A shipment cannot exceed ordered quantity plus authorized replacements (spec section 23). */
export function validateShipment(lines: OrderLineRef[], existing: Shipment[], candidate: Shipment, replacementAllowance: Record<string, number> = {}): void {
  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const sl of candidate.lines) {
    const ol = byId.get(sl.orderLineId);
    if (!ol) throw new DomainError('validation', `Order line ${sl.orderLineId} not in order`);
    if (!Number.isInteger(sl.quantity) || sl.quantity <= 0) throw new DomainError('validation', 'Shipment quantity must be a positive integer');
    if (ol.stage !== candidate.groupStage) throw new DomainError('validation', `Line ${ol.id} belongs to stage ${ol.stage}, not ${candidate.groupStage}`);
    const already = existing
      .filter((s) => s.state !== 'cancelled' && s.state !== 'returned')
      .flatMap((s) => s.lines)
      .filter((x) => x.orderLineId === sl.orderLineId)
      .reduce((a, x) => a + x.quantity, 0);
    const limit = ol.quantity + (replacementAllowance[ol.id] ?? 0);
    if (already + sl.quantity > limit) {
      throw new DomainError('validation', `Shipping ${already + sl.quantity} of line ${ol.id} exceeds allowed ${limit}`);
    }
  }
}

export function fulfillmentStatus(lines: OrderLineRef[], shipments: Shipment[]): { overall: OrderFulfillmentStatus; groups: GroupStatus[] } {
  const stages = [...new Set(lines.map((l) => l.stage))].sort();
  const groups = stages.map<GroupStatus>((stage) => {
    const ls = lines.filter((l) => l.stage === stage);
    const ids = new Set(ls.map((l) => l.id));
    const ordered = ls.reduce((a, l) => a + l.quantity, 0);
    const count = (states: ShipmentState[]) =>
      shipments.filter((s) => !s.isReplacement && states.includes(s.state)).flatMap((s) => s.lines).filter((x) => ids.has(x.orderLineId)).reduce((a, x) => a + x.quantity, 0);
    const shipped = Math.min(ordered, count(shippedStates));
    const delivered = Math.min(ordered, count(['delivered']));
    const status: GroupStatus['status'] =
      delivered >= ordered ? 'delivered' : delivered > 0 ? 'partially_delivered' : shipped >= ordered ? 'shipped' : shipped > 0 ? 'partially_shipped' : 'pending';
    return { stage, orderedQuantity: ordered, shippedQuantity: shipped, deliveredQuantity: delivered, outstanding: ordered - delivered, status };
  });
  let overall: OrderFulfillmentStatus;
  if (groups.every((g) => g.status === 'delivered')) overall = 'delivered';
  else if (groups.some((g) => g.deliveredQuantity > 0)) overall = 'partially_delivered';
  else if (groups.every((g) => g.status === 'shipped')) overall = 'shipped';
  else if (groups.some((g) => g.shippedQuantity > 0)) overall = 'partially_shipped';
  else overall = 'unfulfilled';
  return { overall, groups };
}
