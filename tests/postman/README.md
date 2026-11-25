# RescueBase — Cleaned Postman Integration Suite

## What Was Cleaned
- Merged all separate collections (`INT-003`, `INT-013`/`INT-014` Foster flows, and `INT-027` Notifications) into **one unified collection**: `RescueBase.postman_collection.json` (23 folders, 166 requests covering all 37 integration cases `INT-001`–`INT-037`).
- Removed obsolete backups and duplicates (`RescueBase.postman_collection.before-new-int.json`, `Foster_INT-013_014.postman_collection.json`, `RescueBase Integration Tests - Validor/`, and the old YAML workspace tree).
- Standardized all folder titles (`00` through `22`) without messy scratchpad notes so the sidebar looks clean during live panel presentation.
- Scrubbed all passwords, tokens, and personal emails from both the collection and `RescueBase.postman_environment.json` (and fixed the `MAIL` → `EMAIL` key typo).

## Quick Setup for Live Defense Demo
1. In Postman, delete old imported collections (`Foster INT-013...`, `INT-003 Google login`, `Manual cases`, `RescueBase API checks...`) so only **RescueBase — Integration Test Suite (INT-001 to INT-037)** is shown.
2. Import `RescueBase.postman_collection.json` and `RescueBase.postman_environment.json`.
3. Select **RescueBase Environment (Clean)** in the top-right dropdown and set `BASE_URL` (e.g., `http://localhost:5000` or your deployed Render/Railway API URL).
4. Use Folder `00. Auth Helpers — Role Token Setup (INT-001)` to populate `TOKEN_ADMIN`, `TOKEN_STAFF`, `TOKEN_VOLUNTEER`, `TOKEN_FOSTER`, and `TOKEN_ADOPTER`.
