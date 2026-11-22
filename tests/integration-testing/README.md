# Integration testing (Table 36, Appendix E): Postman

37 cases INT-001 to INT-037, all with requests in `RescueBase.postman_collection.json` (191 requests, 23 folders). INT-003 Step 3 needs a real Firebase token from a Google sign-in. Full steps, run order and the result tracker: `RescueBase_Integration_Test_Guide.md` in the Obsidian vault.

Rules first
- Test accounts only. Backend running (`npm start`, port 5000), MongoDB reachable, and `http://localhost:5000/health` says `online`.
- Pick the environment `RescueBase local` in Postman. Fill the role tokens through folder 0 (login needs the emailed code).
- Screenshot only when every assertion shows PASS.
- Folders 19 and 20 (foster, INT-013 and INT-014): set `TOKEN_APPLICANT` (a spare adopter test account with no foster application; log it in through folder 0 with `ROLE_NOW` = `applicant`) and `TEST_FOSTER_ANIMAL_ID` (an available pet not in foster). `TOKEN_FOSTER` must be an approved foster with a free slot. Run 19 then 20 in one Runner session; 20 confirms the return and withdraws the spare application, so both can be run again.
- Folder 21 (INT-003): Steps 1 and 2 need nothing. For Step 3, sign in with Google in the app, copy the Firebase ID token and put it in `FIREBASE_ID_TOKEN`.
- Uploads (folder 7 proof photo, folder 17): choose a .jpg or .png in the request body first.

Run
1. Postman: Import `RescueBase.postman_collection.json` and `RescueBase.postman_environment.json`. Run folders in the order given in the guide.
2. Terminal (after exporting your filled environment over `RescueBase.postman_environment.json`, from this folder):
   `npm i -g newman`
   `newman run RescueBase.postman_collection.json -e RescueBase.postman_environment.json --folder "2. Access control (INT-034, INT-037)"`
   Newman cannot do folder 0 (emailed code) or INT-029 (301 iterations): use the Postman Runner for those.

Do not commit tokens: the exported environment holds them. Reset `TOKEN_*`, `PASSWORD` and `OTP` before committing.
