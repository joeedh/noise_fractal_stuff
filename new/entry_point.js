import * as app from './core/appstate.js';
import {
  nstructjs, ToolOp, setIconManager, setIconMap, setTheme, IconManager, util, vectormath, UIBase
} from './path.ux/pathux.js';
import {Icons} from './editors/icon_enum.js';
import {theme} from './editors/theme.js';
import {initGL, canvas, gl} from './screen.js';
import {initPresets} from './pattern/preset.js';

function setupToolOpBase() {
  ToolOp.prototype.undoPre = function (ctx) {
    this._undo = ctx.state.undoSave();
  }

  ToolOp.prototype.undo = function (ctx) {
    ctx.state.undoLoad(this._undo);
  }

  ToolOp.prototype.calcUndoMem = function (ctx) {
    if (this._undo) {
      return this._undo.byteLength;
    }
  }
}

export function setupPathUX() {
  return new Promise((accept, reject) => {
    setupToolOpBase();

    nstructjs.validateStructs();

    let img = document.createElement("img");
    img.src = "../assets/iconsheet.svg";

    img.onload = () => {
      accept();
    }

    window._icon_image = img;
    console.log(img);

    let sizes = [16, 24, 32, 64, 128]
    let images = [];
    let sizes2 = [];

    for (let i = 0; i < sizes.length; i++) {
      images.push(img);
      sizes2.push([32, sizes[i]]);
    }

    let icons = new IconManager(images, sizes2, 16);

    setIconManager(icons);
    setIconMap(Icons);
    setTheme(theme);
  });
}

export function setupDrawGlobals() {
  let animreq = undefined;

  function draw() {
    animreq = undefined;

    gl.scissor(0, 0, canvas.width, canvas.height);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (let sarea of _appstate.screen.sareas) {
      let area = sarea.area;

      if (area.constructor.define().has3D) {
        area.push_ctx_active();
        area.viewportDraw(canvas, gl);
        area.pop_ctx_active();
      }
    }
  }

  window.redraw_viewport = function () {
    if (animreq !== undefined) {
      return;
    }

    animreq = requestAnimationFrame(draw);
  }

  /* start main rendering loop */
  window.setInterval(() => {
    window.redraw_viewport();
  }, 33);
}

export function start() {
  setupPathUX().then(() => {
    setupDrawGlobals();
    initGL();
    initPresets();

    app.start();
  });
}