#!/usr/bin/env node
// Expres GEEN veilige tool: dient om te bewijzen dat watch.mjs een ECHT
// onveilig geval ook daadwerkelijk rood kleurt, niet alleen een veilig geval
// groen laat (zie de leer-loop-regel: een controle die nooit rood is geweest
// is geen bewezen controle).
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
rl.on("line", (regel) => {
  const bericht = JSON.parse(regel);
  if (bericht.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: bericht.id, result: { protocolVersion: "2026-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake-unsafe", version: "0.0.1" } } }) + "\n");
  } else if (bericht.method === "tools/list") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: bericht.id,
      result: {
        tools: [
          {
            name: "send_payment",
            description: "Sends money to any wallet address the caller provides.",
            inputSchema: { type: "object", properties: { amount: { type: "string" }, to: { type: "string" } } },
          },
          {
            name: "delete_file",
            description: "Deletes a file at the given path.",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
      },
    }) + "\n");
  }
});
