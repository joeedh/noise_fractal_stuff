import {Preset} from '../pattern/preset.js'
import {PatternClasses} from '../pattern/pattern_base.js'
import type {ToolContext} from './context.js'

export class DebugAPI {
  get ctx(): ToolContext {
    return _appstate.ctx
  }

  /** get builtin pattern presets */
  get patternPresets(): Preset[] {
    return this.ctx.pattern.constructor.patternDef().presets ?? []
  }

  loadPreset(preset: Preset | number) {
    if (typeof preset === 'number') {
      preset = this.patternPresets[preset]
    }
    this.ctx.pattern.loadPreset(preset)
    window.redraw_viewport()
  }

  /** set high precision mode, redraws */
  set highPrec(v: boolean) {
    this.ctx.api.setValue(this.ctx, 'pattern.high_prec', v)
  }

  get highPrec(): boolean {
    return Boolean(this.ctx.api.getValue(this.ctx, 'pattern.high_prec'))
  }

  get pattern() {
    return this.ctx.pattern
  }

  getActivePatternName() {
    return this.ctx.pattern.constructor.patternDef().typeName
  }

  switchPattern(name: string) {
    this.ctx.model.setActivePattern(name)
    window.redraw_viewport()
  }

  getPatternNames(): string[] {
    return PatternClasses.map((cls) => cls.getPatternDef().typeName)
  }
}

declare global {
  interface Window {
    __debugAPI: DebugAPI
  }
}

window.__debugAPI = new DebugAPI()
