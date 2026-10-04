# SCOUT 3.0.1 Windows build repair

Checked 4 October 2026 in `/Users/umi/Documents/SCOUT`, an existing source checkpoint without Git metadata. The user will apply/push the changes personally. No branch, commit, remote mutation, release publication or native desktop packaging was performed.

## Fixed errors

1. **Windows license checkout:** the supplied job failed in `tests/audio-theme.mjs` with 19,053 vs 18,657 bytes. `public/audio/licenses/cc-by-4.0.txt` contains 396 LF characters; Windows Git conversion added exactly 396 CR bytes. `.gitattributes` prevents conversion for immutable audio/notice assets. This preserves original Kenney notices that already contain upstream CRLF. Existing byte counts and SHA-256 hashes remain strict, with improved filename diagnostics. All six original committed notice blobs in the existing clone were read-only compared and already match the manifest; no replacement license document or altered manifest is needed.
2. **ASAR fixture completion:** the full desktop run exposed two intermittent exact-byte failures when the temporary archive header existed but pending file data had not finished writing. The installed ASAR 3.4.1 API returns `Promise<WritableStream>` after `out.end()`, before completion. The archive fixture now awaits `node:stream/promises.finished()` on that stream. The same wait protects the private Mac smoke archive before integrity/sign/launch steps. No sleeps, retries, hash relaxation or dependency edits were used.

## Added coverage and review

- A real Git roundtrip test enables `core.autocrlf=true` and `core.eol=crlf`, proves CRLF conversion with an ordinary-text control, then verifies exact index and checkout bytes for the original license notices, engine notice and nested audio fixtures. Source files also retain LF.
- Five Windows packaging-hook tests use the installed `resedit` library and an unexecuted x64 PE data fixture. They verify resource identity, full icons, fixed/string version fields, unchanged native sections, safe failure for missing resources, exact multi-chunk artifact size/SHA-256, and no Windows-hook effects on Mac builds.
- Parallel review covered all gameplay/desktop tests, release workflow, locked runtime/builder/toolset requirements, ASAR path separators, PowerShell encoding/argv, native save isolation, update transaction/rollback and artifact filenames. No other concrete Windows blocker was found. Node 22.18 supports literal test glob discovery; the workflow explicitly requests Windows x64 and Mac ARM64.

## Verification and limits

Host: Apple silicon macOS (`darwin`/`arm64`), Node 24.21.0. Locked dependencies were restored with `npm ci`.

| Command/check | Result |
| --- | --- |
| `npm test` | 29 gameplay suites passed, exit 0 |
| `npm run build` | TypeScript, Vite and generated native engine passed, exit 0 |
| `npm run test:desktop` after integration | 109 discovered, 108 passed, 1 expected skip, zero failures, exit 0 |
| `node --check scripts/smoke-mac-release.mjs` | Passed |
| Native Windows packaging/launch | Not run on this Mac; requires the existing GitHub workflow / Windows hardware |
| Native Mac packaged smoke after this repair | Not run; earlier successful Apple silicon job is user-reported |

The one skipped desktop test asserts rejection of Mac smoke outside Apple silicon macOS, so it is intentionally skipped on this native Apple silicon host. Unit fixtures did not launch Electron. The existing nonfatal large-chunk notice and npm dependency deprecation/audit warnings are retained; dependency versions were not changed by this repair. No saves or original assets were changed. Package files and the generated native engine retain their original hashes.

Evidence: `windows-original-failure.log` (user-supplied log), `desktop-before-archive-fix.log` (initial integrated failures), `desktop-tests.log` (final pass), `production-build.log`, and `verification.json` (command results/source hashes). Gameplay success was observed in the command output; the JSON records its exit/suite count rather than claiming a new raw gameplay log was captured.

## Apply with Finder and GitHub Desktop

Changed source files:

- `.gitattributes` (new; Finder hides it until **Command + Shift + Period**)
- `tests/audio-theme.mjs`
- `electron/tests/source-checkout.test.cjs` (new)
- `electron/tests/windows-packaging.test.cjs` (new)
- `electron/tests/release-archive.test.cjs`
- `scripts/smoke-mac-release.mjs`
- `QA-3.01.md` and this `qa/3.01-windows-build-fix` evidence folder

Keep `CODEX-HANDOFF.md` local for Codex, as the user requested. It is not required for either platform's build and is excluded from the files to push.

In GitHub Desktop, select the existing `scout` clone and choose **Repository → Show in Finder**. Preserve unrelated Changes. Copy these files into matching locations in that clone, including hidden `.gitattributes`; keep its `.git`, credentials, saves and unrelated files intact. Use a development branch and commit the repair in GitHub Desktop, then push it when ready. This source folder itself cannot be pushed because it has no `.git`.

Open [the repository's Actions](https://github.com/spinjitsu12/scout/actions), choose **Build Windows and Mac game → Run workflow**, select the branch containing the new commit, and leave **Publish this version to the public update channel** unchecked. Source-only pushes do not automatically trigger the existing workflow; start a fresh run rather than rerunning the old failure. Both jobs must pass for the new commit. Finally launch the delivered portable EXE on Windows; source/tests on this Mac cannot prove native Windows runtime behavior. Keep the public repository public and publish only under the existing release gates and explicit publishing instruction.
