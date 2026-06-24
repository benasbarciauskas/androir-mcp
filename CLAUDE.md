# androir-mcp

An adb/uiautomator-backed MCP server for automating real Android devices:
screen reading, input (tap/swipe/type), and app launching from any MCP client.

## Scope guardrail (enforced)
Single owner, the owner's own Android devices. Build screen reading + input +
launching + replayable personal automation. Do NOT build anti-detection /
evasion / "humanization-for-avoidance", proxy/SIM rotation, or multi-account
farm orchestration aimed at evading platform integrity systems. If a request
drifts there, stop and surface it.

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
