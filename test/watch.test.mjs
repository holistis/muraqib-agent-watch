// Tests van muraqib-agent-watch. Geen afhankelijkheden: node --test test/
// Elke test start de echte CLI (src/watch.mjs) tegen een nep-MCP-server, zoals een gebruiker dat doet.
// Het wezenlijke: een echt onveilig geval MOET gevlagd worden (een controle die nooit rood is geweest is niet getest),
// een geval met een genoemde begrenzing mag niet gevlagd worden, en een tool zonder risico wordt niet beschuldigd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const WACHT = join(HIER, "..", "src", "watch.mjs");
const ONVEILIG = join(HIER, "..", "src", "test-fake-unsafe-server.mjs");
const VEILIG = join(HIER, "fixtures", "fake-safe-server.mjs");
const run = (...args) => spawnSync(process.execPath, [WACHT, ...args], { encoding: "utf8", timeout: 60000 });

test("geplante fout: de onveilige nepserver wordt gevlagd (geldtool en verwijdertool zonder begrenzing)", () => {
  const r = run(process.execPath, ONVEILIG);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[send_payment\]\s+categories: money, outbound\s+NO stated safeguard/);
  assert.match(r.stdout, /\[delete_file\]\s+categories: files, destructive\s+NO stated safeguard/);
  assert.match(r.stdout, /Summary: 2 tools, 2 with a risk category and no stated safeguard\./);
  assert.match(r.stdout, /Check these first: send_payment, delete_file/);
});

test("controle: een geldtool die zelf een begrenzing noemt wordt niet gevlagd", () => {
  const r = run(process.execPath, VEILIG);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[send_payment\]\s+categories: money, outbound\s+states its own safeguard/);
  assert.match(r.stdout, /Summary: 2 tools, 0 with a risk category and no stated safeguard\./);
  assert.doesNotMatch(r.stdout, /Check these first/);
});

test("regressie 23 oktober: een $schema-verwijzing naar http maakt van een onschuldige tool geen externe tool", () => {
  const r = run(process.execPath, VEILIG);
  assert.match(r.stdout, /\[echo\]\s+none of the known risk categories found/);
});

test("de uitvoer is Nederlands met --lang=nl", () => {
  const r = run("--lang=nl", process.execPath, ONVEILIG);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /categorieen: geld, extern/);
  assert.match(r.stdout, /Samenvatting: 2 tools, 2 met een risicocategorie zonder zichtbare begrenzing\./);
});

test("zonder argumenten: gebruik tonen en afsluiten met code 2", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Usage: node src\/watch\.mjs <command>/);
});

test("--help toont het gebruik en start geen server (voorheen NOT_MEASURED)", () => {
  for (const vlag of ["--help", "-h"]) {
    const r = run(vlag);
    assert.equal(r.status, 0, vlag);
    assert.match(r.stdout, /Usage: node src\/watch\.mjs <command>/, vlag);
    assert.doesNotMatch(r.stdout, /NOT_MEASURED/, vlag);
  }
});

test("--version toont het versienummer uit package.json", () => {
  const versie = JSON.parse(readFileSync(join(HIER, "..", "package.json"), "utf8")).version;
  for (const vlag of ["--version", "-v"]) {
    const r = run(vlag);
    assert.equal(r.status, 0, vlag);
    assert.equal(r.stdout.trim(), versie, vlag);
  }
});

test("een commando dat geen MCP spreekt geeft NOT_MEASURED en code 1, nooit een stil 'alles goed'", () => {
  const r = run(process.execPath, "-e", "console.log('geen json')");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^NOT_MEASURED: could not get a tool list/);
});

// Bekende grens, vastgelegd in plaats van weggestopt: de begrenzing wordt gevonden op trefwoorden in de beschrijving.
// Een beschrijving die het woord ontkent ("does not validate") telt toch als "noemt zelf een begrenzing".
// De README zegt daarom "check it actually holds". Zakt deze test, dan is de grens opgeheven: werk de README bij.
test("bekende grens: een ontkende begrenzing telt als genoemde begrenzing (trefwoordmatch, geen begrip)", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "maw-"));
  const server = join(dir, "ontkent.mjs");
  writeFileSync(server, `
import { createInterface } from "node:readline";
createInterface({ input: process.stdin }).on("line", (l) => {
  const b = JSON.parse(l);
  if (b.method === "initialize") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: b.id, result: { protocolVersion: "2026-06-18", capabilities: { tools: {} }, serverInfo: { name: "x", version: "0" } } }) + "\\n");
  else if (b.method === "tools/list") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: b.id, result: { tools: [{ name: "send_payment", description: "Sends money. Does not validate the recipient and has no limit.", inputSchema: { type: "object", properties: { amount: { type: "string" } } } }] } }) + "\\n");
});
`);
  try {
    const r = run(process.execPath, server);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /states its own safeguard/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
