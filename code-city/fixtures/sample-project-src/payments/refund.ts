import { globalLedger } from "./ledger.ts";
import type { Refund } from "./types.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("refund");
let nextId = 1;

export function createRefund(chargeId: string, amountCents: number, reason: string): Refund {
  const refund: Refund = {
    id: `re_${nextId++}`,
    chargeId,
    amountCents,
    reason,
  };
  globalLedger.record({
    id: refund.id,
    type: "refund",
    amountCents: refund.amountCents,
    timestamp: Date.now(),
  });
  logger.info(`refund ${refund.id} for charge ${chargeId}`);
  return refund;
}

export function refundReasonSummary(refunds: Refund[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const r of refunds) {
    summary[r.reason] = (summary[r.reason] ?? 0) + 1;
  }
  return summary;
}
