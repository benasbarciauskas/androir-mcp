# Security

androir-mcp drives the owner's own Android devices over adb. It holds no
credentials and connects to no remote service.

## Reporting
Open a private security advisory on the GitHub repo.

## Practices
- No secrets in the repo: no .env, tokens, keys, or credentials. A committed
  pre-push hook scans the pushed range for credential patterns and rejects
  (filenames only, never values).
- Input validation: every device serial is charset-validated and every value
  interpolated into an adb command is escaped; adb is always invoked with an
  argv array, never a shell string (no shell injection).
- Least privilege: tools only do on-device UI automation; no filesystem or
  network access beyond adb to the connected device.
- No secrets or PII in logs or tool responses.
