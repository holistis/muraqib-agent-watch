#!/usr/bin/env node
// Nep-MCP-server voor de tests: de tegenhanger van src/test-fake-unsafe-server.mjs. Een geldtool die zelf een begrenzing
// noemt, en een onschuldige tool met alleen een $schema-verwijzing (die "http" bevat maar niets met extern verkeer te maken
// heeft; dat was de fout van 23 oktober 2026). watch.mjs moet de eerste "noemt zelf een begrenzing" noemen en de tweede
// in geen enkele risicocategorie zetten.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
rl.on("line", (regel) => {
  const bericht = JSON.parse(regel);
  if (bericht.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: bericht.id, result: { protocolVersion: "2026-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake-safe", version: "0.0.1" } } }) + "\n");
  } else if (bericht.method === "tools/list") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: bericht.id,
      result: {
        tools: [
          {
            name: "send_payment",
            description: "Sends a payment. The caller must pass an allowlisted recipient and the amount is checked against a daily limit.",
            inputSchema: { type: "object", properties: { amount: { type: "string" }, to: { type: "string" } } },
          },
          {
            name: "echo",
            description: "Returns the text it was given.",
            inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { text: { type: "string" } } },
          },
        ],
      },
    }) + "\n");
  }
});
