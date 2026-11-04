/**
 * Dumps every READ-ONLY TPAPI operation we care about into output/data/*.json
 * and writes a human-readable summary. No write operations are called.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TpapiClient } from "@kiosk/tpapi";

const OUT_DIR = path.resolve(import.meta.dirname, "../output/data");

const client = new TpapiClient({
  endpoint: process.env.TPAPI_ENDPOINT,
  credentials: {
    userName: process.env.TPAPI_USERNAME ?? "",
    password: process.env.TPAPI_PASSWORD ?? "",
    appToken: process.env.TPAPI_APPTOKEN ?? "",
    appName: process.env.TPAPI_APPNAME ?? "KioskPlatform",
  },
  timeoutMs: 60_000,
});

type Task = { file: string; op: string; args?: Record<string, unknown> };

/** Called once, no sales area needed. */
const GLOBAL_TASKS: Task[] = [
  { file: "version", op: "GetVersion" },
  { file: "server-info", op: "GetServerInfo" },
  { file: "pos-status", op: "GetPosStatus" },
  { file: "bo-status", op: "GetBOStatus" },
  { file: "sales-areas", op: "GetSalesAreasInfo" },
  { file: "categories", op: "GetCategoriesInfo" },
  { file: "groups", op: "GetGroupsInfo" },
  { file: "prices", op: "GetPricesInfo" },
  { file: "periods", op: "GetPeriodsInfo" },
  { file: "payments", op: "GetPaymentsInfo" },
  { file: "size-modifiers", op: "GetSizeModifiersInfo" },
  { file: "allergens", op: "GetAllergensInfo" },
  { file: "printers", op: "GetPrintersInfo" },
  { file: "courses", op: "GetCourses" },
  { file: "void-reasons", op: "GetVoidReasons" },
  { file: "discount-reasons", op: "GetDiscountReasons" },
  { file: "discount-groups", op: "GetDiscountGroupsInfo" },
];

/** Called once per sales area. */
const perSalesArea = (id: number): Task[] => [
  { file: `sa${id}-departments`, op: "GetDepartmentsInfo", args: { SalesAreaId: id, DepartmentId: 0 } },
  { file: `sa${id}-articles`, op: "GetArticles", args: { SalesAreaId: id } },
  { file: `sa${id}-articles-info`, op: "GetArticlesInfo", args: { SalesAreaId: id, ArticleId: 0, GetInactive: false } },
  { file: `sa${id}-options`, op: "GetOptionsInfo", args: { SalesAreaId: id, OptionId: 0 } },
  { file: `sa${id}-active-orders`, op: "GetActiveOrders", args: { SalesAreaId: id } },
];

type Outcome = { task: Task; ok: boolean; returnCode?: number; message?: string; error?: string; data?: Record<string, unknown> };

async function run(task: Task): Promise<Outcome> {
  process.stdout.write(`  ${task.op}${task.args ? ` ${JSON.stringify(task.args)}` : ""} ... `);
  try {
    const data = (await client.call(task.op, task.args ?? {}, { ignoreReturnCode: true })) as
      | Record<string, unknown>
      | undefined;
    if (!data) {
      console.log("FAILED — client returned no data");
      return { task, ok: false, error: "client returned undefined (check client.ts returns data)" };
    }
    const returnCode = Number(data.ReturnCode ?? -1);
    const message = String(data.ReturnMessage ?? "");
    console.log(returnCode === 0 ? "ok" : `code ${returnCode} (${message})`);
    return { task, ok: returnCode === 0, returnCode, message, data };
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.log(`FAILED — ${error}`);
    return { task, ok: false, error };
  }
}


/** Short preview of a value for the summary. */
function preview(value: unknown, max = 900): string {
  const json = JSON.stringify(value, null, 2) ?? "undefined";
  return json.length > max ? `${json.slice(0, max)}\n… (truncated)` : json;
}

function describe(outcome: Outcome): string[] {
  const lines = [`### ${outcome.task.op}${outcome.task.args ? ` ${JSON.stringify(outcome.task.args)}` : ""}`, ""];
  if (outcome.error) return [...lines, `❌ ${outcome.error}`, ""];
  lines.push(`ReturnCode: ${outcome.returnCode} ${outcome.message ? `— ${outcome.message}` : ""}`, "");
  for (const [key, value] of Object.entries(outcome.data ?? {})) {
    if (key === "ReturnCode" || key === "ReturnMessage") continue;
    if (Array.isArray(value)) {
      lines.push(`- **${key}**: ${value.length} item(s)`);
      if (value.length) lines.push("", "```json", preview(value.slice(0, 2)), "```", "");
    } else {
      lines.push(`- **${key}**: \`${preview(value, 120)}\``);
    }
  }
  lines.push("");
  return lines;
}

async function main() {
  if (!process.env.TPAPI_USERNAME) throw new Error("TPAPI_USERNAME is empty — did you run: set -a; source .env; set +a ?");
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`\n📡 ${client.endpoint}\n`);
  const outcomes: Outcome[] = [];

  console.log("Global operations:");
  for (const task of GLOBAL_TASKS) outcomes.push(await run(task));

  // Sales areas drive the per-area calls
  const salesAreasOutcome = outcomes.find((o) => o.task.op === "GetSalesAreasInfo");
  const salesAreas = (salesAreasOutcome?.data?.SalesAreas ?? []) as Array<Record<string, unknown>>;
  console.log(`\n${salesAreas.length} sales area(s) found`);

  for (const area of salesAreas) {
    const id = Number(area.SalesAreaId);
    console.log(`\nSales area ${id} — ${String(area.SalesAreaName ?? "")}:`);
    for (const task of perSalesArea(id)) outcomes.push(await run(task));
  }

  for (const outcome of outcomes) {
    await writeFile(
      path.join(OUT_DIR, `${outcome.task.file}.json`),
      JSON.stringify({ operation: outcome.task.op, args: outcome.task.args ?? {}, ok: outcome.ok, error: outcome.error, data: outcome.data }, null, 2),
    );
  }

  const md = [
    `# TPAPI data dump`, ``,
    `- Endpoint: ${client.endpoint}`,
    `- Date: ${new Date().toISOString()}`,
    `- Operations called: ${outcomes.length} (${outcomes.filter((o) => o.ok).length} ok)`,
    ``, `---`, ``,
    ...outcomes.flatMap(describe),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "SUMMARY.md"), md);

  console.log(`\n✅ ${outcomes.length} operations written to output/data/`);
  console.log(`   Summary: output/data/SUMMARY.md\n`);
}

main().catch((e) => { console.error(`\n❌ ${e instanceof Error ? e.message : e}`); process.exit(1); });