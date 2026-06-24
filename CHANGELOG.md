# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-24

### Added

- Initial release of the `androir-mcp` Model Context Protocol server for driving
  Android devices over `adb` + `uiautomator`.
- Tools: `screenshot`, `describe_screen`, `tap`, `swipe`, `long_press`,
  `type_text`, `press_key`, `press_home`, `press_back`, `launch_app`,
  `open_url`, `list_targets`, and `status`.
- `uiautomator` UI-tree parsing: the `uiautomator` XML hierarchy is parsed into a
  flat list of labels with center tap coordinates (entity-decoded, tolerant of
  malformed XML).
- Device-shell-safe input escaping: values handed to the device shell are
  single-quoted and `adb` is always invoked as an argv array (no shell-injection
  surface).
- Strict serial validation (`[A-Za-z0-9.:_-]`, ≤ 128 chars) at the boundary, and
  per-call timeouts with process-group kill.
- Pre-push secret scan hook that rejects credential patterns in the pushed range.
- Unit tests for the XML parser and the input-escaping logic.

[Unreleased]: https://github.com/benasbarciauskas/androir-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/benasbarciauskas/androir-mcp/releases/tag/v0.1.0
