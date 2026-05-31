import {
  Area, nstructjs, UIBase, PackFlags,
  Container, util, vectormath, math, KeyMap,
  Vector2, contextWrangler
} from '../path.ux/scripts/pathux.js';
import type {DataAPI, DataStruct, ContextLike, IToolStack} from '../path.ux/scripts/pathux.js';
import type {ToolContext} from '../core/context.js';
;
export class DrawBox {
  pos: Vector2
  size: Vector2
  dom: HTMLDivElement | undefined

  constructor(x: number, y: number, w: number, h: number, lineWidth = 2.0) {
    this.pos = new Vector2([x, y]);
    this.size = new Vector2([w, h]);

    let div = this.dom = document.createElement("div");
    document.body.appendChild(this.dom);

    div.style.position = "fixed";
    div.style.left = x + "px";
    div.style.top = y + "px";
    div.style.width = w + "px";
    div.style.height = h + "px";
    div.style.border = `${lineWidth}px solid white`;
    div.style.pointerEvents = "none";
    div.style.padding = div.style.margin = "0px";
  }

  end() {
    if (this.dom) {
      this.dom.remove();
      this.dom = undefined;
    }
  }
}

export class Editor extends Area<ToolContext> {
  container: Container<ToolContext>
  keymap: KeyMap | undefined
  drawBoxes: DrawBox[]

  constructor() {
    super();

    this.container = UIBase.createElement("container-x");
    this.shadow.appendChild(this.container);

    this.keymap = undefined;
    this.defineKeymap();

    this.drawBoxes = [];
  }

  addDrawBox(x: number, y: number, w: number, h: number, lineWidth = 2): DrawBox {
    let dbox = new DrawBox(x + this.pos![0], y + this.pos![1], w, h, lineWidth);

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

  on_fileload(isActiveEditor: boolean) {
    super.on_fileload(isActiveEditor);

    this.resetDrawBoxes();
  }

  static apiDefine(api: DataAPI): DataStruct {
    let st = api.mapStruct(this)

    return st
  }

  /** create this.keymap here, KeyMap instance */
  defineKeymap() {

  }

  getScreen() {
    return this.ctx.screen;
  }

  makeHeader(container: Container<ToolContext>, addNoteArea = true, makeDraggable = true): Container<ToolContext> {
    return super.makeHeader(container, addNoteArea, makeDraggable)
  }

  init() {
    super.init();

    this.makeHeader(this.container, false);

    let update_context = (e: Event) => {
      // updateLastRef only stores the area ref by class id (it never writes
      // .ctx), so widening the invariant CTX generic here is sound.
      contextWrangler.updateLastRef(this.constructor, this as unknown as Area)
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
