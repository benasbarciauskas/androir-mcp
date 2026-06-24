# androir-mcp — Android automation MCP

Date: 2026-06-24
Status: Approved design

## Purpose

An MCP server that gives any AI agent a clean automation surface for real
Android devices: capture the screen, read the on-screen UI tree, drive input
(tap/swipe/type), and launch apps. Backed entirely by `adb` + `uiautomator` —
no native code, no device-side app. The tool set is a conventional screen-read
+ input surface, so it drops into any MCP-based agent loop.

## Scope guardrail (inherited from PhoneHub)

Single owner, the owner's own devices. Build device control + screen reading +
replayable personal automation. Do NOT add anti-detection, humanization-for-
evasion, proxy/SIM rotation, or multi-account farm orchestration. If a tool
request drifts there, refuse.

## Where it lives

A standalone Node package and its own repo (`androir-mcp`), distributable on
its own.

## Language / deps

- Node + TypeScript, `@modelcontextprotocol/sdk` (official), stdio transport.
- No runtime deps beyond the SDK; shells `adb` via `child_process` (argv array,
  never a shell string).
- Distributable via `node androir/dist/index.js` or an `npx`-style bin. claude
  attaches it through an MCP config entry.

## Tool surface

All tools take an optional `serial` (defaults to the single connected device;
errors if ambiguous). Serial is validated against a strict charset
(`[A-Za-z0-9.:_-]`, len ≤ 128) before reaching any subprocess.

| Tool | adb implementation | Returns |
|---|---|---|
| `list_targets` | `adb devices -l` | serials + model + state |
| `status` | `adb -s S get-state` | device/offline/unauthorized |
| `screenshot` | `adb -s S exec-out screencap -p` | PNG image content |
| `describe_screen` | `adb -s S exec-out uiautomator dump /dev/tty` (fallback: dump to `/sdcard` then `exec-out cat`) → parse XML | element list: text / content-desc / class / center tap (x,y) / bounds; plus optional screenshot |
| `tap` (x,y) | `adb -s S shell input tap X Y` | confirmation |
| `swipe` (x1,y1,x2,y2,dur_ms?) | `adb -s S shell input swipe X1 Y1 X2 Y2 DUR` | confirmation |
| `long_press` (x,y,dur_ms?) | `input swipe X Y X Y DUR` (same point) | confirmation |
| `type_text` (text) | `adb -s S shell input text '<escaped>'` (space→%s, escape shell metachars; for unicode fall back to per-char or an IME broadcast if needed) | confirmation |
| `press_key` (key) | `adb -s S shell input keyevent <KEYCODE>` — map names (home→3, back→4, enter→66, recents→187) | confirmation |
| `press_home` | `input keyevent 3` | confirmation |
| `press_back` | `input keyevent 4` | confirmation |
| `launch_app` (name or pkg) | resolve name→package (cache from `pm list packages` + label lookup; accept explicit `pkg`), then `monkey -p PKG -c android.intent.category.LAUNCHER 1` | confirmation |
| `open_url` (url) | `am start -a android.intent.action.VIEW -d '<url>'` | confirmation |

Coordinate system: device pixels (uiautomator bounds + `input` are both in
device px), so `describe_screen` tap coords feed straight into `tap`. Document
this; no point-vs-pixel translation is needed.

### describe_screen detail

`uiautomator dump` yields XML with `bounds="[x1,y1][x2,y2]"`, `text`,
`content-desc`, `class`, `clickable`, `package`. Parse to a flat list, compute
each node's center `((x1+x2)/2, (y1+y2)/2)` as its tap point, keep only nodes
with text/desc or `clickable=true` (drop pure layout containers), and emit a
compact text listing of the form `"<label>" at (x,y)`. This is more reliable
than OCR — exact bounds, real text.

## Boundaries / validation

- Every serial + every interpolated value validated/escaped before `adb`.
- Any string handed to the DEVICE shell (`input text`, `am start -d`) is
  single-quoted for `/system/bin/sh` (`'` → `'\''`) so no shell metacharacter
  can break out. `input text` spaces are sent as the `%s` sentinel inside the
  quotes; a literal `%s` substring is the one input that cannot be typed
  verbatim (it becomes a space) — a property of `input text` itself.
- `describe_screen` XML-decodes the five named entities and numeric
  (`&#NN;` / `&#xNN;`) references in `text`/`content-desc`. Node/attribute
  extraction is tolerant: a literal `>` inside an attribute does not truncate
  a tag, malformed/truncated XML never throws (whatever valid nodes were found
  are returned), and nodes without parseable `bounds` are skipped.
- `open_url` enforces a scheme allowlist: only `http://` and `https://` are
  accepted; every other scheme (`file:`, `intent:`, `content:`, `tel:`, …) is
  rejected at the boundary so a caller cannot fire arbitrary intents.
- Coordinate tools (`tap`/`swipe`/`long_press`) validate x/y/duration as
  non-negative integers.
- `adb` resolved on PATH (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`) —
  GUI-launched agents don't inherit a login PATH. Surface a clear "adb not
  found" error.
- Per-call timeout (default 30s) with process-group kill on timeout; the
  timeout/close/error paths use a single-settle guard so the promise can't
  double-settle, and the spawn-error path also reaps the process group.
- No secrets logged. Raw adb stderr (which can leak serials/device paths) is
  mapped to concise, scrubbed messages ("device offline", "device
  unauthorized", "adb command failed: …") — never raw stderr or host stack
  traces to the model. Package-name resolution caches `pm list packages` per
  serial (5-min TTL) so device B never resolves names against device A.

## Testing

A `demo`/self-check (`npm run selfcheck`) that, with
one Android connected:
1. `list_targets` returns ≥1 device.
2. `screenshot` returns non-empty PNG bytes.
3. `describe_screen` returns ≥1 element with a valid center within screen
   bounds.
4. XML-parse unit test on a captured `uiautomator` sample (offline, no device)
   asserting bounds→center math and label extraction.

The XML parser is the one piece of real logic — it gets a device-free unit test
with a fixture. adb-shelling tools are thin and verified by the live self-check.

## Out of scope (v1)

- Recording/replay skills (add later if needed).
- Multi-device parallel control (one serial per call).
- Emulator-specific paths.
