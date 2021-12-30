import {ContextOverlay, Context, util, vectormath, math} from '../path.ux/pathux.js';
import {PatternsEnum} from '../pattern/pattern.js';

export class BaseOverlay extends ContextOverlay {
  constructor(appstate) {
    super(appstate);
  }

  validate() {
    return true;
  }

  static contextDefine() {
    return {
      name   :   "base",
      flag   :   0
    }
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
}

export class ViewOverlay extends ContextOverlay {
  validate() {
    return true;
  }

  static contextDefine() {
    return {
      name   :   "base",
      flag   :   0
    }
  }
}

export class ToolContext extends Context {
  constructor(appstate) {
    super(appstate);

    this.pushOverlay(new BaseOverlay(appstate));
    this.pushOverlay(new ViewOverlay(appstate));
  }
}

