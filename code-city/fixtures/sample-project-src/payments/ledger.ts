import { createLogger } from "../utils/logger.ts";
import type { LedgerEntry } from "./types.ts";

const logger = createLogger("ledger");

export class Ledger {
  private entries: LedgerEntry[] = [];

  record(entry: LedgerEntry): void {
    this.entries.push(entry);
    logger.info(`recorded ${entry.type} ${entry.id}`);
  }

  balance(): number {
    return this.entries.reduce((sum, e) => {
      return e.type === "charge" ? sum + e.amountCents : sum - e.amountCents;
    }, 0);
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }
}

export const globalLedger = new Ledger();
