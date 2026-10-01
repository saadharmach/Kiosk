# Testing

```
pnpm test                 # everything, from the project root (about 10 seconds)
pnpm --filter @kiosk/api test
pnpm --filter @kiosk/kiosk-web test
pnpm --filter @kiosk/print-helper test
pnpm --filter @kiosk/api typecheck:test   # type-check the API tests too
```

The tests use Node's built-in test runner (`node:test`) and `tsx`. There is no extra framework.

**They never touch the database, the network, unTill or a printer.** The services run for real against a small in-memory
stand-in for Prisma (`apps/api/test/helpers/fake-prisma.ts`), so the suite is fast and cannot hurt any data. It also means
it cannot tell you whether a real SQL query is right: see "Not covered".

## What is covered

| Area | Where | What it protects |
|---|---|---|
| **Pricing** | `apps/api/test/pricing.test.ts` | Prices come from the server's price list, never the browser; sizes; "choose exactly N" option groups; paid and free options; refusal of zero-priced, hidden, inactive and out-of-zone products; VAT; names in the customer's language. |
| **Order status machine** | `order-status.test.ts` | Only legal moves; final states stay final; timestamps and history written together; every write scoped by restaurant; two people racing gets a 409. |
| **Tenant isolation** | `auth.test.ts`, `printing.test.ts`, `branding.test.ts` | A token for one restaurant cannot reach another's URLs; platform and restaurant tokens are not interchangeable; forged, tampered and expired tokens are refused; the print helper's secret is stored only as a hash and scopes everything it touches. |
| **Catalog and bootstrap** | `catalog.test.ts` | What the kiosk may sell (zero-price products hidden, hidden departments take their products), allergens on or off, which order types are offered, the restaurant's logo/hero/tagline. |
| **Order entry** | `orders-service.test.ts` | A disabled order type cannot be priced; language handling; a repeated tap returns the same order and prints no second ticket. |
| **Tickets** | `escpos.test.ts`, `ticket.test.ts`, `printing.test.ts` | French accents and the euro sign on the printer's code page; no line wider than 48 columns whatever the content; the stand number or order number chosen like the kiosk does; automatic vs manual printing; retries, backoff and giving up. |
| **Table numbers, languages, printer settings** | `table-ranges`, `locale`, `printer-config` tests | Both casings of unTill's table ranges; fall-back order of languages; junk in JSON columns never throws. |
| **Option kinds** | `option-kinds.test.ts` (API), `options.test.ts` (kiosk) | unTill's kinds (must-have, free option, supplement, condiment) get the right limits; supplements and condiments are optional, several allowed, each once; a repeated choice or a group the product does not have is refused; supplements never make a zero-price product sellable. |
| **Suggestions** | `suggestions.test.ts` (API), `catalog.test.ts`, `suggestions.test.ts` (kiosk) | Each department has its own list, saved whole and in order, scoped by restaurant; unknown products, retired products and menus are refused; the kiosk gets only sellable suggestions; at most four are offered, skipping what is already in the order. |
| **Editing the cart** | `cart-edit.test.ts` (kiosk) | An edited line keeps its place; if it becomes identical to another line the two merge and quantities add; reopening a line restores its choices and drops ones that have left the menu. |
| **Kiosk logic** | `apps/kiosk/test` | The accent colour and readable text colour (and that a bad colour can never inject CSS); the three languages have exactly the same texts and placeholders; detection of a lost connection; the cart request never carries a price. |
| **Print helper** | `tools/print-helper/test` | Real TCP delivery; one ticket at a time; a printer that drops the connection after taking the data is a success (no double tickets); survives a dead API or a rejected token; stops promptly. |

## How these tests were checked

A test that cannot fail is worth nothing. For the pricing, status, catalog, tenant, token, branding, printing and helper
rules, each important check was deliberately broken in the source, one at a time, and the suite had to go red, then the
code was put back. Two real problems were found this way and fixed: a ticket line that overflowed on narrower paper, and
an accent colour whose text had only 3:1 contrast.

Do the same when you add a rule: break it on purpose and make sure a test fails.

## Not covered (be aware)

- **Real SQL.** The print queue's claim query (`FOR UPDATE SKIP LOCKED`) and everything in Prisma's `where` clauses run only
  against the fake. They were exercised by hand against the real database, but nothing re-checks them automatically.
- **Order creation end to end.** `OrdersService.create` (the transaction, table/stand allocation under concurrency) and
  the automatic ticket for a brand-new order have no automated test. Only the repeated-tap case and the ticket builder are covered.
- **unTill.** The SOAP client (`packages/tpapi`), order submission and the retry sweep (`OrderSubmitService`), and the
  catalog sync have no tests. They need a recorded unTill conversation or a fake TPAPI server.
- **Login.** Password checking, refresh-token rotation and the admin CLI commands.
- **Screens.** No React component or browser test: the kiosk screens, the idle warning, the connection-lost screen and the
  whole back office were checked by hand in a browser.
- **No CI yet.** Nothing runs these tests automatically on a commit. Add `pnpm test` to the pipeline when deployment is set up.

## Writing a new test

Put it in `apps/api/test/*.test.ts` (or the `test` folder of the package). For a service, build a fake database with
`model(rows)` from `helpers/fake-prisma.ts`, create the service by hand (`new PricingService(fakePrisma as never)`) and call
it. The fake answers `findMany`/`findFirst` from the rows you give it and honours `where` equality and `{ in: [...] }`.
For a write, hand-write the method you need and record its arguments, so you can assert the `where` includes the
restaurant.
