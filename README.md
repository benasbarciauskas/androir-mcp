# androir-mcp

Android automation MCP server — the Android counterpart to
[mirroir-mcp](https://github.com/jfarcand/mirroir-mcp). Exposes the same tool
surface (`screenshot`, `describe_screen`, `tap`, `swipe`, `type_text`,
`launch_app`, …) so one AI agent loop drives **both** iOS (via mirroir) and
Android (via this) unchanged — only the attached MCP differs.

Backed entirely by `adb` + `uiautomator`. No native code, no device-side app.
On Android `describe_screen` returns the real UI tree (exact element bounds +
text) — more reliable than OCR.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full tool surface and design.

## Requirements
- `adb` (Android platform-tools) on PATH.
- A connected Android device with USB debugging, or an emulator.

## Usage
```jsonc
{ "mcpServers": { "androir": { "command": "node", "args": ["/path/to/androir-mcp/dist/index.js"] } } }
```

## Responsible use
Use androir-mcp on devices and accounts you are authorized to control, and
follow the terms of the apps you automate.

## License
Apache-2.0. Tool names mirror mirroir-mcp (Apache-2.0) for agent symmetry;
independent adb-backed implementation.
