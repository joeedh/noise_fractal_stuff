/* Dev-only: relax this bundle's nstructjs instance.
 *
 * The shader hot-reload target (shaders-entry.ts) re-imports the full pattern
 * graph, which re-runs every struct's nstructjs.register(). This module's
 * nstructjs is a separate, module-scoped instance from the main app's (each
 * esbuild bundle gets its own copy), so configuring it here does NOT affect the
 * running app's registry. Allowing overriding + silencing warnings keeps the
 * re-import quiet and prevents a re-registration from throwing.
 *
 * Imported before '../patterns/all.js' in shaders-entry.ts so it runs first. */
import {nstructjs} from '../path.ux/scripts/pathux.js'

nstructjs.setAllowOverriding(true)
nstructjs.setWarningMode(0)

export {}
