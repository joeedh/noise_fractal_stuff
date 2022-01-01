import {
  UIBase, Vector2, util, ToolProperty, eventWasTouch, Container, saveUIData, loadUIData
} from '../path.ux/pathux.js';
import {presetManager} from '../pattern/preset.js';

export class SlidersWidget extends UIBase {
  constructor() {
    super();

    this.sliderDef = [];
    this.textHeight = 10;
    this.sum = 0;

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");
    this.shadow.appendChild(this.canvas);

    this.mpos = new Vector2();
    this.last_mpos = new Vector2();
    this.mdown = false;

    this.actslider = undefined;
    this.onchange = null;

    this.sliderWidth = 30.0;

    this.size = [400, 400];
    this.pos = [15, 55];

    this._last_pos_size_key = '';

    this.animreq = undefined;

    this._digest = new util.HashDigest();
    this._last_update_hash = 0;
  }

  get sliderPath() {
    return this.getAttribute("datapath");
  }

  set sliderPath(v) {
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

    this.addEventListener("mousedown", (e) => {
      return this.on_mousedown(e);
    });

    this.addEventListener("mousemove", (e) => {
      return this.on_mousemove(e);
    });

    this.addEventListener("mouseup", (e) => {
      return this.on_mouseup(e);
    });

    this.setCSS();
  }

  on_mousedown(e) {
    this.mpos.load(this._getMouse(e));
    this.last_mpos.load(this.mpos);


    this.mdown = e.button === 0 || eventWasTouch(e);
    this.sum = 0;

    if (this.mdown) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  _getMouse(e) {
    let r = this.getBoundingClientRect();
    return new Vector2([e.x - r.x, e.y - r.y]);
  }

  doSlide(e) {
    let mpos = this._getMouse(e);

    if (this.actslider === undefined) {
      return;
    }

    this.last_mpos.load(this.mpos);
    this.mpos.load(mpos);

    let dx = this.mpos[0] - this.last_mpos[0];
    let dy = -(this.mpos[1] - this.last_mpos[1]);

    dy *= 0.01;
    dx *= 0.01;

    let item = this.sliderDef[this.actslider];

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

    let value = sliders[this.actslider] + dy;
    value = Math.min(Math.max(value, item.range[0]), item.range[1]);

    console.log(dy.toFixed(2));
    let path = this.sliderPath;

    path = `${path}[${this.actslider}].value`;

    this.setPathValueUndo(this.ctx, path, value);
    this.flagRedraw();

    if (this.onchange) {
      this.onchange(this.actslider);
    }
  }

  on_mousemove(e) {
    if (this.mdown) {
      return this.doSlide(e);

    }

    this.mpos.load(this._getMouse(e));
    this.findHighlight(e);
  }

  findHighlight(e) {
    let mpos = this._getMouse(e);
    let slideri = this.findSlider(mpos[0], mpos[1]);

    console.log(slideri);

    let redraw = slideri !== this.actslider;
    this.actslider = slideri;

    if (redraw) {
      this.flagRedraw();
    }
  }

  on_mouseup(e) {
    this.mdown = false;
  }

  findSlider(x, y) {
    let dpi = UIBase.getDPI();

    x *= dpi;
    y *= dpi;

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
    this.style["border-radius"] = "8px";

    this.style["width"] = this.size[0] + "px";
    this.style["height"] = this.size[1] + "px";

    this.style["left"] = this.pos[0] + "px";
    this.style["top"] = this.pos[1] + "px";
  }

  setSliderDef(def) {
    this.sliderDef = [];

    this._rebuild = true;

    const defaults = {
      range: [-100000, 100000],
      exp  : 1.0,
      speed: 1.0,
    };

    for (let item of def) {
      if (typeof item === "string") {
        item = {
          name: item
        };
      }

      item = Object.assign({}, item);

      for (let k in defaults) {
        if (!(k in item)) {
          item[k] = defaults[k];
        }
      }

      item.index = this.sliderDef.length;
      item.pos = new Vector2();
      item.size = new Vector2();

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

    function drawTextShadow(text, x, y) {
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
        val = sliders[item.index];
      }

      val = val.toFixed(2);

      drawTextShadow(val, x, y);
      drawTextShadow(item.name, x, y + ts*1.5 + offset);
    }
  }

  getSliders() {
    let path = this.sliderPath;

    if (path) {
      return this.ctx.api.getValue(this.ctx, path);
    }
  }

  rebuild() {
    let pad = 2;
    let w = this.sliderWidth + pad;

    let width = w*this.sliderDef.length;

    this.size[0] = width;
    let x = pad;

    for (let item of this.sliderDef) {
      item.pos[0] = x;
      item.pos[1] = 0;

      item.size[0] = w;
      item.size[1] = this.size[1] - this.textHeight*3.5;

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

export class PresetCategoryWidget extends Container {
  constructor() {
    super();

    this._last_update_key = "";
    this._rebuild = true;
    this._last_active = -1;
  }

  get activePath() {
    return this.getAttribute("datapath");
  }

  set activePath(v) {
    this.setAttribute("datapath", v);
  }

  get dataPath() {
    return this.getAttribute("datapath");
  }

  set dataPath(v) {
    this.setAttribute("datapath", v);
  }

  static define() {
    return {
      tagname: "preset-category-x",
      style  : "preset-category"
    }
  }

  getList() {
    try {
      return this.ctx.api.getValue(this.ctx, this.dataPath);
    } catch (error) {
      util.print_stack(error);
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
    this.list = this.listbox();

    let act;

    for (let item of list) {
      this.list.addItem(item.name, item.categoryIndex);

      if (item.preset.name === pat.activePreset) {
        act = item.categoryIndex;
      }
    }

    if (act !== undefined) {
      this.list.setActive(act);
    }

    this.list.onchange = (id, item) => {
      let preset = list[id];
      let pat = this.ctx.pattern;

      console.log("PRESET", preset, pat);

      if (!pat || !preset || preset.name === pat.activePreset || preset.preset.typeName !== pat.typeName) {
        return;
      }

      console.warn("Setting preset!", preset, id);
      this.ctx.api.execTool(C, `app.change_presets(preset='${preset.name}')`);
    }

    this.setCSS();
    loadUIData(this, uidata);

    let strip = this.strip();
    strip.tool("app.delete_active_preset()");
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

      let change = this.list.onchange;
      this.list.onchange = null;

      console.warn("Setting active!", preset.name);

      this.list.setActive(act);
      this.list.onchange = change;
    }

    if (this._rebuild) {
      this.rebuild();
    }
  }
}

UIBase.register(PresetCategoryWidget);
