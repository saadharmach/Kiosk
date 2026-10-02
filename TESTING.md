# Testing

```
pnpm test                 # everything, from the project root (about 10 seconds)
pnpm --filter @kiosk/api test
pnpm --filter @kiosk/kiosk-web test
pnpm --filter @kiosk/print-helper test
pnpm --filter @kiosk/admin test
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
| **Bornes** | `apps/api/test/bornes.test.ts`, `apps/kiosk/test/borne.test.ts` | Borne codes K1, K2… never reused and capped at 20; every borne change is scoped to its own restaurant (another restaurant's borne is a 404); a borne with orders cannot be deleted; deleting one removes its printer; order references and `kioskId` follow the borne; a switched-off borne answers 503 and takes no order; a retried order is not duplicated; a ticket goes to the borne's own printer and falls back to the restaurant printer (with a warning) when the borne has none or it is off; the kiosk remembers its borne from the link. |
| **Table numbers, languages, printer settings** | `table-ranges`, `locale`, `printer-config` tests | Both casings of unTill's table ranges; fall-back order of languages; junk in JSON columns never throws. |
| **Option kinds** | `option-kinds.test.ts` (API), `options.test.ts` (kiosk) | unTill's kinds (must-have, free option, supplement, condiment) get the right limits; supplements and condiments are optional, several allowed, each once; a repeated choice or a group the product does not have is refused; supplements never make a zero-price product sellable. |
| **Platform admin** | `restaurant-users.test.ts`, `admin-roles.test.ts`, `dto-validation.test.ts` (API), `platform.test.ts` (admin) | Temporary passwords are random, shown once, stored only as a hash and never written to the audit log; every user write is scoped by restaurant and a user from another restaurant cannot be reached; switching a user off or resetting their password ends their sessions and unlocks the account; only a SUPER_ADMIN can change anything (SUPPORT can look and sync); the API's validation accepts every body the screens send (editing a restaurant never worked before this test existed); the activity log never carries the data itself; a signed-out refresh is a 401, not a crash; the till-link health word. The overview (`overview.test.ts`): what counts as a problem, a heads-up or unfinished setup; switched-off restaurants are never flagged; a recovered till is not reported; a failing till is said once; only really placed orders are counted and only recent ones can be "stuck"; findings open the right tab. The go-live checklist (`readiness.test.ts`): which checks are required and which only recommended; warnings never block; a failing till, an empty or price-less menu and a stale menu are caught; an order type counts only if it has a sales area and a table source (one rule shared with the kiosk's bootstrap); only till-confirmed orders count as proof; every database read carries the restaurant. |
| **Automatic menu sync** | `sync-schedule.test.ts`, `catalog-sync.test.ts` | The menu is replaced all at once in one transaction (the kiosk never sees an empty or half-updated menu, and a failure changes nothing); only this restaurant's rows are touched; two syncs of one restaurant never run at once; the schedule (hourly after a good run, retry after 15 min then 30, 60, never beyond the interval; a manual sync restarts the clock; a dead "running" run counts as a failure); the scheduler syncs one restaurant at a time, only active ones with a switched-on connection and credentials, one failure never stops the others, passes never overlap, and an interrupted sync is closed on start-up; the overview flags syncs that keep failing. |
| **Unavailable restaurant** | `availability.test.ts`, `restaurant-slug.test.ts` (API), `api.test.ts` (kiosk) | A suspended or archived restaurant answers 503 with a code on every public kiosk route (menu, bootstrap, price quote, order, ticket read-back) and never says why; an unknown address stays 404; the kiosk tells "unavailable" apart from a lost connection; the address can change only until the first order, never to one already taken, and is audited. |
| **Orders and till log (admin)** | `admin-orders.test.ts` | Orders are read through the restaurant's own code, always for that restaurant (another restaurant's order is not found); re-checking the till is open to support, retrying only to SUPER_ADMIN; both are recorded against the platform user and audited; only a FAILED order can be retried and only a SENT one re-checked; the till log shows who/what/when/result and never the stored request or response (they hold the order lines), is scoped by restaurant, and its pages are bounded. |
| **Team and passwords (admin)** | `team.test.ts`, `dto-validation.test.ts` | Nobody can switch themselves off, change their own role or reset their own password, and the platform can never be left without an active super admin; a new member or a reset gets a random password shown once (never stored or audited), and must choose their own before doing anything else; the guard asks who someone is *now* on every request (a token for someone since switched off, demoted or reset stops working at once, within seconds on other servers), using a short cache that is dropped as soon as a change is made; changing your own password needs the current one, counts wrong guesses towards the lock-out, ends your other sessions and keeps this one; the whole team screen is SUPER_ADMIN only. |
| **Real email addresses** | `real-email.test.ts` | An account (restaurant user, platform team member) and a restaurant's contact email need a real address: placeholders (`.test`, `.local`, `example.com`, no dot) and well-known throw-away services are refused offline; otherwise the domain must have a mail server (MX, else an address record; a "no mail" MX is refused); a broken or slow lookup never blocks anyone and is not remembered; answers are cached for 10 minutes; `EMAIL_CHECK=off` skips it. It cannot prove the person *owns* the address (that needs a confirmation email). |
| **Email invitations** | `invitations.test.ts`, `real-email.test.ts`, `team.test.ts`, `restaurant-users.test.ts` | New accounts get an emailed link to choose their own password, so no password is ever shown or known and opening the link proves the address is theirs; the token exists only in the email (the database holds its SHA-256), is random, single-use (two people opening it: one wins), lasts 72 h (a reset 24 h), and a newer link cancels older ones; every bad link gets the same answer; a reset cuts off the old password and every session at once; a failed send never loses the account and is reported; a production server with no SMTP refuses to send; the SMTP path is tested against a real local SMTP server; emails are French or English per restaurant and escape anything typed into them; only people still waiting for a password can be re-invited. |
| **Forgot password and mail tools** | `forgot-password.test.ts` | Asking for a reset always gets the same answer whether or not the address (or the restaurant) exists, and the work after the lookup runs in the background so the time taken gives nothing away; the person's current password and sessions are never touched by the request (nobody can be locked out by being asked for); a second request within two minutes is ignored only while the first link is still unused; someone who never chose a password gets an invitation instead; suspended restaurants, switched-off accounts and the wrong restaurant send nothing; a failing mail server never changes the answer; the email says the current password keeps working (and the platform's own reset says it does not); mail errors (wrong password, bad host, firewall, TLS mismatch, rejected sender) are explained in plain words. |
| **Deleting users for good** | `team.test.ts`, `restaurant-users.test.ts` | A person can only be deleted after being switched off (two deliberate steps); never yourself; never the last super admin; a restaurant's delete is scoped to that restaurant (another restaurant's user is not found); the account and its waiting links go together; the audit trail keeps who did it and the deleted person's address, and the team history still names them; only a SUPER_ADMIN can do it. |
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
  reading and parsing of the till's answers during a menu sync have no tests. They need a recorded unTill conversation or a
  fake TPAPI server. (How a sync is *applied* and *scheduled* is tested: see "Automatic menu sync".)
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
