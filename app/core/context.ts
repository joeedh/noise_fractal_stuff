import {
  ContextOverlay, Context, util, vectormath, math,
  contextWrangler, SavedToolDefaults
} from '../path.ux/scripts/pathux.js';
import type {LockedContext} from '../path.ux/scripts/path-controller/controller/context.js';
import {PatternsEnum} from '../pattern/pattern.js';
import type {Pattern} from '../pattern/pattern.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import {presetManager} from '../pattern/preset.js';
import {MainMenu} from '../editors/menu/MainMenu.js';
import type {AppState} from './appstate.js';
import type {FileState} from './file.js';
import type {AppToolStack} from './toolstack.js';
import type {AppScreen} from '../screen.js';

type PresetManager = typeof presetManager

export class BaseOverlay extends ContextOverlay {
  constructor(appstate: AppState) {
    super(appstate);
  }

  get appstate(): AppState {
    return this.state as AppState
  }

  get presets() {
    return presetManager;
  }

  presets_save() {
    return presetManager;
  }

  presets_load(ctx: BaseOverlay, val: PresetManager) {
    return presetManager;
  }

  get api() {
    return this.appstate.api;
  }

  get screen() {
    return this.appstate.screen;
  }

  get toolstack() {
    return this.appstate.toolstack;
  }

  get model() {
    return this.appstate.model;
  }

  get toolDefaults() {
    return SavedToolDefaults.accessors;
  }

  toolDefaults_save() {
    return SavedToolDefaults.accessors;
  }

  toolDefaults_load() {
    return SavedToolDefaults.accessors;
  }

  get propCache() { //used by datapath api
    return SavedToolDefaults;
  }

  propCache_save() {
    return SavedToolDefaults;
  }

  propCache_load(ctx: BaseOverlay, data: typeof SavedToolDefaults) {
    return SavedToolDefaults;
  }

  get pattern(): Pattern | undefined {
    const active = this.model.patterns.active
    return typeof active === 'string' ? undefined : active
  }

  pattern_save() {
    return this.pattern?.typeName
  }

  pattern_load(ctx: BaseOverlay, val: string) {
    return ctx.model.getPattern(val);
  }

  static contextDefine() {
    return {
      name: "base",
      flag: 0
    }
  }

  validate() {
    return true;
  }
}

export class ViewOverlay extends ContextOverlay {
  get menubar() {
    return contextWrangler.getLastArea(MainMenu);
  }

  get canvas() {
    return contextWrangler.getLastArea(CanvasEditor);
  }

  get limitGPUPower() {
    return (this.state as AppState).model.limitGPUPower;
  }

  static contextDefine() {
    return {
      name: "base",
      flag: 0
    }
  }

  validate() {
    return true;
  }
}

export class ToolContext extends Context {
  declare state: AppState
  declare api: import('../path.ux/scripts/pathux.js').DataAPI
  declare toolstack: AppToolStack
  declare screen: AppScreen
  declare model: FileState
  declare pattern: Pattern
  declare presets: PresetManager
  declare canvas: CanvasEditor
  declare menubar: MainMenu
  declare limitGPUPower: boolean

  declare warn: (message: string, timeout?: number) => unknown

  // path.ux's Context.toLocked() returns a LockedContext that proxies every
  // context property at runtime; ContextLike requires toLocked to return `this`.
  // Typing the result as the intersection satisfies both the base override
  // (assignable to LockedContext) and ContextLike (assignable to ToolContext).
  declare toLocked: () => LockedContext & this

  constructor(appstate: AppState) {
    super(appstate);

    this.pushOverlay(new BaseOverlay(appstate));
    this.pushOverlay(new ViewOverlay(appstate));
  }
}

