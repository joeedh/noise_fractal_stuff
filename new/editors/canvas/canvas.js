import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat, HotKey, KeyMap
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';
import {EditorGL} from '../editor_base_3d.js';
import {FBO} from '../../webgl/webgl.js';

export class CanvasEditor extends EditorGL {
  constructor() {
    super();

    this.showSliders = true;
    this.sliderWidget = undefined;
    this.fbos = [];

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
  }

  init() {
    super.init();

    let strip = this.header.strip();
    strip.label("Pattern:");
    strip.prop("activePattern");
  }

  viewportDraw(canvas, gl) {
    super.viewportDraw(canvas, gl);

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
    return ret;
  }


  checkSliders() {
    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let digest = this._digest.reset();
    let sliders = this.ctx.pattern.sliders;

    for (let i=0; i<sliders.length; i++) {
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
