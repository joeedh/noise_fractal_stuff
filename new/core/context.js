import {
  ContextOverlay, Context, util, vectormath, math,
  contextWrangler
} from '../path.ux/pathux.js';
import {PatternsEnum} from '../pattern/pattern.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';

export class BaseOverlay extends ContextOverlay {
  constructor(appstate) {
    super(appstate);
  }

  get api() {
    return this.state.api;
  }

  get screen() {
    return this.state.screen;
  }

  get toolstack() {
    return this.state.toolstack;
  }

  get model() {
    return this.state.model;
  }

  get pattern() {
    return this.model.patterns.active;
  }

  pattern_save() {
    return this.pattern.typeName;
  }

  pattern_load(ctx, val) {
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
  get canvas() {
    return contextWrangler.getLastArea(CanvasEditor);
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
  constructor(appstate) {
    super(appstate);

    this.pushOverlay(new BaseOverlay(appstate));
    this.pushOverlay(new ViewOverlay(appstate));
  }
}

