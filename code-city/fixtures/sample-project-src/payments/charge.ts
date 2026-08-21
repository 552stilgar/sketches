import { globalLedger } from "./ledger.ts";
import { isPositiveInt, ValidationError } from "../utils/validate.ts";
import { createLogger } from "../utils/logger.ts";
import type { Charge } from "./types.ts";

const logger = createLogger("charge");
let nextId = 1;

export function createCharge(amountCents: number, currency: string = "USD"): Charge {
  if (!isPositiveInt(amountCents)) {
    throw new ValidationError("amountCents", "amount must be a positive integer");
  }
  const charge: Charge = {
    id: `ch_${nextId++}`,
    amountCents,
    currency,
    status: "pending",
  };
  logger.info(`created charge ${charge.id}`);
  return charge;
}

export function settleCharge(charge: Charge): Charge {
  const settled: Charge = { ...charge, status: "settled" };
  globalLedger.record({
    id: settled.id,
    type: "charge",
    amountCents: settled.amountCents,
    timestamp: Date.now(),
  });
  return settled;
}
