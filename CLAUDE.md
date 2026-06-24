# androir-mcp

adb/uiautomator-backed Android automation MCP. Android counterpart to mirroir,
same tool surface so one agent drives both OSes.

## Scope
General-purpose Android UI automation over adb: screen reading, input, launching
apps, and replayable automation flows. Usable by anyone on devices they control.
The project does not ship anti-detection, account-farming, or proxy/SIM-rotation
features — keep contributions focused on general device automation. Use
responsibly and follow the terms of the apps you automate.

## Conventions
- Node + TypeScript, @modelcontextprotocol/sdk, stdio transport.
- Shell adb via child_process with an argv array — NEVER a shell string.
- Validate every serial (charset [A-Za-z0-9.:_-], len <= 128) and escape every
  interpolated value before it reaches adb.
- Keep files focused; one tool group per module.
- Per-call timeout with process-group kill.

## Security
- Public repo: NEVER commit secrets, .env, tokens, keys. A pre-push secret scan
  blocks this; do not bypass it.
- No secrets or PII in logs or tool output. Concise errors, no stack traces to
  the model.
