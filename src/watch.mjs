#!/usr/bin/env node
// muraqib-agent-watch: eerste, kleinste versie. Geen oordeel "dit is veilig/
// onveilig" -- gewoon eerlijk uitlezen wat een MCP-agent MAG doen, per categorie,
// en zeggen of de tool zelf al een begrenzing noemt of niet. De mens beslist.
//
// Gebruik: node src/watch.mjs <commando> [argumenten...]
//   node src/watch.mjs npx capacity-attest
//   node src/watch.mjs node dist/index.js
import { spawn } from "node:child_process";

// Taal van de uitvoer: Engels is de standaard (de README is Engels). Nederlands kan met
// --lang=nl (als eerste argument) of MURAQIB_LANG=nl. De interne categoriesleutels blijven
// Nederlands, de zichtbare namen komen uit TEKST hieronder.
const TEKST = {
  en: {
    cats: { geld: "money", bestanden: "files", extern: "outbound", vernietigend: "destructive", identiteit: "credentials" },
    usage: ["Usage: node src/watch.mjs <command> [arguments...]", "Example: node src/watch.mjs npx capacity-attest"],
    notMeasured: (cmd, msg) => `NOT_MEASURED: could not get a tool list from "${cmd}". Error: ${msg}`,
    stderrOfAgent: "stderr of the server:",
    found: (n, cmd) => `\nmuraqib-agent-watch -- ${n} tool(s) found at "${cmd}"\n`,
    noCategory: "  none of the known risk categories found (money/files/outbound/destructive/credentials)",
    categories: "  categories: ",
    stated: "  states its own safeguard (check it actually holds)",
    notStated: "  NO stated safeguard -- review this one yourself",
    summary: (n, k) => `Summary: ${n} tools, ${k} with a risk category and no stated safeguard.`,
    checkFirst: "Check these first: ",
    noAnswer: (m) => `no answer within 30s to ${m}`,
    invalid: (m, e) => `invalid answer to ${m}: ${e}`,
    noToolList: (a) => `no tool list in the answer: ${a}`,
    unexpected: "Unexpected error:",
  },
  nl: {
    cats: { geld: "geld", bestanden: "bestanden", extern: "extern", vernietigend: "vernietigend", identiteit: "identiteit" },
    usage: ["Gebruik: node src/watch.mjs <commando> [argumenten...]", "Voorbeeld: node src/watch.mjs npx capacity-attest"],
    notMeasured: (cmd, msg) => `NIET_GEMETEN: kon geen tools-lijst krijgen van "${cmd}". Fout: ${msg}`,
    stderrOfAgent: "stderr van de agent:",
    found: (n, cmd) => `\nmuraqib-agent-watch -- ${n} tool(s) gevonden bij "${cmd}"\n`,
    noCategory: "  geen van de bekende risicocategorieen gevonden (geld/bestanden/extern/vernietigend/identiteit)",
    categories: "  categorieen: ",
    stated: "  noemt zelf een begrenzing (check zelf of die ook echt klopt)",
    notStated: "  GEEN zichtbare begrenzing genoemd in de beschrijving -- zelf nakijken",
    summary: (n, k) => `Samenvatting: ${n} tools, ${k} met een risicocategorie zonder zichtbare begrenzing.`,
    checkFirst: "Kijk deze als eerste na: ",
    noAnswer: (m) => `geen antwoord binnen 30s op ${m}`,
    invalid: (m, e) => `ongeldig antwoord op ${m}: ${e}`,
    noToolList: (a) => `geen tools-lijst in het antwoord: ${a}`,
    unexpected: "Onverwachte fout:",
  },
};
let LANG = process.env.MURAQIB_LANG === "nl" ? "nl" : "en";
{
  const eerste = process.argv[2];
  if (eerste && eerste.startsWith("--lang=")) {
    LANG = eerste.slice("--lang=".length) === "nl" ? "nl" : "en";
    process.argv.splice(2, 1);
  }
}
const T = TEKST[LANG];

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
    const timer = setTimeout(() => reject(new Error(T.noAnswer(bericht.method))), 30000);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const regel = buffer.indexOf("\n");
      if (regel === -1) return;
      clearTimeout(timer);
      proc.stdout.off("data", onData);
      try {
        resolve(JSON.parse(buffer.slice(0, regel)));
      } catch (e) {
        reject(new Error(T.invalid(bericht.method, e.message)));
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(bericht) + "\n");
  });
}

async function main() {
  const [commando, ...args] = process.argv.slice(2);
  if (!commando) {
    for (const regel of T.usage) console.log(regel);
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
    await mcpAanroep(proc, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-06-18", capabilities: {}, clientInfo: { name: "muraqib-agent-watch", version: "0.2.0" } } });
    const antwoord = await mcpAanroep(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    tools = antwoord.result?.tools;
    if (!Array.isArray(tools)) throw new Error(T.noToolList(JSON.stringify(antwoord).slice(0, 200)));
  } catch (e) {
    console.log(T.notMeasured(`${commando} ${args.join(" ")}`, e.message));
    if (fout) console.log(`${T.stderrOfAgent}\n${fout.slice(0, 500)}`);
    process.exitCode = 1;
    proc.kill();
    return;
  }
  proc.kill();

  console.log(T.found(tools.length, `${commando} ${args.join(" ")}`));
  for (const tool of tools) {
    const categorieen = vindCategorieen(tool);
    const begrensd = heeftBegrenzing(tool);
    console.log(`[${tool.name}]`);
    if (categorieen.length === 0) {
      console.log(T.noCategory);
    } else {
      console.log(`${T.categories}${categorieen.map((c) => T.cats[c]).join(", ")}`);
      console.log(begrensd ? T.stated : T.notStated);
    }
    console.log("");
  }

  const zonderBegrenzing = tools.filter((t) => vindCategorieen(t).length > 0 && !heeftBegrenzing(t));
  console.log(T.summary(tools.length, zonderBegrenzing.length));
  if (zonderBegrenzing.length > 0) {
    console.log(`${T.checkFirst}${zonderBegrenzing.map((t) => t.name).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(T.unexpected, e);
  process.exitCode = 1;
});
