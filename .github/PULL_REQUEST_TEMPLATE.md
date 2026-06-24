## Summary

<!-- One or two sentences: what does this PR do, and why? -->

## What changed

-

## Testing done

<!-- What you ran/checked. Include device/Android version if relevant. -->

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Manually verified against a real device / emulator (if applicable):

## Checklist

- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] No secrets committed (`.env`, tokens, keys, `*.session.json`, cookies)
- [ ] `adb` is invoked argv-only (never a shell string); interpolated values are escaped
- [ ] Serials are validated at the boundary
- [ ] Changes are focused; unrelated files were not touched
- [ ] Branch follows `<type>/<slug>` (`feat|fix|chore|refactor|docs`)
