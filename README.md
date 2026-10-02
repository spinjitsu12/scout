# SCOUT

An offline Windows pixel-art scout simulator. Investigate promising people, recruit a complementary team, and rise through three organizations: Cirrus Works, Aster Institute, and The Veil.

## Playing

Open the portable SCOUT executable, or use the Windows installer. The game bundles its artwork, fonts and music and needs no browser, account or server. F11 toggles fullscreen. Standard window controls close the game.

WASD or arrows move. Behind the wheel, W/S accelerate and reverse, A/D steer, and Space brakes. E enters, parks, or interacts nearby. C cycles overhead, cockpit, chase, and far chase views. G opens GPS and assisted driving. J opens the fieldbook. Escape pauses the story or world and opens the career desk.

The dream prologue leads to a small, walkable apartment and the first day at Cirrus Works. Drive the district roads to meet contacts in person, investigate their work and motivations, negotiate, and build teams for assignments. Earn your way through the company, the institute, and The Veil. Cars, paint, plate, appearance, radio, and independent music, engine, and world sound settings are saved with the career.

## Saved careers

The desktop app saves careers in `%APPDATA%/SCOUT/save/career.json`. The previous usable career is retained as `career.previous.json`. Moving the portable executable or installing a newer version does not move or erase this directory. Settings can export and import a JSON career backup. Save files are local to this Windows account.

The renderer retains a local backup as well. If the main save is damaged, the game reports the problem so a backup can be restored. The world, artwork, font and music work offline. Update checks run in the background and never prevent playing or saving. Canceling or losing a download leaves the current build intact. A fully verified update can be retained for a later offline restart. In-app updates are supported by the portable Windows edition; installer builds identify their limitation in the career desk.

## Development

Requires Node 22.18 or later, below Node 25. Install dependencies with `npm ci`. `npm run desktop` builds the renderer and opens the desktop app. `npm run dist:win` builds the Windows portable executable and installer into `release`. Windows builds use Electron 44.5.1 and electron-builder 26.15.3. Portable cross-builds on Linux do not require Wine.

`npm test` checks the simulator. `npm run test:desktop` checks durable saves, backup recovery, interrupted writes, offline startup, network timeouts, canceled and interrupted downloads, release integrity and staged-update retention. It also tests nested archive reads with native and Windows path rules before packaging. `npm run verify:release` verifies the packaged portable build and every bundled renderer asset. The renderer can be inspected during development with `npm run dev`.

## Asset credits

Original pixel art and music were created for SCOUT. Pixelify Sans by Stefie Justprince is distributed under the SIL Open Font License, included in `public/fonts/OFL.txt`. Electron and third-party libraries retain their respective licenses in the packaged runtime.
