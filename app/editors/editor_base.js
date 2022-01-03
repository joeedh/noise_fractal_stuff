import {
  Area, nstructjs, UIBase, PackFlags,
  Container, util, vectormath, math, KeyMap,
  Vector2, contextWrangler
} from '../path.ux/pathux.js';
;
class DrawBox {
  constructor(x, y, w, h, lineWidth=2.0) {
    this.pos = new Vector2([x, y]);
    this.size = new Vector2([w, h]);

    let div = this.dom = document.createElement("div");
    document.body.appendChild(this.dom);

    div.style["position"] = "fixed";
    div.style["left"] = x + "px";
    div.style["top"] = y + "px";
    div.style["width"] = w + "px";
    div.style["height"] = h + "px";
    div.style["border"] = `${lineWidth}px solid white`;
    div.style["pointer-events"] = "none";
    div.style["padding"] = div.style["margin"] = "0px";
  }

  end() {
    if (this.dom) {
      this.dom.remove();
      this.dom = undefined;
    }
  }
}

export class Editor extends Area {
  constructor() {
    super();

    this.container = UIBase.createElement("container-x");
    this.shadow.appendChild(this.container);

    this.keymap = undefined;
    this.defineKeymap();

    this.drawBoxes = [];
  }

  addDrawBox(x, y, w, h, lineWidth=2) {
    let dbox = new DrawBox(x + this.pos[0], y + this.pos[1], w, h, lineWidth);

    this.drawBoxes.push(dbox);

    return dbox;
  }

  resetDrawBoxes() {
    for (let box of this.drawBoxes) {
      box.end();
    }

    this.drawBoxes.length = 0;
  }

  on_area_inactive() {
    super.on_area_inactive();

    this.resetDrawBoxes();
  }

  on_fileload(isActiveEditor) {
    super.on_fileload(isActiveEditor);

    this.resetDrawBoxes();
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

    let update_context = (e) => {
      contextWrangler.updateLastRef(this.constructor, this);
    }

    this.addEventListener("focus", update_context);
    this.addEventListener("mouseover", update_context);
    this.addEventListener("mousedown", update_context);
  }

  update() {
  }
}

Editor.STRUCT = nstructjs.inherit(Editor, Area) + `
}`;
nstructjs.register(Editor);
