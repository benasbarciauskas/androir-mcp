# Contributing to androir-mcp

Thanks for your interest in improving `androir-mcp`. This guide covers how to
set up, build, test, and submit changes.

## Prerequisites

- **Node.js** ≥ 18 (the project builds and tests on Node 20 in CI).
- **`adb`** (Android platform-tools) on your `PATH` — needed to run the server
  against a real device or emulator. Most unit tests run without a device, but
  the self-check (`npm run selfcheck`) needs one.
- An **Android device with USB debugging** enabled, or a running emulator, if
  you want to exercise the tools end-to-end. Confirm it's visible:

  ```bash
  adb devices
  ```

## Setup

```bash
git clone https://github.com/benasbarciauskas/androir-mcp.git
cd androir-mcp
npm install
```

## Build & test

```bash
npm run build   # tsc → dist/
npm test        # node --test (unit tests)
```

With a device connected, you can run the end-to-end self-check:

```bash
npm run selfcheck   # lists targets, screenshots, dumps the UI tree → prints PASS
```

Always run `npm run build && npm test` before opening a PR — CI runs the same
two commands on every pull request and on pushes to `main`.

## Branch & PR flow

- Branch from `main` using `<type>/<slug>`, where `type` is one of
  `feat | fix | chore | refactor | docs` (e.g. `feat/scroll-tool`).
- Keep changes focused — don't reorganize unrelated files in the same PR.
- Open a pull request against `main`. Fill in the PR template (summary, what
  changed, testing done, checklist).
- `main` is protected: PRs require green CI before merge, and merges are
  squash-only.

## Code conventions

These are enforced by the project's design — please follow them:

- **argv-only `adb`.** Always invoke `adb` with an argument array via
  `child_process`, **never** a shell string. There is no shell-injection
  surface, and PRs must not introduce one.
- **Escape interpolated values.** Anything handed to the *device* shell (e.g.
  text passed to `input text`) is single-quoted for that shell. Don't bypass it.
- **Validate serials at the boundary.** Device serials are checked against
  `[A-Za-z0-9.:_-]` (≤ 128 chars) before reaching any subprocess. New code that
  accepts a serial must validate it the same way.
- **No secrets.** Never commit `.env` files, tokens, keys, or credentials. A
  pre-push hook scans the pushed range and rejects credential patterns
  (reporting filenames only, never values). Do not `--no-verify` around it.
- **No secrets or PII in logs or tool output.** Keep errors concise; don't leak
  raw `adb` stderr or host stack traces to the model.
- **Per-call timeout.** Subprocess calls run under a timeout with a
  process-group kill — keep that intact for new commands.
- Keep modules focused (one tool group per module) and files reasonably small.

## Tests

- Unit tests live in `tests/` and run with `node --test`.
- New parsing or escaping logic should come with tests — the XML parser and the
  input-escaping logic are already covered; follow those as a model.

By contributing, you agree your contributions are licensed under the project's
[Apache-2.0](LICENSE) license.
