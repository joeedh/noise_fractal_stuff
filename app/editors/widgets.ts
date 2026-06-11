import {
  UIBase, Vector2, util, ToolProperty, eventWasTouch,
  Container, ListBox, saveUIData, loadUIData, pushModalLight, popModalLight,
  keymap
} from '../path.ux/scripts/pathux.js';
import type {ToolContext} from '../core/context.js';
import type {SliderDef} from '../pattern/pattern_types.js';
import {presetManager} from '../pattern/preset.js';
import type {CategoryList, Preset} from '../pattern/preset.js';
import {genBlueMask} from '../pattern/bluemask.js';

interface SliderItem {
  name: string
  index: number
  pos: Vector2
  size: Vector2
  range: [number, number]
  exp: number
  speed: number
  noReset?: boolean
}

export class SlidersWidget extends UIBase<ToolContext> {
  sliderDef: SliderItem[]
  textHeight: number
  sum: number
  canvas: HTMLCanvasElement
  g: CanvasRenderingContext2D
  mpos: Vector2
  last_mpos: Vector2
  mdown: boolean
  actslider: number | undefined
  declare onchange: ((val: unknown) => void) | null
  sliderWidth: number
  size: [number, number]
  height: number
  pos: [number, number]
  _last_pos_size_key: string
  animreq: number | undefined
  modalData: ReturnType<typeof pushModalLight> | undefined
  _rebuild: boolean
  _digest: util.HashDigest
  _last_update_hash: number

  constructor() {
    super();

    this.sliderDef = [];
    this.textHeight = 10;
    this.sum = 0;

    this.canvas = document.createElement("canvas");
    const g = this.canvas.getContext("2d");
    if (!g) {
      throw new Error("could not get 2d canvas context");
    }
    this.g = g;
    this.shadow.appendChild(this.canvas);

    this.mpos = new Vector2();
    this.last_mpos = new Vector2();
    this.mdown = false;

    this.actslider = undefined;
    this.onchange = null;

    this.sliderWidth = 30.0;

    this.size = [400, 400];
    this.height = 400;

    this.pos = [15, 55];

    this._last_pos_size_key = '';

    this.animreq = undefined;

    this._digest = new util.HashDigest();
    this._last_update_hash = 0;

    this._rebuild = true;
  }

  get sliderPath(): string {
    return this.getAttribute("datapath") ?? "";
  }

  set sliderPath(v: string) {
    this.setAttribute("datapath", v);
  }

  static define() {
    return {
      tagname: "sliders-widget-x",
      style  : "sliders-widget"
    }
  }

  init() {
    super.init();

    this.addEventListener("mousedown", (e: MouseEvent) => {
      return this.on_mousedown(e);
    });

    this.addEventListener("mousemove", (e: MouseEvent) => {
      return this.on_mousemove(e);
    });

    this.addEventListener("mouseup", (e: MouseEvent) => {
      return this.on_mouseup(e);
    });

    this.setCSS();
  }

  on_mousedown(e: MouseEvent) {
    this.mpos.load(this._getMouse(e));
    this.last_mpos.load(this.mpos);

    this.findHighlight(e);

    //this.mdown = e.button === 0 || eventWasTouch(e);
    this.sum = 0;

    if (e.button === 0 || eventWasTouch(e)) {
      this.startSlide(e);
      e.preventDefault();
      e.stopPropagation();
    }
  }

  startSlide(e: MouseEvent) {
    let end = () => {
      if (this.modalData) {
        popModalLight(this.modalData);
        this.modalData = undefined;
      }
    }

    this.modalData = pushModalLight({
      on_mousemove: (e: MouseEvent) => {
        this.doSlide(e);
      },
      on_mouseup  : (e: MouseEvent) => {
        end();
      },
      on_keydown  : (e: KeyboardEvent) => {
        switch (e.keyCode) {
          case keymap['Enter']:
          case keymap['Escape']:
            end();
            break;
        }
      }
    });
  }

  _getMouse(e: MouseEvent): Vector2 {
    let r = this.getBoundingClientRect();
    return new Vector2([e.x - r.x, e.y - r.y]);
  }

  doSlide(e: MouseEvent) {
    let mpos = this._getMouse(e);

    if (this.actslider === undefined) {
      return;
    }

    const actslider = this.actslider

    this.last_mpos.load(this.mpos);
    this.mpos.load(mpos);

    let dx = this.mpos[0] - this.last_mpos[0];
    let dy = -(this.mpos[1] - this.last_mpos[1]);

    dy *= 0.01;
    dx *= 0.01;

    let item = this.sliderDef[actslider];

    let wid = item.range[1] - item.range[0];
    wid = Math.max(wid, 100.0);

    //dy *= wid*0.1;

    if (e.shiftKey) {
      dy *= 0.05;
    }

    if (e.ctrlKey) {
      dy *= 0.05;
    }

    let sliders = this.getSliders();

    if (!sliders) {
      return;
    }

    dy *= item.speed;
    this.sum += dy;

    let f = Math.pow(Math.abs(this.sum), item.exp);
    if (!isNaN(f) && f !== 0.0) {
      dy *= f/Math.abs(this.sum);
    }

    let value = sliders[actslider]! + dy;
    value = Math.min(Math.max(value, item.range[0]), item.range[1]);

    console.log(dy.toFixed(2));
    let path = this.sliderPath;

    path = `${path}[${actslider}].value`;

    this.setPathValueUndo(this.ctx, path, value);
    this.flagRedraw();

    if (this.onchange) {
      this.onchange(this.actslider);
    }
  }

  on_mousemove(e: MouseEvent) {
    if (this.mdown) {
      return this.doSlide(e);

    }

    this.mpos.load(this._getMouse(e));
    this.findHighlight(e);
  }

  findHighlight(e: MouseEvent) {
    let mpos = this._getMouse(e);
    let slideri = this.findSlider(mpos[0], mpos[1]);

    console.log(slideri);

    let redraw = slideri !== this.actslider;
    this.actslider = slideri;

    if (redraw) {
      this.flagRedraw();
    }
  }

  on_mouseup(e: MouseEvent) {
    this.mdown = false;
  }

  findSlider(x: number, y: number): number | undefined {
    let dpi = UIBase.getDPI();

    //x *= dpi;
    //y *= dpi;

    for (let item of this.sliderDef) {
      let ok = x >= item.pos[0] && x <= item.pos[0] + item.size[0];
      ok = ok && (y >= item.pos[1] && y <= item.pos[1] + item.size[1]);

      if (ok) {
        return item.index;
      }
    }
  }

  setCSS() {
    super.setCSS();

    this.style["position"] = "fixed";
    //this.style["z-index"] = "1500";
    this.style["border"] = "1px solid black";
    this.style["borderRadius"] = "8px";

    this.style["width"] = this.size[0] + "px";
    this.style["height"] = this.size[1] + "px";

    this.style["left"] = this.pos[0] + "px";
    this.style["top"] = this.pos[1] + "px";
  }

  setSliderDef(def: Array<string | SliderDef>) {
    this.sliderDef = [];

    this._rebuild = true;

    for (let raw of def) {
      const src: SliderDef = typeof raw === "string" ? {name: raw} : raw

      const range = src.range
      const item: SliderItem = {
        name : src.name ?? "",
        index: this.sliderDef.length,
        pos  : new Vector2(),
        size : new Vector2(),
        range: range && range.length >= 2 ? [range[0]!, range[1]!] : [-100000, 100000],
        exp  : src.exp ?? 1.0,
        speed: src.speed ?? 1.0,
        noReset: src.noReset,
      }

      this.sliderDef.push(item);
    }
  }

  flagRedraw() {
    if (this.animreq !== undefined) {
      return;
    }

    this.animreq = requestAnimationFrame(() => this.draw())
  }

  draw() {
    this.animreq = undefined;
    let canvas = this.canvas;
    let g = this.g;

    let dpi = UIBase.getDPI();

    let sliders = this.getSliders();

    canvas.width = ~~(this.size[0]*dpi);
    canvas.height = ~~(this.size[1]*dpi);

    canvas.style["width"] = (canvas.width/dpi) + "px";
    canvas.style["height"] = (canvas.height/dpi) + "px";

    const w = this.sliderWidth;
    const ts = this.textHeight*UIBase.getDPI();

    let fontsize = (ts).toFixed(2);
    g.font = `${fontsize}px Georgia`;

    g.save();
    g.scale(dpi, dpi);

    function drawTextShadow(text: string, x: number, y: number) {
      for (let i = 0; i < 15; i++) {
        g.shadowBlur = 3.0;
        g.shadowColor = "black";
        //g.font = "16px bold courier";
        g.fillStyle = "black";
        g.fillText(text, x, y);
      }

      g.beginPath();
      g.shadowBlur = 0.0;
      g.shadowColor = "rgba(0,0,0,0)";
      //g.font = "16px bold courier";
      g.fillStyle = "white";
      g.fillText(text, x, y);
    }

    for (let item of this.sliderDef) {
      g.beginPath();

      g.rect(item.pos[0], item.pos[1], w, item.size[1]);

      if (item.index === this.actslider && this.mdown) {
        g.fillStyle = "rgba(15, 15, 15, 0.5)";
        g.fill();
      } else if (item.index === this.actslider) {
        g.fillStyle = "rgba(75, 75, 75, 0.75)";
        g.fill();
      } else {
        g.fillStyle = "rgba(75, 75, 75, 0.5)";
        g.fill();
      }

      let offset = (item.index%2)*ts;

      let x = item.pos[0], y = item.pos[1] + item.size[1] + ts;

      let val = 0.0;

      if (sliders) {
        val = sliders[item.index] ?? 0.0;
      }

      drawTextShadow(val.toFixed(2), x, y);
      drawTextShadow(item.name, x, y + ts*1.5 + offset);
    }

    g.restore();
    //g.putImageData(genBlueMask(128), 0, 0);
  }

  getSliders(): number[] | undefined {
    let path = this.sliderPath;

    if (path) {
      return this.ctx.api.getValue<number[]>(this.ctx, path);
    }
  }

  rebuild() {
    let pad = 2;
    let w = this.sliderWidth + pad;

    let width = w*this.sliderDef.length;

    this.size[0] = width;
    let x = pad;

    let dpi = UIBase.getDPI();

    for (let item of this.sliderDef) {
      item.pos[0] = x;
      item.pos[1] = 0;

      item.size[0] = w;
      item.size[1] = this.size[1] - this.textHeight*dpi*4.5;

      x += w;
    }

    this.setCSS();
    this.flagRedraw();
  }

  updateDataPath() {
    let digest = this._digest.reset();
    let sliders = this.getSliders();

    if (!sliders) {
      return;
    }

    if (this.sliderDef && sliders.length !== this.sliderDef.length) {
      this.setSliderDef(this.ctx.pattern.constructor.getPatternDef().sliderDef);
      this.rebuild();
    }

    for (let value of sliders) {
      digest.add(value);
    }

    let hash = digest.get();
    if (hash !== this._last_update_hash) {
      this._last_update_hash = hash;
      this.flagRedraw();
    }
  }

  updatePos() {
    this.size[1] = this.height / UIBase.getDPI();

    let key = this.pos[0].toFixed(2) + ":" + this.pos[1].toFixed(2) + ":";
    key = this.size[0].toFixed(2) + ":" + this.size[1].toFixed(2);

    if (key === this._last_pos_size_key) {
      return;
    }

    console.log("slider pos/size update", key);
    this._last_pos_size_key = key;

    this.setCSS();
  }

  update() {
    this.updateDataPath();

    if (this._rebuild) {
      this.rebuild();
    }

    this.updatePos();
    super.update();
  }
}

UIBase.register(SlidersWidget);

export class PresetCategoryWidget extends Container<ToolContext> {
  _last_update_key: string
  _rebuild: boolean
  _last_active: number
  list: ListBox<ToolContext, number> | undefined

  constructor() {
    super();

    this._last_update_key = "";
    this._rebuild = true;
    this._last_active = -1;
    this.list = undefined;
  }

  get activePath(): string {
    return this.getAttribute("datapath") ?? "";
  }

  set activePath(v: string) {
    this.setAttribute("datapath", v);
  }

  get dataPath(): string {
    return this.getAttribute("datapath") ?? "";
  }

  set dataPath(v: string) {
    this.setAttribute("datapath", v);
  }

  static define() {
    return {
      tagname: "preset-category-x",
      style  : "preset-category"
    }
  }

  getList(): CategoryList | undefined {
    try {
      return this.ctx.api.getValue<CategoryList>(this.ctx, this.dataPath);
    } catch (error) {
      util.print_stack(error instanceof Error ? error : undefined);
      return undefined;
    }
  }

  rebuild() {
    this._rebuild = false;
    let uidata = saveUIData(this, "categorylist");
    let pat = this.ctx.pattern;

    this.clear();

    this._last_active = -1;
    let list = this.getList();

    if (!list) {
      console.warn("no list!", this.dataPath);
      this._rebuild = true;
      return;
    }

    //this.label(list.category + " Presets");
    const listbox = this.list = this.listbox<number>();

    let act: number | undefined

    for (let item of list) {
      listbox.addItem(item.name, item.categoryIndex);

      const presetData = item.preset as {name?: string}
      if (presetData.name === pat.activePreset) {
        act = item.categoryIndex;
      }
    }

    if (act !== undefined) {
      listbox.setActive(act);
    }

    listbox.on_change = (id: unknown) => {
      let preset = list[id as number];
      let pat = this.ctx.pattern;

      console.log("PRESET", preset, pat);

      if (!pat || !preset || preset.name === pat.activePreset || preset.preset.typeName !== pat.typeName) {
        return;
      }

      console.warn("Setting preset!", preset, id);
      this.ctx.api.execTool(this.ctx, `app.change_presets(preset='${preset.name}')`);
    }

    this.setCSS();
    loadUIData(this, uidata);

    if (!this.hasAttribute("no-delete-button")) {
      let strip = this.strip();
      strip.tool("app.delete_active_preset()");
    }
  }

  setCSS() {
    super.setCSS();
  }

  update() {
    super.update();

    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let key = this.dataPath;
    let list = this.getList();

    if (list) {
      key += ":" + list.length;
    }

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this._rebuild = true;
    }

    let preset = this.ctx.pattern.getActivePreset();
    let act = -1;

    if (preset) {
      act = preset.categoryIndex;
    }

    if (preset && this.list && act !== this._last_active) {
      this._last_active = act;

      let change = this.list.on_change;
      this.list.on_change = null;

      console.warn("Setting active!", preset.name);

      this.list.setActive(act);
      this.list.on_change = change;
    }

    if (this._rebuild) {
      this.rebuild();
    }
  }
}

UIBase.register(PresetCategoryWidget);
