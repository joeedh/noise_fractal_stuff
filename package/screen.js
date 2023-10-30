import {Screen, UIBase, KeyMap, HotKey, util, nstructjs} from './path.ux/pathux.js';
import {init_webgl} from './webgl/webgl.js';

export var canvas;
export var gl;

let contextGenBase = 0;

export function initGL() {
  canvas = document.createElement("canvas");
  gl = window._gl = init_webgl(canvas, {}, true);
  gl.contextGen = contextGenBase++;

  canvas.addEventListener("webglcontextrestored", (e) => {
    if (window._appstate && _appstate.ctx && _appstate.ctx.pattern) {
      _appstate.ctx.pattern.drawGen++;

      canvas.remove();

      initGL();
    }
  });

  window.redraw_viewport();

  canvas.style["position"] = "fixed";
  canvas.style["z-index"] = "-1";

  document.body.appendChild(canvas);
}

export class AppScreen extends Screen {
  constructor() {
    super();

    this.keymap = new KeyMap([
      new HotKey("S", ["CTRL"], "app.save"),
      new HotKey("O", ["CTRL"], "app.open"),
      new HotKey("Z", ["CTRL"], "app.undo"),
      new HotKey("Z", ["CTRL", "SHIFT"], "app.redo"),
      new HotKey("T", [], (ctx) => {
        ctx.canvas.showSliders ^= true;
      }),
      new HotKey("R", [], "canvas.reset_view"),
    ]);
  }

  static define() {
    return {
      tagname: 'app-screen-x'
    };
  }

  checkCanvas() {
    if (!canvas) {
      return;
    }

    let dpi = UIBase.getDPI();
    let w = ~~(this.size[0]*dpi);
    let h = ~~(this.size[1]*dpi);

    if (w === canvas.width && h === canvas.height) {
      return;
    }

    console.warn("canvas size update", w, h);

    canvas.width = w;
    canvas.height = h;

    canvas.style["width"] = (w/dpi) + "px";
    canvas.style["height"] = (h/dpi) + "px";
    canvas.style["padding"] = "0px";

    window.redraw_viewport();
  }

  update() {
    if (this.ctx && this.ctx.state) {
      this.ctx.state.update();
    }

    super.update();
    this.checkCanvas();

    let appstate = this.ctx.state;

    if (util.time_ms() - appstate.lastAutoSaveTime > 2000) {
      appstate.autoSave();
    }
  }
};

AppScreen.STRUCT = nstructjs.inherit(AppScreen, Screen) + `

}`;
nstructjs.register(AppScreen);
UIBase.register(AppScreen);

