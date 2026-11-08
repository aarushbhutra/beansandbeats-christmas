import "server-only";
import type { Database } from "./db";
import { hashPassword } from "./passwords";

/**
 * Work-in-progress menu confirmed by Aden (beans&beats) on 28 Oct 2026: pure coffee only.
 * Iced is +$1 on every drink; oat milk is +$1; black drinks and espresso have no milk option.
 * A booth lead can edit everything in /lead/menu. Confirm final prices before service.
 */
export const SAMPLE_MENU = [
  { name: "espresso", description: "a straight double shot", category: "coffee", priceCents: 300, milk: ["none"], temps: ["hot", "iced"], iced: 100, milkSurcharges: {} },
  { name: "americano", description: "espresso lengthened with water", category: "coffee", priceCents: 600, milk: ["none"], temps: ["hot", "iced"], iced: 100, milkSurcharges: {} },
  { name: "latte", description: "espresso with steamed milk", category: "coffee", priceCents: 800, milk: ["milk", "oat"], temps: ["hot", "iced"], iced: 100, milkSurcharges: { oat: 100 } },
  { name: "flat white", description: "a stronger, silkier milk coffee", category: "coffee", priceCents: 800, milk: ["milk", "oat"], temps: ["hot", "iced"], iced: 100, milkSurcharges: { oat: 100 } },
  { name: "pour-over", description: "single origin, brewed by hand", category: "coffee", priceCents: 1000, milk: ["none"], temps: ["hot", "iced"], iced: 100, milkSurcharges: {} },
] as const;

type Env = Record<string, string | undefined>;

export async function bootstrap(db: Database, options: { env?: Env } = {}): Promise<void> {
  const env = options.env ?? process.env;
  const [{ count: staffCount }] = await db.query<{ count: number }>("select count(*)::int as count from bb.staff");
  if (staffCount === 0) {
    const accounts: { username?: string; password?: string; role: "lead" | "barista"; name: string }[] = [
      { username: env.BOOTSTRAP_LEAD_USERNAME ?? "lead", password: env.BOOTSTRAP_LEAD_PASSWORD, role: "lead", name: "booth lead" },
      { username: env.BOOTSTRAP_BARISTA_USERNAME ?? "barista", password: env.BOOTSTRAP_BARISTA_PASSWORD, role: "barista", name: "barista" },
    ];
    for (const account of accounts) {
      if (!account.password || account.password.length < 8) continue;
      await db.query(
        "insert into bb.staff(username, display_name, role, password_hash) values ($1, $2, $3, $4) on conflict (username) do nothing",
        [account.username!.toLowerCase(), account.name, account.role, await hashPassword(account.password.trim())],
      );
    }
  }
  const [{ count: menuCount }] = await db.query<{ count: number }>("select count(*)::int as count from bb.menu_items");
  if (menuCount === 0 && env.SEED_SAMPLE_MENU !== "false") {
    await db.tx(async q => {
      for (const [index, item] of SAMPLE_MENU.entries()) {
        const [row] = await q.query<{ id: string }>(
          `insert into bb.menu_items(name, description, category, price_cents, allowed_milk, allowed_temperatures, sort_order, iced_surcharge_cents, milk_surcharges)
           values ($1, $2, $3, $4, array(select jsonb_array_elements_text($5::text::jsonb)), array(select jsonb_array_elements_text($6::text::jsonb)), $7, $8, $9::text::jsonb)
           returning id`,
          [item.name, item.description, item.category, item.priceCents, JSON.stringify(item.milk), JSON.stringify(item.temps), index * 10, item.iced, JSON.stringify(item.milkSurcharges)],
        );
        await q.query(
          `insert into bb.menu_revisions(menu_item_id, revision, name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges, sold_out, active)
           select id, revision, name, price_cents, allowed_milk, allowed_temperatures, iced_surcharge_cents, milk_surcharges, sold_out, active from bb.menu_items where id = $1`,
          [row.id],
        );
      }
    });
  }
}
