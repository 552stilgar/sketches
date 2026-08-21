import { newForm } from "./form.ts";
import { renderButton } from "./button.ts";
import { newSessionManager } from "../auth/session.ts";
import { globalLedger } from "../payments/ledger.ts";
import { formatCurrency, formatDate } from "../utils/format.ts";

const sessions = newSessionManager();

export function renderDashboard(userId: string): string {
  const balance = globalLedger.balance();
  const balanceLine = `<p>Balance: ${formatCurrency(balance)}</p>`;
  const dateLine = `<p>As of: ${formatDate(new Date())}</p>`;
  const logoutButton = renderButton({ label: "logout", variant: "secondary" });
  const feedbackForm = newForm()
    .addField({ name: "comment", value: "", required: false })
    .render();
  return [balanceLine, dateLine, logoutButton, feedbackForm, userId].join("\n");
}

export function isDashboardAccessible(token: string): boolean {
  return sessions.isValid(token);
}
