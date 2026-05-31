/* Dev-only shader hot-reload client.
 *
 * Subscribes to esbuild's /esbuild live-reload EventSource. On each rebuild it
 * cache-bust re-imports the separate shaders bundle (/.dev/shaders.js) and
 * copies the fresh shader code into the LIVE objects of the running app, then
 * forces the active pattern to recompile its GL programs — all without a page
 * reload. This emulates the devtools live-code-reload workflow the shaders were
 * written for.
 *
 * This whole module is dynamically imported only when __DEV__ is true, so it is
 * dead-code-eliminated from production builds. */
import {
  Shaders,
  shaderHeaders,
  ColorizeShaderCode,
} from '../pattern/pattern_shaders.js'
import {PatternClasses, invalidatePatternDefCache} from '../pattern/pattern.js'
import type {Pattern} from '../pattern/pattern.js'

declare const __DEV__: boolean

let reloadCounter = 0

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/* Recursively copy string / string-array leaves from src onto dst, mutating dst
 * in place so existing references in the running app pick up the new shader
 * code. Only keys already present on dst are touched. */
function copyShaderStrings(dst: unknown, src: unknown): void {
  if (!isRecord(dst) || !isRecord(src)) {
    return
  }

  for (const k of Object.keys(dst)) {
    const dv = dst[k]
    const sv = src[k]

    if (typeof dv === 'string' && typeof sv === 'string') {
      dst[k] = sv
    } else if (Array.isArray(dv) && Array.isArray(sv)) {
      dst[k] = sv
    } else if (isRecord(dv) && isRecord(sv)) {
      copyShaderStrings(dv, sv)
    }
  }
}

/* Shader code for a pattern comes from these static/instance methods; copying
 * them from the freshly-imported class onto the live (registered) class lets
 * existing pattern instances pick up new shader source via this.constructor. */
const SHADER_STATICS = ['patternDef', 'getPatternDef']
const SHADER_PROTO = ['getShader', 'getFragmentCode']

function copyShaderMethods(liveCls: typeof Pattern, freshCls: typeof Pattern): void {
  for (const name of SHADER_STATICS) {
    if (Object.prototype.hasOwnProperty.call(freshCls, name)) {
      Reflect.set(liveCls, name, Reflect.get(freshCls, name))
    }
  }

  for (const name of SHADER_PROTO) {
    if (Object.prototype.hasOwnProperty.call(freshCls.prototype, name)) {
      Reflect.set(liveCls.prototype, name, Reflect.get(freshCls.prototype, name))
    }
  }

  invalidatePatternDefCache(liveCls)
}

interface FreshShaderModule {
  Shaders: unknown
  shaderHeaders: unknown
  ColorizeShaderCode: unknown
  getPatternClass: (typeName: string) => typeof Pattern | undefined
}

async function reloadShaders(): Promise<void> {
  let fresh: FreshShaderModule
  try {
    fresh = (await import(`/.dev/shaders.js?t=${++reloadCounter}`)) as FreshShaderModule
  } catch (e) {
    console.warn('[shader-hmr] failed to re-import shaders bundle', e)
    return
  }

  /* 1. shared shader code (headers, colorize helpers, fragmentBase/finalShader) */
  copyShaderStrings(Shaders, fresh.Shaders)
  copyShaderStrings(shaderHeaders, fresh.shaderHeaders)
  copyShaderStrings(ColorizeShaderCode, fresh.ColorizeShaderCode)

  /* 2. per-pattern shader code */
  for (const liveCls of PatternClasses) {
    const typeName = liveCls.getPatternDef().typeName
    const freshCls = fresh.getPatternClass(typeName)
    if (freshCls) {
      copyShaderMethods(liveCls, freshCls)
    }
  }

  /* 3. force the active pattern to recompile its programs and redraw */
  const pat: Pattern | undefined = window._appstate?.ctx?.pattern
  if (pat) {
    pat.shader = undefined
    pat.finalShader = undefined
    pat._lastShaderHash = undefined
    pat.drawGen++
    window.redraw_viewport()
    console.log('[shader-hmr] shaders reloaded')
  }
}

export function setupShaderHMR(): void {
  if (!__DEV__) {
    return
  }

  const es = new EventSource('/esbuild')
  es.addEventListener('change', () => {
    void reloadShaders()
  })

  console.log('[shader-hmr] listening for shader rebuilds')
}
