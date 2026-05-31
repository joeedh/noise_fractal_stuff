/* Ambient declarations for the app-specific globals attached to `window`.
 * These were implicit globals in the original JS; declaring them here lets the
 * rest of the app reference `window.redraw_viewport`, `_appstate`, etc. with
 * real types. */
import type {AppState} from '../core/appstate.js'
import type {Texture} from '../webgl/webgl.js'
import type {CurveSet} from '../pattern/pattern_shaders.js'
import type {PresetManager} from '../pattern/preset.js'
import type {EnumProperty} from '../path.ux/scripts/pathux.js'

declare global {
  /* The custom WebGL context. The app requests WebGL2 (falling back to WebGL1
   * at runtime, guarded by haveWebGL2), so we type it as WebGL2RenderingContext
   * plus the extra fields/extension handles init_webgl attaches to it. */
  type AppGL = WebGL2RenderingContext & {
    haveWebGL2: boolean
    contextGen: number
    contextBad: boolean
    debugContextLoss: WEBGL_lose_context | null
    color_buffer_float: EXT_color_buffer_float | null
    depth_texture: WEBGL_depth_texture | null
    draw_buffers: WEBGL_draw_buffers | null
    float_blend: EXT_float_blend | null
    texture_float: OES_texture_float | null
    texture_float_linear: OES_texture_float_linear | null
  }

  interface Window {
    _appstate: AppState
    _gl: AppGL
    _icon_image: HTMLImageElement

    haveElectron: boolean

    redraw_viewport: () => void
    force_redraw_viewport: () => void
    redraw_all: () => void
    redraw_all_full: () => void

    init: () => void
    loadDefaultFile: (appstate: AppState, loadLocalStorage?: boolean) => void
    _renderJob: unknown
    _istruct: unknown

    /* `C` is a convenience accessor for the active ToolContext (defined via
     * Object.defineProperty in appstate.start). */
    C: AppState['ctx']

    /* Debug/global handles attached by the pattern subsystem. */
    _bluetexs: Record<number, Texture>
    CurveSet: typeof CurveSet
    _presetManager: PresetManager
    _PatternsEnum: EnumProperty
    compress: (str: string) => string
    decompress: (str: string) => string
    compressPresets: () => void
  }

  /* Compile-time flag set by esbuild's `define` (true in dev, false in prod).
   * Used to gate dev-only features (shader hot reload) so they tree-shake out
   * of production builds. */
  const __DEV__: boolean

  /* Bare (unqualified) global references used throughout the app. */
  var _appstate: AppState
  var _gl: AppGL
  var _icon_image: HTMLImageElement

  /* Debug handles attached by the GLSL autodiff module. */
  // eslint-disable-next-line no-var
  var _glslMod: unknown
  // eslint-disable-next-line no-var
  var _testAutoDiffGLSL: () => void
}

export {}
