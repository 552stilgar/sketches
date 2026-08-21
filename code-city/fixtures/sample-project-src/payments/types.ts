export interface Charge {
  id: string;
  amountCents: number;
  currency: string;
  status: "pending" | "settled" | "failed";
}

export interface Refund {
  id: string;
  chargeId: string;
  amountCents: number;
  reason: string;
}

export interface LedgerEntry {
  id: string;
  type: "charge" | "refund";
  amountCents: number;
  timestamp: number;
}
