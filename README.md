# muraqib-agent-watch

Free, instant capability check for any [MCP](https://modelcontextprotocol.io) server. No account, no signup, runs on your own machine.

It starts the server, asks it what tools it exposes (the standard MCP `tools/list` call), and checks each tool's name, description and input schema against five capability categories:

- **money** — amounts, payments, transfers, balances, wallets
- **files** — paths, writes, deletes, directories
- **outbound** — URLs, HTTP calls, email, webhooks, recipients
- **destructive** — delete, remove, revoke, cancel, terminate
- **credentials** — keys, secrets, tokens, signatures

For every tool that touches one of these, it checks whether the tool's own description already states a safeguard (validation, scope, a limit, read-only, etc.). If it doesn't, that tool gets flagged as worth a manual look before you let an agent use it unsupervised.

## What this is not

This is a capability inventory, not a security audit. It tells you *what an agent's tools claim to be able to do*, based on keyword matching against names, descriptions and schemas. It never calls any of the server's tools, does not prove a stated safeguard actually works, and will miss anything not reflected in the tool's own text. Treat a clean report as "nothing obvious to flag," not as a guarantee.

## Usage

This is not published on npm yet. Until it is, run it straight from GitHub. It needs Node.js 20 or newer and git:

```
npx -y github:holistis/muraqib-agent-watch <command> [args...]
```

Examples:

```
npx -y github:holistis/muraqib-agent-watch npx -y some-mcp-server
npx -y github:holistis/muraqib-agent-watch node dist/index.js
```

The command is whatever you'd normally run to start that MCP server over stdio. It works on Windows (Node.js 24) and on Linux (Node.js 18 prints an engine warning but runs).

Important: this starts that command on your machine, because starting the server is the only way to ask it for its tool list. It never calls the server's tools, but the server's own code does run. Only point it at servers you would be willing to run anyway, or run it inside a throwaway machine or container.

## Example output

This is the real output for the deliberately unsafe test server in `src/test-fake-unsafe-server.mjs` (path shortened). The output is currently in Dutch: geld = money, bestanden = files, extern = outbound, vernietigend = destructive, identiteit = credentials.

```
muraqib-agent-watch -- 2 tool(s) gevonden bij "node src/test-fake-unsafe-server.mjs"

[send_payment]
  categorieen: geld, extern
  GEEN zichtbare begrenzing genoemd in de beschrijving -- zelf nakijken

[delete_file]
  categorieen: bestanden, vernietigend
  GEEN zichtbare begrenzing genoemd in de beschrijving -- zelf nakijken

Samenvatting: 2 tools, 2 met een risicocategorie zonder zichtbare begrenzing.
Kijk deze als eerste na: send_payment, delete_file
```

## Status

First, small version. Built to be the free entry point into a larger, paid, continuous version (watches a deployed agent over time, not just once, and opens a fix instead of just an alert) — the same relationship [muraqib](https://github.com/holistis/muraqib) has to its own nightly test-watching.

MIT licensed.
