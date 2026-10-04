# Linux developer integration fixture

This fixture accompanies the retained 3.01 evidence. It is not the native Mac smoke check and is not bundled into the player app.

Use supported Node.js and the locked project dependencies on Linux. Run `prepare.mjs` to generate current valid careers, then `run.mjs` to check the real desktop UI with a new isolated temporary profile. Run `run.mjs` again with `SCOUT_LINUX_QA_REOPEN=1` to check fresh-process save loading and the Nearby map. The scripts resolve the project root themselves. Results go into the adjacent `qa301` folder, separate from the retained report.

Read the limitations in `QA-3.01.md` and the report. The wrapper supplies an offscreen surface, synthetic display and cursor, omits native titlebar chrome, bypasses the unavailable singleton socket, and rejects unavailable mouse capture. Software-rendering input checks look upward to avoid GPU stalls. It measures state and persistence, not hardware frame rate. Player app files and real player save directories are never substituted or seeded.
