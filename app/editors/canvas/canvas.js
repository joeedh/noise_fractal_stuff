import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat, HotKey, KeyMap, eventWasTouch
} from '../../path.ux/pathux.js';
import {Icons} from '../icon_enum.js';

import {Editor} from '../editor_base.js';
import {EditorGL} from '../editor_base_3d.js';
import {FBO} from '../../webgl/webgl.js';

export class CanvasEditor extends EditorGL {
  constructor() {
    super();

    this.showSliders = false;
    this.sliderWidget = undefined;
    this.fbos = [];

    this.canvas = undefined;

    this._drawReset = false;
    this._digest = new util.HashDigest();
    this._last_slider_hash = 0;
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    st.bool("showSliders", "showSliders", "Show Sliders");

    return st;
  }

  static define() {
    return {
      tagname : "canvas-editor-x",
      areaname: "canvas-editor",
      uiname  : "Canvas",
      has3D   : true
    }
  }

  defineKeymap() {
    this.keymap = new KeyMap([]);
  }

  makeHeader() {
    super.makeHeader(this.container, true, false);

    this.header.prop("canvas.showSliders");
    this.header.useIcons(true);

    this.header.tool("app.undo()");
    this.header.tool("app.redo()");

    this.header.tool("canvas.reset_view()");
    this.header.tool("canvas.step_zoom(dir=1)").icon = Icons.ZOOM_IN;
    this.header.tool("canvas.step_zoom(dir=-1)");

    this.header.useIcons(false);
    this.header.prop("activePattern");
    this.header.prop("pattern.fast_mode");
  }


  transform(p) {
    const pat = this.ctx.pattern;
    const dpi = UIBase.getDPI();
    const size = this.glSize;

    p[0] *= dpi;
    p[1] *= dpi;

    p[0] /= size[0];
    p[1] = (size[1] - p[1])/size[1];

    p[0] = p[0]*2.0 - 1.0;
    p[1] = p[1]*2.0 - 1.0;

    p[0] *= size[0]/size[1];

    p[0] += pat.offsetx;
    p[1] += pat.offsety;

    p[0] *= pat.scale;
    p[1] *= pat.scale;
  }

  untransform(p) {
    const pat = this.ctx.pattern;
    let dpi = UIBase.getDPI() * pat.pixel_size;

    p[0] /= pat.scale;
    p[1] /= pat.scale;

    p[0] -= pat.offsetx;
    p[1] -= pat.offsety;

    p[0] *= this.glSize[1]/canvas.glSize[0];

    p[0] = p[0]*0.5 + 0.5;
    p[1] = p[1]*0.5 + 0.5;

    p[0] *= this.glSize[0];
    p[1] *= this.glSize[1];

    p[1] = this.glSize[1] - p[1];

    p[0] /= dpi;
    p[1] /= dpi;

    //console.log(p);
  }

  init() {
    super.init();

    //let strip = this.header.row();
    //strip.noMarginsOrPadding();
    //strip.useIcons(false);

    //strip.label("Pattern:");
    //strip.prop("activePattern");

    this.addEventListener("mousedown", (e) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mousedown(e, x, y);
    })

    this.addEventListener("mousemove", (e) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mousemove(e, x, y);
    })

    this.addEventListener("mouseup", (e) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mouseup(e, x, y);
    })
  }

  _doMouseEvent(e) {
    if (!this.ctx || !this.ctx.screen) {
      console.error("_doMouseEvent: missing context and/or parent screen", this.ctx, this.ctx !== undefined ? this.ctx.screen : undefined);
      return true;
    }

    let elem = this.ctx.screen.pickElement(e.x, e.y);
    //console.log(elem);

    let ok = elem instanceof CanvasEditor;
    ok = ok || elem === this.canvas;

    return ok;
  }

  _getMouse(e) {
    //let r = this.getBoundingClientRect();
    return new Vector2([e.x - this.pos[0], e.y - this.pos[1]]);
  }

  on_mousedown(e, x, y) {
    console.log("mouse down!", x, y);

    if (e.button === 0 || eventWasTouch(e)) {
      this.ctx.api.execTool(this.ctx, `canvas.zoom(startX=${x} startY=${y} hasStartMouse=true)`);

      e.stopPropagation();
      e.preventDefault();

      return false;
    }
  }

  on_mousemove(e, x, y) {
    console.log("mouse move!", x, y);
  }

  on_mouseup(e, x, y) {
    console.log("mouse up!", x, y);
  }

  viewportDraw(canvas, gl) {
    super.viewportDraw(canvas, gl);

    this.canvas = canvas;

    gl.clearColor(0.5, 0.4, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let pat = this.ctx.pattern;
    if (pat) {
      pat._doViewportDraw(this.ctx, canvas, gl, !this._drawReset);
      this._drawReset = false;
    }

    //console.log("viewport draw!");
  }

  ensureFbos(gl, count, pixel_size = 1.0) {
    for (let i = count; i < this.fbos.length; i++) {
      this.fbos[i].destroy(gl);
    }

    this.fbos.length = count;

    let w = ~~(this.glSize[0]*pixel_size);
    let h = ~~(this.glSize[1]*pixel_size);

    for (let i = 0; i < this.fbos.length; i++) {
      let fbo = this.fbos[i];

      if (!fbo) {
        fbo = this.fbos[i] = new FBO(gl, w, h);
      } else {
        fbo.update(gl, w, h);
      }

      fbo.bind(gl);
      fbo.unbind(gl);
    }

    return this.fbos;
  }

  on_resize(size, oldsize) {
    super.on_resize(size, oldsize);

    window.redraw_viewport();
  }

  copy() {
    let ret = document.createElement(this.constructor.define().tagname);

    ret.showSliders = this.showSliders;

    return ret;
  }


  checkSliders() {
    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let digest = this._digest.reset();
    let sliders = this.ctx.pattern.sliders;

    for (let i = 0; i < sliders.length; i++) {
      digest.add(sliders[i]);
    }

    let hash = digest.get();

    if (hash !== this._last_slider_hash) {
      console.warn("sliders update in canvas detected", hash, this._last_slider_hash);

      this._last_slider_hash = hash;
      this._drawReset = true;
      window.redraw_viewport();
    }
  }

  update() {
    super.update();

    this.checkSliders();

    if (this.sliderWidget && !this.showSliders) {
      this.sliderWidget.remove();
      this.sliderWidget = undefined;
    } else if (this.ctx.pattern && !this.sliderWidget && this.showSliders) {
      console.warn("Making sliders!");

      this.sliderWidget = UIBase.createElement("sliders-widget-x");
      this.sliderWidget.setAttribute("datapath", "pattern.sliders");
      this.sliderWidget.ctx = this.ctx;

      this.sliderWidget.parentWidget = this;
      this.shadow.appendChild(this.sliderWidget);

      let pat = this.ctx.pattern;
      let def = pat.constructor.patternDef();
      this.sliderWidget.setSliderDef(def.sliderDef);

      this.sliderWidget.onchange = (e) => this.onSliderChange(e);
    }

    if (this.sliderWidget) {
      this.sliderWidget.pos[0] = this.parentWidget.pos[0] + 5;
      this.sliderWidget.pos[1] = this.parentWidget.pos[1] + 45;
    }
  }

  onSliderChange(e) {
    this.ctx.pattern.drawGen++;
    window.redraw_viewport();
  }
};

CanvasEditor.STRUCT = nstructjs.inherit(CanvasEditor, Editor) + `
  showSliders : bool;
}`;
Editor.register(CanvasEditor);
nstructjs.register(CanvasEditor);
