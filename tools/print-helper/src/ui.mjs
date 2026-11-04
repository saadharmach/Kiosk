import http from "node:http";
import { readConfigFile, withBridge, withPrinter, writeConfigFile } from "./config.mjs";
import { isLocalAddress } from "./bridge.mjs";
import { canReach, pair, pairBridge, requestTest } from "./pairing.mjs";

/**
 * The app's page, on this computer only (127.0.0.1): what the helper serves and how it is doing, and a box to paste a
 * setup code from the back office (a printer) or the admin (the till bridge). No commands to type.
 *
 * Only this computer can open it, and a web page elsewhere cannot use it: the address must be 127.0.0.1/localhost and
 * changes are JSON requests, which a browser does not let another site send here.
 */

export function startUi({ port, supervisor, configPath, defaultApiUrl = "", version = "", log, deps = {} }) {
  const { pairImpl = pair, pairBridgeImpl = pairBridge, canReachImpl = canReach, requestTestImpl = requestTest } = deps;
  // Filled in once listening (the port given may be 0: any free one).
  let hosts = new Set();
  let origins = new Set();

  const settings = () => readConfigFile(configPath).values;
  const save = async (values) => { writeConfigFile(configPath, values); await supervisor.reload(); };

  async function addCode({ apiUrl, code }) {
    apiUrl = String(apiUrl ?? "").trim().replace(/\/+$/, "");
    code = String(code ?? "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(apiUrl)) throw new Error("The server address must start with https:// (for example https://backoffice.example.com)");
    if (!code) throw new Error("Paste the setup code shown in the back office or the admin");
    const existing = settings();
    // The same kind of code serves a printer (back office) or the till bridge (admin): ask for a printer first.
    let printer = null;
    try {
      printer = await pairImpl({ apiUrl, code });
    } catch (e) {
      if (e.status !== 400) throw e;
    }
    if (printer) {
      await save(withPrinter({ pollIntervalMs: 2000, ...existing, apiUrl }, { id: printer.printerId, label: printer.label, token: printer.token }));
      const notes = [];
      if (printer.host && printer.port) {
        const r = await canReachImpl(printer.host, printer.port);
        notes.push(r.ok ? `This computer reaches the printer at ${printer.host}:${printer.port}.` : `This computer cannot reach the printer at ${printer.host}:${printer.port} (${r.reason}): check it is on and its address in the back office.`);
      }
      try { await requestTestImpl({ apiUrl, token: printer.token }); notes.push("A test ticket is on its way."); } catch { /* the button on the page can ask again */ }
      log("INFO", `Added printer ${printer.label}`);
      return { kind: "printer", label: printer.label, notes };
    }
    let bridge;
    try {
      bridge = await pairBridgeImpl({ apiUrl, code });
    } catch (e) {
      if (e.status === 400) throw new Error("This setup code is not valid: it may be mistyped, used already, or older than 15 minutes. Get a new one in the back office (printer) or the admin (till).");
      throw e;
    }
    await save(withBridge({ pollIntervalMs: 2000, ...existing, apiUrl }, { id: bridge.bridgeId, label: bridge.label, token: bridge.token }));
    const notes = [];
    if (bridge.tillHost && bridge.tillPort) {
      const r = await canReachImpl(bridge.tillHost, bridge.tillPort);
      notes.push(r.ok ? `This computer reaches the till at ${bridge.tillHost}:${bridge.tillPort}.` : `This computer cannot reach the till at ${bridge.tillHost}:${bridge.tillPort} (${r.reason}): check unTill is running with TP-API on, and the address in the admin.`);
      if (!isLocalAddress(bridge.tillHost)) notes.push(`${bridge.tillHost} is not on this restaurant's network: the bridge will refuse it.`);
    }
    log("INFO", `Added the till bridge ${bridge.label}`);
    return { kind: "bridge", label: bridge.label, notes };
  }

  async function remove(key) {
    const v = settings();
    const [kind, id] = key.startsWith("bridge:") ? ["bridges", key.slice(7)] : ["printers", key];
    await save({ ...v, [kind]: (Array.isArray(v[kind]) ? v[kind] : []).filter((x) => x?.id !== id) });
  }

  async function testTicket(key) {
    const v = settings();
    const p = (v.printers ?? []).find((x) => x?.id === key);
    if (!p) throw new Error("Unknown printer");
    await requestTestImpl({ apiUrl: v.apiUrl, token: p.token });
  }

  const state = () => {
    let v = {};
    try { v = settings(); } catch { /* shown as empty */ }
    return { version, apiUrl: v.apiUrl || defaultApiUrl, configPath, entries: supervisor.entries() };
  };

  const send = (res, status, body, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
    res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
  };

  const server = http.createServer(async (req, res) => {
    if (!hosts.has(req.headers.host ?? "")) return send(res, 403, { error: "Open this page from this computer: http://127.0.0.1:" + server.address().port });
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    try {
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, state());
      if (req.method === "POST") {
        if ((req.headers.origin && !origins.has(req.headers.origin)) || !String(req.headers["content-type"]).startsWith("application/json")) {
          return send(res, 403, { error: "Not allowed" });
        }
        let raw = "";
        for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) return send(res, 413, { error: "Too large" }); }
        const body = raw ? JSON.parse(raw) : {};
        if (url.pathname === "/api/add") return send(res, 200, await addCode(body));
        if (url.pathname === "/api/remove") { await remove(String(body.key)); return send(res, 200, { ok: true }); }
        if (url.pathname === "/api/test-ticket") { await testTicket(String(body.key)); return send(res, 200, { ok: true }); }
      }
      return send(res, 404, { error: "Not found" });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      hosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);
      origins = new Set([...hosts].map((h) => `http://${h}`));
      resolve({ close: () => new Promise((r) => server.close(r)), port: actual });
    });
  });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXBORN Helper</title>
<style>
:root{--ink:#1b1712;--muted:#6b6358;--line:#e6dfd3;--bg:#f7f3ec;--card:#fff;--brand:#0f7a5c;--bad:#b91c1c;--warn:#b45309}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:760px;margin:0 auto;padding:28px 18px 60px}h1{font-size:26px;margin:0 0 4px}p.sub{margin:0 0 24px;color:var(--muted)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
h2{font-size:18px;margin:0 0 12px}label{display:block;font-size:14px;color:var(--muted);margin:10px 0 4px}
input{width:100%;height:44px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:inherit;background:#fff}
input#code{font-family:ui-monospace,Consolas,monospace;font-size:20px;letter-spacing:2px;text-transform:uppercase}
button{height:42px;border-radius:10px;border:1px solid var(--line);background:#fff;padding:0 16px;font:inherit;cursor:pointer}
button.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600;margin-top:14px}
button:disabled{opacity:.5}.row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;border-top:1px solid var(--line);padding:14px 0}
.row:first-of-type{border-top:0}.name{font-weight:600}.small{font-size:14px;color:var(--muted)}
.ok{color:var(--brand)}.bad{color:var(--bad)}.warn{color:var(--warn)}.actions{display:flex;gap:8px;flex-wrap:wrap}
#msg{margin-top:12px;white-space:pre-line}
</style></head><body><main>
<h1>NEXBORN Helper</h1><p class="sub">Prints the kiosk tickets and connects the restaurant's till. It runs by itself, even after a restart: this page only shows how it is doing.</p>
<section><h2>What it does here</h2><div id="list" class="small">Loading…</div></section>
<section><h2>Add a printer or the till</h2>
<p class="small" style="margin:0">Paste the setup code shown in the <b>back office</b> (Bornes › the printer › Set up the helper) or in the <b>admin</b> (restaurant › unTill › Set up the bridge).</p>
<label for="code">Setup code</label><input id="code" placeholder="K7QF-92XM" autocomplete="off" spellcheck="false">
<label for="api">Server address</label><input id="api" placeholder="https://backoffice.example.com" autocomplete="off" spellcheck="false">
<button class="primary" id="add">Add</button><div id="msg"></div></section>
<p class="small" id="foot"></p>
</main><script>
const $=(s)=>document.querySelector(s);
const post=async(path,body)=>{const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||("Error "+r.status));return j;};
const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const when=(iso)=>iso?new Date(iso).toLocaleString():"";
function line(e){const s=e.state||{};const api=s.api==="ok"?'<span class="ok">✓ connected to the server</span>':s.api==="down"?'<span class="bad">✗ cannot reach the server: '+esc(s.apiError)+'</span>':'<span class="small">connecting…</span>';
 let detail="";
 if(e.kind==="bridge"){detail=s.till==="ok"?'<span class="ok">✓ the till answers</span> <span class="small">('+esc(when(s.lastCallAt))+')</span>':s.till==="error"?'<span class="bad">✗ '+esc(s.tillError)+'</span>':'<span class="small">the till has not been asked yet (the server asks within a minute)</span>';}
 else{const t=s.lastTicket;detail=!t?'<span class="small">no ticket printed since it started</span>':t.ok?'<span class="ok">✓ last ticket printed</span> <span class="small">('+esc(when(t.at))+')</span>':'<span class="bad">✗ last ticket failed: '+esc(t.error)+'</span>';}
 const buttons=(e.kind==="printer"?'<button data-test="'+esc(e.key)+'">Test ticket</button>':"")+'<button data-remove="'+esc(e.key)+'">Remove</button>';
 return '<div class="row"><div><div class="name">'+(e.kind==="bridge"?"Till: ":"Printer: ")+esc(e.label)+'</div><div>'+api+'</div><div>'+detail+'</div></div><div class="actions">'+buttons+'</div></div>';}
async function refresh(){try{const s=await (await fetch("/api/state")).json();
 $("#list").innerHTML=s.entries.length?s.entries.map(line).join(""):'<p class="small" style="margin:0">Nothing yet: add a printer or the till below.</p>';
 if(!$("#api").value&&s.apiUrl)$("#api").value=s.apiUrl;$("#foot").textContent="Version "+s.version+" · settings: "+s.configPath;}catch{$("#list").innerHTML='<span class="bad">The helper is not running.</span>';}}
$("#add").onclick=async()=>{const b=$("#add");b.disabled=true;$("#msg").textContent="Adding…";$("#msg").className="";
 try{const r=await post("/api/add",{code:$("#code").value,apiUrl:$("#api").value});$("#msg").className="ok";$("#msg").textContent="✓ Added: "+r.label+(r.notes.length?"\\n"+r.notes.join("\\n"):"");$("#code").value="";refresh();}
 catch(e){$("#msg").className="bad";$("#msg").textContent="✗ "+e.message;}finally{b.disabled=false;}};
document.addEventListener("click",async(ev)=>{const t=ev.target;
 if(t.dataset.test){t.disabled=true;try{await post("/api/test-ticket",{key:t.dataset.test});t.textContent="Sent ✓";}catch(e){alert(e.message);}setTimeout(()=>{t.disabled=false;t.textContent="Test ticket";},3000);}
 if(t.dataset.remove&&confirm("Remove it from this computer? It stops printing / connecting here.")){await post("/api/remove",{key:t.dataset.remove}).catch((e)=>alert(e.message));refresh();}});
refresh();setInterval(refresh,3000);
</script></body></html>`;
