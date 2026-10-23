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

This is a capability inventory, not a security audit. It tells you *what an agent's tools claim to be able to do*, based on keyword matching against names, descriptions and schemas — it does not execute anything, does not prove a stated safeguard actually works, and will miss anything not reflected in the tool's own text. Treat a clean report as "nothing obvious to flag," not as a guarantee.

## Usage

```
npx muraqib-agent-watch <command> [args...]
```

Examples:

```
npx muraqib-agent-watch npx -y some-mcp-server
npx muraqib-agent-watch node dist/index.js
```

The command is whatever you'd normally run to start that MCP server over stdio.

## Example output

```
muraqib-agent-watch -- 3 tool(s) found at "node dist/index.js"

[record_delivery]
  categories: money, outbound, credentials
  states its own safeguard (check it actually holds)

[get_delivery_history]
  categories: money, files, outbound, credentials
  NO stated safeguard -- review this one yourself

Summary: 3 tools, 1 with a risk category and no stated safeguard.
Check these first: get_delivery_history
```

## Status

First, small version. Built to be the free entry point into a larger, paid, continuous version (watches a deployed agent over time, not just once, and opens a fix instead of just an alert) — the same relationship [muraqib](https://github.com/holistis/muraqib) has to its own nightly test-watching.

MIT licensed.
