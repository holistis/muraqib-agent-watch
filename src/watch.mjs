#!/usr/bin/env node
// muraqib-agent-watch: eerste, kleinste versie. Geen oordeel "dit is veilig/
// onveilig" -- gewoon eerlijk uitlezen wat een MCP-agent MAG doen, per categorie,
// en zeggen of de tool zelf al een begrenzing noemt of niet. De mens beslist.
//
// Gebruik: node src/watch.mjs <commando> [argumenten...]
//   node src/watch.mjs npx capacity-attest
//   node src/watch.mjs node dist/index.js
import { spawn } from "node:child_process";

const CATEGORIEEN = {
  geld: ["amount", "price", "payment", "pay", "transfer", "fee", "cost", "balance", "wallet", "fund"],
  bestanden: ["path", "file", "write", "delete", "directory", "folder"],
  extern: ["url", "fetch", "http", "email", "send", "recipient", "webhook", "endpoint", "rpcurl"],
  vernietigend: ["delete", "remove", "revoke", "cancel", "terminate", "destroy"],
  identiteit: ["key", "secret", "token", "credential", "signature", "private"],
};
const BEGRENZING_WOORDEN = ["validate", "verify", "verified", "scope", "limit", "allowlist", "require", "must", "pattern", "forbidden", "read-only", "never writes", "never touches"];

function vindCategorieen(tool) {
  // $schema is bijna altijd "https://json-schema.org/...", en dat bevat de
  // substring "http" -- zonder dit te verwijderen kreeg bijna ELKE tool
  // (van wat voor server dan ook) automatisch "extern" als categorie, puur
  // door zijn eigen schema-metadata, niet door wat de tool echt doet
  // (gemeten tegen @modelcontextprotocol/server-filesystem, 2026-10-23).
  const schemaZonderMeta = JSON.stringify(tool.inputSchema || {}).replace(/"\$schema":"[^"]*"/g, "");
  const tekst = `${tool.name} ${tool.description || ""} ${schemaZonderMeta}`.toLowerCase();
  const gevonden = [];
  for (const [naam, woorden] of Object.entries(CATEGORIEEN)) {
    if (woorden.some((w) => tekst.includes(w))) gevonden.push(naam);
  }
  return gevonden;
}

function heeftBegrenzing(tool) {
  const tekst = (tool.description || "").toLowerCase();
  return BEGRENZING_WOORDEN.some((w) => tekst.includes(w));
}

async function mcpAanroep(proc, bericht) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    // 30s, niet 8s: een koude npx-install van een grotere server (gemeten bij
    // @modelcontextprotocol/server-everything, die zelf nog sub-pakketten
    // ophaalt) duurt op de allereerste run ruim langer dan 8s voor hij ook
    // maar antwoordt, los van onze eigen code. Met warm npx-cache is dit
    // ruim binnen een paar seconden.
    const timer = setTimeout(() => reject(new Error(`geen antwoord binnen 30s op ${bericht.method}`)), 30000);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const regel = buffer.indexOf("\n");
      if (regel === -1) return;
      clearTimeout(timer);
      proc.stdout.off("data", onData);
      try {
        resolve(JSON.parse(buffer.slice(0, regel)));
      } catch (e) {
        reject(new Error(`ongeldig antwoord op ${bericht.method}: ${e.message}`));
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(bericht) + "\n");
  });
}

async function main() {
  const [commando, ...args] = process.argv.slice(2);
  if (!commando) {
    console.log("Gebruik: node src/watch.mjs <commando> [argumenten...]");
    console.log("Voorbeeld: node src/watch.mjs npx capacity-attest");
    process.exitCode = 2;
    return;
  }

  // Windows heeft shell:true nodig om een .cmd-shim als npx te vinden, maar
  // shell:true + een los args-array laat Node zelf een shell-string bouwen
  // zonder escaping (precies de DEP0190-waarschuwing). Dus zelf, veilig,
  // quoten -- MAAR het commando zelf (npx, node, ...) NOOIT aanhalen als het
  // geen spatie bevat: cmd.exe's batch-interpreter (npx is zelf een .cmd-
  // bestand) leest zijn eigen pad anders zodra de aanroep zelf al aangehaald
  // binnenkomt, en loste dan intern het verkeerde npm-prefix.js-pad op
  // (gemeten 2026-10-23: "Cannot find module ...node_modules\npm\bin\npm-
  // prefix.js", alleen via dit script, nooit bij een kale `npx`-aanroep).
  const veiligCitaat = (s) => (/[\s"&|<>^%]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const proc =
    process.platform === "win32"
      ? spawn([veiligCitaat(commando), ...args.map(veiligCitaat)].join(" "), { stdio: ["pipe", "pipe", "pipe"], shell: true })
      : spawn(commando, args, { stdio: ["pipe", "pipe", "pipe"] });
  let fout = "";
  proc.stderr.on("data", (c) => (fout += c.toString("utf8")));

  let tools;
  try {
    await mcpAanroep(proc, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-06-18", capabilities: {}, clientInfo: { name: "muraqib-agent-watch", version: "0.1.0" } } });
    const antwoord = await mcpAanroep(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    tools = antwoord.result?.tools;
    if (!Array.isArray(tools)) throw new Error(`geen tools-lijst in het antwoord: ${JSON.stringify(antwoord).slice(0, 200)}`);
  } catch (e) {
    console.log(`NIET_GEMETEN: kon geen tools-lijst krijgen van "${commando} ${args.join(" ")}". Fout: ${e.message}`);
    if (fout) console.log(`stderr van de agent:\n${fout.slice(0, 500)}`);
    process.exitCode = 1;
    proc.kill();
    return;
  }
  proc.kill();

  console.log(`\nmuraqib-agent-watch -- ${tools.length} tool(s) gevonden bij "${commando} ${args.join(" ")}"\n`);
  for (const tool of tools) {
    const categorieen = vindCategorieen(tool);
    const begrensd = heeftBegrenzing(tool);
    console.log(`[${tool.name}]`);
    if (categorieen.length === 0) {
      console.log("  geen van de bekende risicocategorieen gevonden (geld/bestanden/extern/vernietigend/identiteit)");
    } else {
      console.log(`  categorieen: ${categorieen.join(", ")}`);
      console.log(`  ${begrensd ? "noemt zelf een begrenzing (check zelf of die ook echt klopt)" : "GEEN zichtbare begrenzing genoemd in de beschrijving -- zelf nakijken"}`);
    }
    console.log("");
  }

  const zonderBegrenzing = tools.filter((t) => vindCategorieen(t).length > 0 && !heeftBegrenzing(t));
  console.log(`Samenvatting: ${tools.length} tools, ${zonderBegrenzing.length} met een risicocategorie zonder zichtbare begrenzing.`);
  if (zonderBegrenzing.length > 0) {
    console.log(`Kijk deze als eerste na: ${zonderBegrenzing.map((t) => t.name).join(", ")}`);
  }
}

main().catch((e) => {
  console.error("Onverwachte fout:", e);
  process.exitCode = 1;
});
