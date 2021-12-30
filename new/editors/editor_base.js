import {
  Area, nstructjs, UIBase, PackFlags,
  Container, util, vectormath, math
} from '../path.ux/pathux.js';

export class Editor extends Area {
  constructor() {
    super();

    this.container = UIBase.createElement("container-x");
    this.shadow.appendChild(this.container);
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
