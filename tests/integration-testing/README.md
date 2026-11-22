# Integration testing (Table 36, Appendix E): Postman

37 cases INT-001 to INT-037. 34 have requests in `RescueBase.postman_collection.json` (133 requests, 19 folders); INT-003, INT-013 and INT-014 are done by hand. Full steps, run order and the result tracker: `RescueBase_Integration_Test_Guide.md` in the Obsidian vault.

Rules first
- Test accounts only. Backend running (`npm start`, port 5000), MongoDB reachable, and `http://localhost:5000/health` says `online`.
- Pick the environment `RescueBase local` in Postman. Fill the role tokens through folder 0 (login needs the emailed code).
- Screenshot only when every assertion shows PASS.

Run
1. Postman: Import `RescueBase.postman_collection.json` and `RescueBase.postman_environment.json`. Run folders in the order given in the guide.
2. Terminal (after exporting your filled environment over `RescueBase.postman_environment.json`, from this folder):
   `npm i -g newman`
   `newman run RescueBase.postman_collection.json -e RescueBase.postman_environment.json --folder "2. Access control (INT-034, INT-037)"`
   Newman cannot do folder 0 (emailed code) or INT-029 (301 iterations): use the Postman Runner for those.

Do not commit tokens: the exported environment holds them. Reset `TOKEN_*`, `PASSWORD` and `OTP` before committing.
