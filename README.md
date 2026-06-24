# androir-mcp

An MCP server for automating real Android devices over `adb` and `uiautomator`.
Screenshot the screen, read the on-screen UI tree, tap/swipe/type, and launch
apps — from any MCP client.

Backed entirely by `adb` + `uiautomator`. No native code, no device-side app.
`describe_screen` returns the real UI tree (exact element bounds + text), which
is far more reliable than OCR. The tool set is a conventional screen-read +
input surface, so it drops into any MCP-based agent loop.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full tool surface and design.

## Requirements
- `adb` (Android platform-tools) on PATH.
- A connected Android device with USB debugging, or an emulator.

## Usage
```jsonc
{ "mcpServers": { "androir": { "command": "node", "args": ["/path/to/androir-mcp/dist/index.js"] } } }
```

## Scope
Personal control of **your own** Android devices. Not for anti-detection,
evasion, proxy/SIM rotation, or multi-account farm orchestration. See CLAUDE.md.

## License
Apache-2.0.
