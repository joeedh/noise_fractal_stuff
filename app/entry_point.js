import * as app from './core/appstate.js';
import {
  nstructjs, ToolOp, setIconManager, setIconMap, setTheme,
  IconManager, util, vectormath, UIBase, cconst
} from './path.ux/pathux.js';
import {Icons} from './editors/icon_enum.js';
import {theme} from './editors/theme.js';
import {initGL, canvas, gl} from './screen.js';
import {initPresets} from './pattern/preset.js';
import {resolveURL} from './util/urlutil.js';

let pathux_config = {
  simpleNumSliders: true,
  useNumSliderTextboxes: true,
  autoLoadSplineTemplates: false,
  DEBUG: {
    ...cconst.DEBUG,
    modalEvents: true,
    datapaths: true
  }
};

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

    cconst.loadConstants(pathux_config);

    nstructjs.validateStructs();

    let img = document.createElement("img");
    img.src = resolveURL("assets/iconsheet.svg");

    img.onload = () => {
      accept();
    }

    window._icon_image = img;
    console.log(img);

    let sizes = [16, 24, 12, 64, 128]
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
  let last_time = util.time_ms();
  let skip = 0;

  let fps = 30.0;
  let skip_ma = new util.MovingAvg(5)

  let animreq = undefined;

  function draw() {
    animreq = undefined;

    let time = util.time_ms();

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

    /* Force GPU to fully flush. */
    gl.flush()

    /* Sample GPU just to be sure; some systems ignore gl.flush(). */
    let pix = new Uint8Array(4);
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix);

    const limit_gpu = window._appstate && _appstate.model && _appstate.model.limitGPUPower;

    if (limit_gpu) {
      let factor = _appstate.model.gpuSkipFactor * 12.0;
      let goal = 1000.0 / 30.0;

      time = util.time_ms() - time;
      console.log("time:", time.toFixed(2) + "ms");

      if (time > goal) {
        skip = (time - goal) * factor;
        skip = Math.min(skip, 1500);
        skip = skip_ma.add(skip);

        console.log("skip:", skip)
      } else {
        skip = 0.0
      }
    } else {
      skip = 0.0;
    }
  }

  window.force_redraw_viewport = function () {
    if (animreq !== undefined) {
      return;
    }
    animreq = requestAnimationFrame(draw);
  }

  window.redraw_viewport = function () {
    if (!window._appstate || !_appstate.ctx || !_appstate.ctx.pattern) {
      return;
    }

    let pat = _appstate.ctx.pattern;

    //fixed fps not running? then draw
    if (!pat.isDrawing) {
      window.force_redraw_viewport();
    }
  }

  /* start main rendering loop */
  window.setInterval(() => {
    if (!window._appstate || !_appstate.ctx || !_appstate.ctx.pattern) {
      return;
    }

    if (animreq) {
      return;
    }

    if (skip !== 0 && util.time_ms() - last_time < skip) {
      return;
    }

    let pat = _appstate.ctx.pattern;
    if (pat.isDrawing) {
      window.force_redraw_viewport();
      last_time = util.time_ms();
    }
  }, 1000.0 / fps);
}

export function start() {
  setupPathUX().then(() => {
    setupDrawGlobals();
    initGL();
    initPresets();

    app.start();
  });
}