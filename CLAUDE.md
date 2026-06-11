# CLAUDE.md

Guidance for working in this repo (Fractal Explorer — a browser/WebGL fractal & noise pattern explorer).

The app is **TypeScript**, bundled and served with **esbuild**, package-managed with **pnpm**,
type-checked with **tsgo**, unit-tested with **vitest**, and e2e-tested with **Playwright**.

## Running the app (dev)

```bash
pnpm install         # first time (also run inside app/path.ux — see Submodules)
pnpm dev             # esbuild bundle+watch+serve at http://localhost:5000
```

`pnpm dev` runs `scripts/dev.mjs`: esbuild's `context()` watches/bundles and serves on an
internal port, and `scripts/serve-proxy.mjs` fronts it on **port 5000**, injecting the
COOP/COEP/`Document-Policy: js-profiling` headers (esbuild's own serve can't set custom
headers, and those headers are required for SharedArrayBuffer / WebGL js-profiling).

Open `http://localhost:5000` → `app/index.html` imports the bundled `/.dev/entry_point.js`
and calls `start()`. (The old `serv.mjs` raw-ES-module server is superseded by `pnpm dev`.)

### Other scripts

```bash
pnpm build           # minified production bundle (scripts/build.mjs)
pnpm typecheck       # tsgo --noEmit  (strict; must stay at 0 errors)
pnpm test            # vitest run     (unit tests: tests/unit, app/**/*.test.ts)
pnpm test:e2e        # playwright     (renders each pattern; auto-starts the dev server)
pnpm format          # prettier --write .
```

Use **tsgo** (not tsc) to typecheck: `pnpm typecheck` or `pnpm exec tsgo --noEmit`.

## Submodules

`app/path.ux` is a git submodule (with a nested `path-controller` submodule). After cloning
or pulling, run `./git_pull.sh` to init/update both recursively, then `pnpm install` **inside
`app/path.ux`** (its bare `nstructjs` dependency must be installed so esbuild can resolve it).
path.ux is now TypeScript; import its **TS barrel** `app/path.ux/scripts/pathux.js` (resolves
to `scripts/pathux.ts`) — NOT the prebuilt `app/path.ux/pathux.js`, which re-exports the
`dist/` bundle and would double-register custom elements. Don't edit submodule contents as
part of app work unless that's the explicit task.

## Architecture

- **UI framework:** [path.ux](https://github.com/joeedh/path.ux), imported via
  `app/path.ux/scripts/pathux.js`. Provides `nstructjs` (struct serialization), `ToolOp`/
  toolstack (undo system), `DataAPI` (`api_define.ts`), `UIBase` (web-component UI), `util`,
  `vectormath`, `cconst`.
- **App state:** `app/core/appstate.ts` — `AppState` holds `model` (`FileState`), `toolstack`,
  `ctx` (`ToolContext`), and the screen. Global instance is `window._appstate` (typed in
  `app/types/globals.d.ts`).
- **Render loop:** `app/entry_point.ts` (`setupDrawGlobals`) drives drawing via
  `window.redraw_viewport()` / `force_redraw_viewport()`. Optional GPU throttling
  (`model.limitGPUPower`).
- **Fractal patterns** are the heart of the app:
  - Base classes/registry: `app/pattern/` (`pattern_base.ts` has `PatternClasses` +
    `getPatternClass`; `pattern.ts`, `pattern_draw.ts`, `pattern_shaders.ts`,
    `pattern_types.ts`). The shape of `static patternDef()` is the exported `PatternDef` type.
  - Concrete patterns: `app/patterns/` (mandelbrot, newton, moire, clothoid, mountains, etc.).
    Each pattern is registered with `Pattern.register(SomePattern)` and usually has a paired
    `*_presets.ts`. All are imported from `app/patterns/all.ts`.
  - To add a pattern: create `mypattern.ts` + `mypattern_presets.ts`, call `Pattern.register(...)`,
    and add both imports to `app/patterns/all.ts`. Use a plain `static STRUCT` string +
    `Pattern.register` (do NOT also call `nstructjs.inlineRegister`, or the struct registers
    twice).
- **Editors / UI areas:** `app/editors/` (canvas viewport, menus, properties, settings, theme).
  `app/editors/all.ts` wires them up.
- **Debug API:** `app/core/debugAPI.ts` exposes `window.__debugAPI` (loaded from `appstate.ts`)
  for browser-automation/manual testing: `loadPreset(n)`, `highPrec`, `switchPattern(name)`,
  `getPatternNames()`, `pattern`. E.g. newton preset 352 is a deep-zoom precision test case.
- **WebGL helpers:** `app/webgl/webgl.ts`, GL setup in `app/screen.ts`. The GL context type is
  the global `AppGL` alias (`WebGL2RenderingContext` + the extension handles init_webgl attaches),
  declared in `app/types/globals.d.ts`.

## Shaders & hot reload

Shaders are **JS-generated GLSL strings** (template literals with `${}` interpolation and
`#define`-based codegen), in `app/pattern/pattern_shaders.ts` (shared headers / colorize /
`finalShader` / `fragmentBase`) and in each pattern's `patternDef()`/`getShader()`.
`Pattern.compileShader(gl)` assembles + compiles programs; `shaderNeedsCompile()` recompiles
when `this.shader` is cleared or `drawGen` bumps.

**Shader hot reload (dev only):** `pnpm dev` builds a second esbuild target
`app/dev/shaders-entry.ts` → `/.dev/shaders.js` that re-exports the shader registry + fresh
pattern classes. `app/dev/shader-hmr.ts` subscribes to esbuild's `/esbuild` SSE; on each
rebuild it re-imports `/.dev/shaders.js`, copies the fresh shader strings into the live
`Shaders`/`shaderHeaders`/`ColorizeShaderCode` and the fresh shader methods onto the live
`PatternClasses` (via `invalidatePatternDefCache`), then forces the active pattern to
recompile — **no page reload**. Just edit a shader string in any `.ts` and save.
All of this is gated behind `__DEV__` (an esbuild `define`, true in `pnpm dev`, false in
`pnpm build`), so the dev/HMR code is tree-shaken out of production builds.

## Deep zoom / HIGH_PREC (double-single precision)

The viewport transform is `world = (ndc + x/y) * scale` with the x/y sliders storing
`center/scale`, so plain float32 breaks down past ~1e4 zoom (adjacent pixels collapse to the
same world coordinate). The machinery for going deeper:

- **`viewTransform[8]` uniform** (declared in `pattern_shaders.ts`, uploaded in
  `Pattern.viewportDraw`): `[0]`=scale, `[1]/[2]`=x/y rounded to float32 (`Math.fround`),
  `[3]/[4]`=the float64 residuals (`x - fround(x)`). The hi/lo split **must** happen in JS from
  the float64 slider values — splitting after upload recovers nothing.
- **`Pattern.high_prec`** (bool property, UI checkbox "High Precision") sets the `HIGH_PREC`
  shader define; patterns gate their double-single (ds) code behind `#ifdef HIGH_PREC` with the
  plain float32 path in `#else` (see `app/patterns/newton.ts` for the reference implementation,
  including the ds GLSL library: `twoSum`/`dsAdd`/`dsMul`/`dsDiv`/`dsCmul`, numbers as
  `vec2(hi, lo)`, ds complex as `vec4(x.hi, x.lo, y.hi, y.lo)`).
- **Rules learned the hard way:** the extra bits exist only while values stay as (hi, lo) pairs —
  adding `lo` into a plain float at `hi`'s magnitude is a bit-exact no-op. The *entire orbit*
  must stay ds: position, residual, **and the Newton-step derivative/Jacobian** (computing the
  Jacobian from a collapsed float32 `z` quantizes the step direction over multi-pixel tiles →
  grid-of-shifted-blocks artifact). For analytic `f`, replace the 2×2 Jacobian inverse with
  complex division by `f'(z)` (Cauchy–Riemann). Collapsing to float32 is fine only for
  smooth-shading quantities (`dist`, the hessian matrices) where ~1e-7 *relative* error is
  invisible.
- **Optimizer caveat:** `twoSum` needs strict IEEE adds; WebGL2 GLSL has no `precise`
  qualifier. If a ds change has literally zero visual effect, suspect the driver reassociating —
  probe with `twoSum(1.0, 1e-10).y != 0.0`. (The bit-mask `twoProduct` split is immune.)
- ds buys ~47 mantissa bits (~1e-13 relative zoom); beyond that the next step is perturbation
  against a CPU-side float64 reference orbit.

## Conventions

- **TypeScript:** `tsconfig.json` is `strict` (incl. `strictNullChecks`). Keep `pnpm typecheck`
  at **0 errors**. Avoid `any` (the app currently has 0; treat ~10 as a hard ceiling); prefer
  precise types or narrowed `unknown`. Don't over-annotate where inference suffices.
- **Imports:** keep relative import specifiers ending in `.js` — esbuild and tsgo both resolve
  `./foo.js` to its `./foo.ts` sibling. Do not rewrite them to `.ts`.
- **Formatting (`.prettierrc`):** no semicolons, single quotes, 2-space indent,
  `trailingComma: es5`, no bracket spacing (`{foo}` not `{ foo }`).
- Undo is handled generically in `entry_point.ts` via `ToolOp.prototype.undoPre/undo/calcUndoMem`
  using `ctx.state.undoSave()/undoLoad()` (typed locally, not via a global ToolOp augmentation,
  to avoid clashing with path.ux's own ToolOp subclasses).
- **Stale autosave:** the app autosaves the file to `localStorage`. Old autosaves can be
  incompatible with the current path.ux serialization and break startup — clear `localStorage`
  if the app fails to load (Playwright tests do this in `beforeEach`).

## Testing

- **Unit (vitest):** `tests/unit/**/*.test.ts` and `app/**/*.test.ts`. `vitest.config.ts`.
- **e2e (Playwright):** `tests/e2e/patterns.spec.ts` switches to each registered pattern and
  asserts the canvas rendered non-trivial content (reads GL pixels — robust to the stochastic
  per-pixel sampling that makes exact-pixel screenshot comparison flake); screenshots are
  attached as report artifacts. `playwright.config.ts` runs headless Chromium with
  ANGLE/SwiftShader so WebGL renders, and auto-starts `pnpm dev`.

## Packaging / deploy

- **Electron build:** `app/package.json` keeps the electron-builder config. `./package.sh`
  (root) or `app/build_package.sh` copies sources into a `package/` dir and runs
  electron-builder. `electron_base/` is the Electron shell.
- **GitHub Pages (web demo):** automated via `.github/workflows/deploy-pages.yml` — on every
  push to `master` it builds and publishes with the official Pages actions (repo Pages source
  must be set to "GitHub Actions"). The site is assembled by `pnpm build:pages`
  (`scripts/build-pages.mjs`), which bundles into a clean `dist/` (index.html + `.dev/` bundle +
  `assets/`). The bootstrap import in `app/index.html` is **relative** (`./.dev/entry_point.js`)
  so it resolves under the `/noise_fractal_stuff/` project subpath. Live demo:
  https://joeedh.github.io/noise_fractal_stuff/
  - **Minification caveat:** `build:pages` uses **whitespace-only** minification, not esbuild's
    full `minify`. The app registers nstructjs structs by constructor name, so identifier
    minification renames classes and throws "Struct a is already registered"; esbuild's
    `keepNames` is not a usable workaround (its `__name()` wrappers break the render loop).
  - The legacy `./update_gh_pages.sh` (merge `master`→`gh-pages` + Electron `package.sh`) is no
    longer the web-deploy path.

## Notes

- The root `package.json` holds the toolchain deps + scripts; `app/package.json` is kept only
  for the electron-builder config.
- `oldstuff/` is legacy/archived and excluded from the TypeScript build and typecheck — ignore it.
