/* Dev-only esbuild entry: the "shaders" hot-reload target (→ /.dev/shaders.js).
 *
 * It re-exports the shader registry (shared shader code) and the pattern-class
 * registry, then imports all.js so the fresh PatternClasses are populated with
 * up-to-date per-pattern shader code. The dev client (shader-hmr.ts) cache-bust
 * re-imports this module after each rebuild and copies the fresh shader strings
 * / shader-producing methods into the live objects in the main bundle.
 *
 * The idempotent-define import MUST stay first: importing the pattern graph
 * re-runs path.ux's customElements.define() calls, which would otherwise throw
 * on the already-registered elements from the main bundle. */
import './idempotent-define.js'
import './nstructjs-dev-config.js'

export {
  Shaders,
  shaderHeaders,
  ColorizeShaderCode,
  buildShader,
  CurveSet,
} from '../pattern/pattern_shaders.js'

export {PatternClasses, getPatternClass} from '../pattern/pattern_base.js'

import '../patterns/all.js'
