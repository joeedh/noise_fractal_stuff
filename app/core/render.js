import {
  Vector2, Vector3, Vector4,
  Quat, Matrix4, util, math,
  message, progbarNote
} from '../path.ux/pathux.js';
import {FBO} from '../webgl/webgl.js';

export class RenderTile {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.done = false;
    this.idata = new ImageData(w, h);
  }
}

export class RenderJob {
  constructor(width, height, tilesize) {
    this.tiles = [];
    this.readyTiles = [];
    this.totTiles = 0;

    this._stop = false;

    this.tilesize = tilesize;
    this.ctx = undefined;
    this.done = false;
    this.size = [width, height];
    this.fbo = undefined;
  }

  cancel() {
    this._stop = true;
  }

  start(ctx) {
    this.ctx = ctx;

    let gl = ctx.canvas.gl;
    this.fbo = new FBO(gl, this.tilesize, this.tilesize);

    this.pattern = ctx.pattern.copy();

    let tx = Math.ceil(this.size[0]/this.tilesize + 0.0001);
    let ty = Math.ceil(this.size[1]/this.tilesize + 0.0001);
    let tilesize = this.tilesize;
    let w = this.size[0], h = this.size[1];

    //console.log("TX, TY", tx, ty);

    for (let i = 0; i < ty; i++) {
      for (let j = 0; j < tx; j++) {
        let x = j*tilesize;
        let y = i*tilesize;

        let x2 = x + tilesize;
        let y2 = y + tilesize;

        //console.log(x, y, x2, y2, tilesize);

        x2 = Math.min(x2, w);
        y2 = Math.min(y2, h);

        if (x2 === x || y2 === y) {
          continue;
        }

        //let tile = new RenderTile(x, y, x2 - x, y2 - y);
        let tile = new RenderTile(x, y, tilesize, tilesize); //x2 - x, y2 - y);
        this.tiles.push(tile);
      }
    }

    this.totTiles = this.tiles.length;

    return new Promise((accept, reject) => {
      let this2 = this;
      function* loop(timerid) {
        while (this2.tiles.length > 0) {
          let perc = 1.0 - this2.tiles.length/this2.totTiles;

          if (this2._stop) {
            window.clearInterval(timerid);
            renderJob = undefined;
            progbarNote(this2.ctx.screen, "render", 1.0);
            return;
          }

          //perc = `${perc}%`;
          progbarNote(this2.ctx.screen, "render", perc);
          console.error((100.0*perc).toFixed(1) + "%");

          let tile = this2.tiles.pop();

          for (let step of this2.renderTile(tile)) {
            yield;
          }

          yield;
          this2.readyTiles.push(tile);
        }

        window.clearInterval(timerid);

        this2.finish();
        accept();
      }

      let job;

      let timerid = window.setInterval(() => {
        if (!job) {
          job = loop()[Symbol.iterator]();
        }

        let time = util.time_ms();

        while (util.time_ms() - time < 150) {
          let next = job.next();

          if (next.done) {
            window.clearInterval(timerid);
          //  break;
          }
        }
      }, 155);
    });
  }

  finish() {
    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");

    canvas.width = this.size[0];
    canvas.height = this.size[1];

    for (let tile of this.readyTiles) {
      g.putImageData(tile.idata, tile.x, tile.y);
    }

    let canvas2 = document.createElement("canvas");
    let g2 = canvas2.getContext("2d");

    canvas2.width = this.size[0];
    canvas2.height = this.size[1];

    g2.translate(0, this.size[1]);
    g2.scale(1, -1);
    g2.drawImage(canvas, 0, 0);

    let header = 'data:image/png;base64,';

    let url = canvas2.toDataURL();

    url = url.slice(header.length, url.length);

    url = atob(url);

    let data = new Uint8Array(url.length);
    for (let i = 0; i < url.length; i++) {
      data[i] = url.charCodeAt(i);
    }

    let blob = new Blob([data.buffer], {type: "image/png"});
    url = URL.createObjectURL(blob)


    let a = document.createElement("a")
    a.setAttribute("href", url);
    a.setAttribute("download", "image.png");
    a.click();

    //window.open(url);
    //console.log(url, this.size);
    progbarNote(this.ctx.screen, "render", 1.0);
  }

  * renderTileIntern(tile) {
    let ctx = this.ctx;
    let editor = ctx.canvas;
    let pattern = this.pattern;
    let gl = editor.gl;
    let size = this.size;

    pattern.pixel_size = 1.0;
    pattern.fast_mode = false;

    let uv1 = new Vector2([tile.x, tile.y]);
    uv1.div(size);

    let uv2 = new Vector2([tile.x, tile.y]);
    uv2.add([tile.width, tile.height]);
    uv2.div(size);

    editor.glPos[0] = editor.glPos[1] = 0.0;
    editor.glSize[0] = tile.width;
    editor.glSize[1] = tile.height;

    if (0) {
      let rx = tile.width/this.size[0];
      let scale = pattern.scale;

      pattern.offsetx *= scale;
      pattern.offsety *= scale;

      scale = pattern.scale = pattern.scale/rx;

      pattern.offsetx /= scale;
      pattern.offsety /= scale;
    }

    pattern.drawGen++;

    for (let i = 0; i < pattern.max_samples; i++) {
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, tile.width, tile.height);

      pattern._doViewportDraw(ctx, editor.canvas, editor.gl, true,
        false, null, [new Vector2(uv1), new Vector2(uv2)], new Vector2(this.size));
      //pattern._doViewportDraw(ctx, editor.canvas, editor.gl, true,
      //  true, undefined, [[0,0], [1,1]], [tile.width, tile.height]);

      yield;
    }

    let fbo = this.fbo;

    console.log(uv1[0], uv1[1], uv2[0], uv2[1]);

    fbo.bind(gl);
    pattern._doViewportDraw(ctx, editor.canvas, editor.gl, true,
      true, fbo);
    //pattern._doViewportDraw(ctx, editor.canvas, editor.gl, true,
    //  true, undefined, [[0,0], [1,1]], [tile.width, tile.height]);

    gl.finish();
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo.fbo);

    let fpixels = new Float32Array(tile.width*tile.height*4);
    gl.readPixels(0, 0, tile.width, tile.height, gl.RGBA, gl.FLOAT, fpixels);

    let idata = tile.idata.data;

    for (let i = 0; i < fpixels.length; i++) {
      idata[i] = fpixels[i]*255.0;
    }

    fbo.unbind(gl);

    yield;
  }

  * renderTile(tile) {
    //console.log("rendering tile", tile);
    let ctx = this.ctx;
    let editor = ctx.canvas;
    let pattern = this.pattern;

    let old = {
      scale      : pattern.scale,
      offsetx    : pattern.offsetx,
      offsety    : pattern.offsety,
      pixel_size : pattern.pixel_size,
      fast_mode  : pattern.fast_mode,
      renderTiles: pattern.renderTiles,
    };

    try {
      for (let step of this.renderTileIntern(tile)) {
        yield;
      }
    } catch (error) {
      console.log(error.stack);
      console.warn(error.message);
    }

    pattern.pixel_size = old.pixel_size;
    pattern.offsetx = old.offsetx;
    pattern.offsety = old.offsety;
    pattern.scale = old.scale;
    pattern.fast_mode = old.fast_mode;
    pattern.renderTiles = old.renderTiles;
  }
}

export var renderJob = undefined;

export function render(ctx, width, height, tilesize = 512) {
  return new Promise((accept, reject) => {
    if (renderJob) {
      ctx.message("already rendering");
      reject("already rendering");

      return;
    }

    renderJob = new RenderJob(width, height, tilesize);
    renderJob.start(ctx).then((res) => {
      renderJob = undefined;
      accept(res);
    });

    window._renderJob = renderJob;
  });
}

export function isRendering() {
  return renderJob !== undefined;
}

export function abortRendering() {
  if (renderJob) {
    renderJob.cancel();
  }
}

