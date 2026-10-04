# Physics engine

SCOUT uses **Cannon ES 0.20.0**, the existing open-source rigid-body physics engine maintained by the pmndrs community, derived from cannon.js by Stefan Hedman.

Upstream: https://github.com/pmndrs/cannon-es

The engine is distributed under its MIT license. The unmodified notice from the installed package is bundled in `public/licenses/cannon-es-MIT.txt` and copied into the offline game build. SCOUT's original game assets and source retain their existing ownership.

Engine code is bundled by the production build. Playing offline does not fetch an engine, script, or physics asset from the internet.
