import type { LeadHandlers } from "../../contracts";
import { HandlerError, requireLead, validateMenuChange, type MenuRepository, type StaffPrincipal } from "../menu";
import { calculateDailyReport, validateDay } from "./calculate";
import { reportCsv } from "./csv";
import type { ReportDependencies } from ".";

/** Exact published lib/contracts.ts interface, for Person 1's authenticated route/sync wiring. */
export function createLeadHandlers(deps: {
  principal: () => Promise<StaffPrincipal | null>;
  menu: MenuRepository;
  readSnapshot: ReportDependencies["readSnapshot"];
  now?: () => Date;
}): LeadHandlers {
  async function report(day: string) {
    requireLead(await deps.principal()); validateDay(day);
    const snapshot = await deps.readSnapshot(day);
    return calculateDailyReport(snapshot.orders, day, snapshot.devices, deps.now?.() ?? new Date());
  }
  return {
    async updateMenu(item, expectedRevision) {
      const actor = requireLead(await deps.principal());
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HandlerError(400, "INVALID_INPUT", "Valid menu ID and expected revision required.");
      const { id, revision: _revision, ...change } = item;
      const updated = await deps.menu.update(id, expectedRevision, validateMenuChange(change), actor.id);
      if (!updated) throw new HandlerError(409, "REVISION_CONFLICT", "Menu item changed; refresh and review current values.");
      return updated;
    },
    report,
    csv: async day => reportCsv(await report(day)),
  };
}
