import {
  UIBase, nstructjs, util, vectormath, math, Container, IconButton, Area,
  Vector2, Vector3, Vector4, Matrix4, Quat, HotKey, KeyMap, eventWasTouch
} from '../../path.ux/scripts/pathux.js';
import type {DataAPI, DataStruct} from '../../path.ux/scripts/pathux.js';
import type {ToolContext} from '../../core/context.js';
import {Icons} from '../icon_enum.js';

import {Editor} from '../editor_base.js';
import {EditorGL} from '../editor_base_3d.js';
import {FBO} from '../../webgl/webgl.js';
import {isRendering} from '../../core/render.js';
import type {SlidersWidget} from '../widgets.js';

export class CanvasEditor extends EditorGL {
  showSliders: boolean
  sliderWidget: SlidersWidget | undefined
  fbos: FBO[]
  canvas: HTMLCanvasElement | undefined
  gl: AppGL | undefined
  _drawReset: boolean
  _digest: util.HashDigest
  _last_slider_hash: number

  constructor() {
    super();

    this.showSliders = false;
    this.sliderWidget = undefined;
    this.fbos = [];

    this.canvas = undefined;
    this.gl = undefined;

    this._drawReset = false;
    this._digest = new util.HashDigest();
    this._last_slider_hash = 0;
  }

  static apiDefine(api: DataAPI): DataStruct {
    let st = super.apiDefine(api)

    st.bool("showSliders", "showSliders", "Show Sliders")

    return st
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

  makeHeader(container: Container<ToolContext> = this.container, addNoteArea = true, makeDraggable = false): Container<ToolContext> {
    this.doOnce(() => {
      super.makeHeader(container, addNoteArea, makeDraggable)

      const header = this.header!

      header.prop("canvas.showSliders")
      header.useIcons(true)

      header.tool("app.undo()")
      header.tool("app.redo()")

      header.tool("canvas.reset_view()")
      const zoomIn = header.tool("canvas.step_zoom(dir=1)")
      if (zoomIn instanceof IconButton) {
        zoomIn.icon = Icons.ZOOM_IN
      }
      header.tool("canvas.step_zoom(dir=-1)")

      header.useIcons(false)
      header.prop("activePattern")
      header.prop("pattern.fast_mode")
    });

    return this.header!
  }


  transform(p: Vector2, size: Vector2 = this.glSize, dpi: number = UIBase.getDPI()) {
    const pat = this.ctx.pattern;
    dpi *= pat.pixel_size;

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

  untransform(p: Vector2, size: Vector2 = this.glSize, dpi: number = UIBase.getDPI()) {
    const pat = this.ctx.pattern;
    dpi *= pat.pixel_size;

    p[0] /= pat.scale;
    p[1] /= pat.scale;

    p[0] -= pat.offsetx;
    p[1] -= pat.offsety;

    p[0] /= size[0]/size[1];

    p[0] = p[0]*0.5 + 0.5;
    p[1] = p[1]*0.5 + 0.5;

    p[0] *= size[0];
    p[1] = (1.0 - p[1])*size[1];

    p[0] *= dpi;
    p[1] *= dpi;
  }

  init() {
    super.init();

    this.addEventListener("mousewheel", (e: Event) => {
      const we = e as WheelEvent
      console.log(we);
      let dy = -we.deltaY;

      dy = 1.0 + we.deltaY/4000.0;
      dy = Math.min(Math.max(dy, 0.75), 1.25);

      console.log(dy);

      let pat = this.ctx.pattern;

      pat.offsetx *= pat.scale;
      pat.offsety *= pat.scale;

      pat.scale *= dy;

      pat.offsetx /= pat.scale;
      pat.offsety /= pat.scale;

      pat.drawGen++;
      window.redraw_viewport();
    });
    //let strip = this.header.row();
    //strip.noMarginsOrPadding();
    //strip.useIcons(false);

    //strip.label("Pattern:");
    //strip.prop("activePattern");

    this.addEventListener("mousedown", (e: MouseEvent) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mousedown(e, x, y);
    })

    this.addEventListener("mousemove", (e: MouseEvent) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mousemove(e, x, y);
    })

    this.addEventListener("mouseup", (e: MouseEvent) => {
      if (!this._doMouseEvent(e)) {
        return;
      }

      let [x, y] = this._getMouse(e);
      return this.on_mouseup(e, x, y);
    })
  }

  _doMouseEvent(e: MouseEvent): boolean {
    if (!this.ctx || !this.ctx.screen) {
      console.error("_doMouseEvent: missing context and/or parent screen", this.ctx, this.ctx !== undefined
                                                                                     ? this.ctx.screen : undefined);
      return true;
    }

    let elem = this.ctx.screen.pickElement(e.x, e.y);
    //console.log(elem);

    let ok = elem instanceof CanvasEditor;
    ok = ok || elem === this.canvas;

    return ok;
  }

  _getMouse(e: MouseEvent): Vector2 {
    //let r = this.getBoundingClientRect();
    return new Vector2([e.x - this.pos![0], e.y - this.pos![1]]);
  }

  on_mousedown(e: MouseEvent, x: number, y: number) {
    console.log("mouse down!", x, y);

    if (isRendering()) {
      return;
    }

    if (e.button === 0 || eventWasTouch(e)) {
      this.ctx.api.execTool(this.ctx, `canvas.zoom(startX=${x} startY=${y} hasStartMouse=true)`);

      e.stopPropagation();
      e.preventDefault();

      return false;
    }
  }

  on_mousemove(e: MouseEvent, x: number, y: number) {
    //console.log("mouse move!", x, y);
  }

  on_mouseup(e: MouseEvent, x: number, y: number) {
    console.log("mouse up!", x, y);
  }

  viewportDraw(canvas: HTMLCanvasElement, gl: AppGL) {
    if (gl.contextBad) {
      return;
    }

    if (isRendering()) {
      return;
    }
    super.viewportDraw(canvas, gl);

    this.gl = gl;
    this.canvas = canvas;

    gl.clearColor(0.5, 0.4, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let pat = this.ctx.pattern;
    if (pat) {
      let time = util.time_ms();

      //while (util.time_ms() - time < 10) {
      pat._doViewportDraw(this.ctx, canvas, gl, !this._drawReset);
      this._drawReset = false;
      //}
    }

    //console.log("viewport draw!");
  }

  ensureFbos(gl: AppGL, count: number, pixel_size = 1.0, fboOutputs = 1) {
    //prune any extra fbos
    for (let i = count; i < this.fbos.length; i++) {
      this.fbos[i].destroy(gl);
    }

    let updated = false;

    this.fbos.length = count;

    let w = ~~(this.glSize[0]*pixel_size);
    let h = ~~(this.glSize[1]*pixel_size);

    for (let i = 0; i < this.fbos.length; i++) {
      let fbo = this.fbos[i];

      if (!fbo) {
        fbo = this.fbos[i] = new FBO(gl, w, h);
        fbo.extraBuffers = fboOutputs - 1;

        updated = true;
      } else {
        updated = updated || (fbo.update(gl, w, h) ?? false);
      }

      fbo.bind(gl);
      fbo.unbind(gl);
    }

    return updated;
  }

  on_resize(size: number[] | Vector2, oldsize?: number[] | Vector2) {
    super.on_resize(size)

    window.redraw_viewport()
  }

  copy() {
    let ret = UIBase.createElement<CanvasEditor>(this.constructor.define().tagname)

    ret.showSliders = this.showSliders

    return ret
  }


  checkSliders() {
    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let digest = this._digest.reset();
    let sliders = this.ctx.pattern.sliders;
    let sdefs = this.ctx.pattern.constructor.patternDef().sliderDef;

    for (let i = 0; i < sliders.length; i++) {
      const sdef = sdefs[i]
      if (typeof sdef === "object" && sdef.noReset) {
        continue;
      }

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

      const sliderWidget = this.sliderWidget = UIBase.createElement<SlidersWidget>("sliders-widget-x")
      sliderWidget.setAttribute("datapath", "pattern.sliders")
      sliderWidget.ctx = this.ctx

      sliderWidget.parentWidget = this
      this.shadow.appendChild(sliderWidget)

      let pat = this.ctx.pattern
      let def = pat.constructor.patternDef()
      sliderWidget.setSliderDef(def.sliderDef)

      sliderWidget.onchange = (slideri: unknown) => this.onSliderChange(slideri as number)
    }

    const parent = this.parentWidget
    const parentPos = parent instanceof Area ? parent.pos : undefined
    if (this.sliderWidget && parentPos) {
      this.sliderWidget.pos[0] = parentPos[0]! + 5
      this.sliderWidget.pos[1] = parentPos[1]! + 45
    }
  }

  onSliderChange(slideri: number) {
    let pat = this.ctx.pattern;
    let sdef = pat.constructor.getPatternDef().sliderDef[slideri];

    if (!sdef || typeof sdef === "string" || !sdef.noReset) {
      this.ctx.pattern.drawGen++;
      window.redraw_viewport();
    }
  }
};

CanvasEditor.STRUCT = nstructjs.inherit(CanvasEditor, Editor) + `
  showSliders : bool;
}`;
Editor.register(CanvasEditor);
nstructjs.register(CanvasEditor);
