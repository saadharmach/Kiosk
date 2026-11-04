/**
 * Calls any TPAPI operation from the command line.
 *   pnpm --filter @kiosk/tpapi-discovery call Ping
 *   pnpm --filter @kiosk/tpapi-discovery call GetSalesAreasInfo '{}'
 *   pnpm --filter @kiosk/tpapi-discovery call GetArticlesInfo '{"SalesAreaId":1}'
 */
import { TpapiClient, OPERATIONS } from "@kiosk/tpapi";

const [operation, jsonArgs] = process.argv.slice(2);

if (!operation) {
  console.log("Usage: call <Operation> ['<json>']\n");
  console.log("Available operations:\n  " + Object.keys(OPERATIONS).join("\n  "));
  process.exit(1);
}

const client = new TpapiClient({
  endpoint: process.env.TPAPI_ENDPOINT,
  credentials: {
    userName: process.env.TPAPI_USERNAME ?? "",
    password: process.env.TPAPI_PASSWORD ?? "",
    appToken: process.env.TPAPI_APPTOKEN ?? "",
    appName: process.env.TPAPI_APPNAME ?? "KioskPlatform",
  },
  captureXml: process.env.TPAPI_DEBUG_XML === "1",
  logger: (e) => {
    console.error(`[tpapi] ${e.operation} ${e.ok ? "OK" : "FAIL"} ${e.durationMs}ms` +
      (e.returnCode !== undefined ? ` code=${e.returnCode} "${e.returnMessage}"` : "") +
      (e.error ? ` error=${e.error}` : ""));
    if (e.requestXml) console.error(`--- request ---\n${e.requestXml}\n`);
    if (e.responseXml) console.error(`--- response ---\n${e.responseXml}\n`);
  },
});

try {
  const args = jsonArgs ? JSON.parse(jsonArgs) : {};
  const result = await client.call(operation, args, { ignoreReturnCode: true });
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(`\n❌ ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  process.exit(1);
}