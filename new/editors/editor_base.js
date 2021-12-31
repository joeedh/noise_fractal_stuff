import {
  Area, nstructjs, UIBase, PackFlags,
  Container, util, vectormath, math, KeyMap
} from '../path.ux/pathux.js';

export class Editor extends Area {
  constructor() {
    super();

    this.container = UIBase.createElement("container-x");
    this.shadow.appendChild(this.container);

    this.keymap = undefined;
    this.defineKeymap();
  }

  static apiDefine(api) {
    let st = api.mapStruct(this);

    return st;
  }

  /** create this.keymap here, KeyMap instance */
  defineKeymap() {

  }

  getScreen() {
    return this.ctx.screen;
  }

  makeHeader(container, add_note_area, make_draggable) {
    return super.makeHeader(container, add_note_area, make_draggable);
  }

  init() {
    super.init();

    this.makeHeader(this.container, false);
  }

  update() {
  }
}

Editor.STRUCT = nstructjs.inherit(Editor, Area) + `
}`;
nstructjs.register(Editor);
