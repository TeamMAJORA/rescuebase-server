# Alpha testing (Table 37): Playwright

Checks A-01 to A-34. The tests only check that each screen opens and loads. Do the full flows (submit, approve, upload) by hand and screenshot them.

Rules first
- Test accounts only. Backend running (`npm start` in `rescuebase-server`), MongoDB reachable.
- Test the built app, not the dev server: in `rescue-base` run `npm run build` then `npm run preview` (http://localhost:4173).
- Login needs an emailed code, so log in by hand once per role (Postman folder 0) and export the tokens.
- A test with no token for its role is skipped, not failed. A skipped test is not a pass.
- This folder is its own project (its own `package.json`), so it does not touch the unit tests (`npm test` in `rescuebase-server`).

Setup (in this folder, once)
1. `npm install`
2. `npx playwright install chromium`

Run (PowerShell)
```
$env:TOKEN_ADMIN="..."; $env:TOKEN_STAFF="..."; $env:TOKEN_VOLUNTEER="..."; $env:TOKEN_FOSTER="..."; $env:TOKEN_ADOPTER="..."
$env:PET_TAG_CODE="..."        # a real QR tag code, needed by A-02
npx playwright test -g "A-06" --headed
npx playwright test
npx playwright show-report
```

Status: A-01 to A-05 (partly), A-04 per role, A-29, A-31, A-32 are written. The rest are `test.fixme` (skipped by design): do those by hand. Not run yet. Do not commit tokens.
