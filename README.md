<a id="readme-top"></a>

<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="androir-mcp logo">

# androir-mcp

**Drive real Android devices from any AI agent — see the screen, tap, swipe, type, over `adb`.**

An independent, standalone [Model Context Protocol](https://modelcontextprotocol.io) server
that gives an AI agent a clean, safe automation surface for physical Android
devices and emulators: capture the screen, read the live UI tree, and drive
input — backed entirely by `adb` + `uiautomator`, no native code and no
device-side app.

[![CI](https://github.com/benasbarciauskas/androir-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/benasbarciauskas/androir-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF?style=flat-square)](https://modelcontextprotocol.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/benasbarciauskas/androir-mcp/pulls)
[![Stars](https://img.shields.io/github/stars/benasbarciauskas/androir-mcp?style=flat-square)](https://github.com/benasbarciauskas/androir-mcp/stargazers)

</div>

> [!NOTE]
> Requires `adb` (Android platform-tools) and an Android device with USB
> debugging enabled (or an emulator). The server runs **locally**, holds **no
> credentials**, and talks only to the device(s) `adb` already sees.

## ✨ What is androir-mcp?

`androir-mcp` is a standalone MCP server for automating Android over `adb`. It
is its own project — not a copy or port of anything — exposing a small,
conventional screen-read + input tool set that drops into any MCP-based agent
loop.

Everything is backed by `adb` and `uiautomator`: there is no native code and
nothing to install on the device. The agent shells out to `adb` (always as an
argv array — never a shell string) to capture screenshots, dump the UI
hierarchy, and send input events.

The key advantage on Android is that `describe_screen` returns the **real UI
tree** — exact element bounds and text straight from `uiautomator` — rather
than guessing from OCR. Tap coordinates come back as element centers and feed
straight into `tap`, so an agent can read a screen and act on it deterministically.

<p align="right"><a href="#readme-top">back to top ↑</a></p>

## 🚀 Features

- 📸 **`screenshot`** — capture the device screen as a PNG (signature-validated).
- 🌳 **`describe_screen`** — parse the `uiautomator` UI tree into a flat list of
  labels with center tap coordinates (text / content-desc / class, entity-decoded).
- 👆 **`tap` / `swipe` / `long_press`** — coordinate input in device pixels.
- ⌨️ **`type_text`** — type arbitrary text safely (spaces, metacharacters, and
  unicode all type verbatim).
- 🔘 **`press_key` / `press_home` / `press_back`** — named key events.
- 📱 **`launch_app`** — launch by package name or a friendly name (resolved from
  the installed package list, cached per device).
- 🔗 **`open_url`** — open an `http(s)` URL in the default browser.
- 🔎 **`list_targets` / `status`** — enumerate connected devices and read
  device state, properties, and battery.

**Safety by construction:**

- 🛡️ **argv-only adb** — every command is an argument array, never a shell
  string, and any value handed to the *device* shell is single-quoted for it,
  so there is no shell-injection surface.
- ✅ **strict serial validation** — serials are checked against
  `[A-Za-z0-9.:_-]` (≤ 128 chars) before reaching any subprocess.
- ⏱️ **per-call timeout** (default 30 s) with process-group kill on timeout.
- 🤫 **scrubbed errors** — concise messages only; no raw `adb` stderr (which can
  leak serials/paths) and no host stack traces reach the model.

<p align="right"><a href="#readme-top">back to top ↑</a></p>

## 🛠️ Tools

| Tool | adb implementation | Returns |
|---|---|---|
| `list_targets` | `adb devices -l` | serials + model + state |
| `status` | `adb -s S get-state` (+ props, battery) | device/offline/unauthorized + info |
| `screenshot` | `adb -s S exec-out screencap -p` | PNG image content |
| `describe_screen` | `adb -s S exec-out uiautomator dump /dev/tty` (fallback: dump to `/sdcard` then `exec-out cat`) → parse XML | element list: label / center tap (x,y) |
| `tap` (x,y) | `adb -s S shell input tap X Y` | confirmation |
| `swipe` (x1,y1,x2,y2,dur_ms?) | `adb -s S shell input swipe X1 Y1 X2 Y2 DUR` | confirmation |
| `long_press` (x,y,dur_ms?) | `input swipe X Y X Y DUR` (same point) | confirmation |
| `type_text` (text) | `adb -s S shell input text '<quoted>'` (space→`%s`, single-quoted for the device shell) | confirmation |
| `press_key` (key) | `adb -s S shell input keyevent <KEYCODE>` — names: home→3, back→4, enter→66, recents→187 | confirmation |
| `press_home` | `input keyevent 3` | confirmation |
| `press_back` | `input keyevent 4` | confirmation |
| `launch_app` (name or pkg) | resolve name→package (from `pm list packages`), then `monkey -p PKG -c android.intent.category.LAUNCHER 1` | confirmation |
| `open_url` (url) | `am start -a android.intent.action.VIEW -d '<url>'` (http/https only) | confirmation |

All tools take an optional `serial`; it defaults to the single connected device
and errors if the choice is ambiguous. Coordinates are in device pixels, so
`describe_screen` tap points feed straight into `tap` with no translation.

<p align="right"><a href="#readme-top">back to top ↑</a></p>

## 🏁 Getting started

### Prerequisites

- **`adb`** (Android platform-tools) on your `PATH`.
- An **Android device with USB debugging** enabled, or a running emulator.
  Confirm it's visible:

  ```bash
  adb devices
  ```

### Build

```bash
npm install
npm run build
```

### Attach to an MCP client

Add the built server to your MCP client config:

```jsonc
{
  "mcpServers": {
    "androir": {
      "command": "node",
      "args": ["/path/to/androir-mcp/dist/index.js"]
    }
  }
}
```

### Verify

With a device connected, run the self-check (it lists targets, takes a
screenshot, and dumps the UI tree):

```bash
npm run selfcheck
```

It prints `PASS` when the three core tools work end-to-end against a real device.

<p align="right"><a href="#readme-top">back to top ↑</a></p>

## 🤖 Use with an AI agent

Once `androir` is attached to your MCP client, give the agent a goal and let it
read the screen and act:

> **You:** Open the Settings app, go to Wi-Fi, and tell me which network is connected.
>
> **Agent:** calls `launch_app("settings")` → `describe_screen()` (reads the
> labels + tap coordinates) → `tap(x, y)` on "Wi-Fi" → `describe_screen()`
> again → reports the connected network.

Because `describe_screen` returns exact element bounds and text, the agent taps
real coordinates rather than guessing from a screenshot.

<p align="right"><a href="#readme-top">back to top ↑</a></p>

## 🗺️ Status & roadmap

- [x] Core tools — `screenshot`, `describe_screen`, `tap`, `swipe`,
  `long_press`, `type_text`, `press_key`/`home`/`back`, `launch_app`,
  `open_url`, `list_targets`, `status`
- [x] `uiautomator` XML parsing → labels + center tap coordinates (entity-decoded, malformed-XML tolerant)
- [x] Device-shell-safe input escaping (no shell injection) + strict serial validation
- [x] Unit tests for the XML parser and the input-escaping logic
- [x] Pre-push secret-scan hook
- [ ] Recording / replay skills
- [ ] Multi-device parallel control
- [ ] Emulator-specific paths
- [ ] Published npm package / `npx` bin

This README and roadmap fill in as the project progresses.

<p align="right"><a href="#readme-top">back to top ↑</a></p>


## 📄 License

[Apache-2.0](LICENSE).

<p align="right"><a href="#readme-top">back to top ↑</a></p>
