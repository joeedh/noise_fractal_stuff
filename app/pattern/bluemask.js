import {getSearchOff} from '../util/util.js';
import {util} from '../path.ux/pathux.js';
import {Texture} from '../webgl/webgl.js';

let _bluemasks = {};
let _bluetexs = {};

export function getBlueMaskTex(gl, dimen) {
  if (dimen in _bluetexs) {
    return _bluetexs[dimen];
  }

  let tex = new Texture(gl.createTexture(), gl);
  _bluetexs[dimen] = tex;

  let idata = genBlueMask(dimen);

  tex.texImage2D(gl, gl.TEXTURE_2D, 0, gl.RGBA, dimen, dimen, 0, gl.RGBA, gl.UNSIGNED_BYTE, idata.data);

  tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  return tex;
}

export function genBlueMask(dimen) {
  if (dimen in _bluemasks) {
    return _bluemasks[dimen];
  }

  let rand = new util.MersenneRandom();
  rand.seed(0);

  let GW=0, GTOTW=1, GFINAL=2, GTOT=3;
  
  let grid = new Float64Array(dimen*dimen*GTOT);
  for (let i=0; i<grid.length; i++) {
    grid[i] = 0.0;
  }
  
  let poffs = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    
    [0, 1],
    [1, 1],
    [1, 0],
    
    [1, -1],
    [0, -1],
    [0, 0]
  ]
  
  let totpoint = dimen*dimen;
  let cells = [];
  for (let i=0; i<totpoint; i++) {
    cells.push(i*GTOT);
  }

  for (let i=0; i<cells.length; i++) {
    let ri = ~~(rand.random()*cells.length*0.9999);

    let tmp = cells[i];
    cells[i] = cells[ri];
    cells[ri] = tmp;
  }
  
  for (let i=0; i<totpoint; i++) {
    let mingi = 0;
    let minci = 0;
    let minw = 1e17;
    
    for (let ci=0; ci<cells.length; ci++) {
      let gi = cells[ci];
      let w = grid[gi+GTOTW] > 0.0 ? grid[gi] / grid[gi+GTOTW] : 0.0;// + (rand.random()-0.5)*0.001;

      if (w < minw) {
        mingi = gi;
        minw = w;
        minci = ci;
      }
    }

    //console.log("CELLS", cells.length, "minci", minci);
    
    if (cells.length > 1) {
      cells[minci] = cells[cells.length-1];
      cells[cells.length-1] = undefined;
    }
    
    cells.length--;
    
    let r = 0.9 / Math.sqrt(i + 1);
    r = Math.min(r, 0.2);

    let gi = mingi;

    let idx = gi / GTOT;
    let ix = idx % dimen;
    let iy = ~~(idx / dimen);

    let offs = getSearchOff(Math.ceil(3.0*r*dimen));

    //console.log("OFFS", offs.length, Math.ceil(r*dimen));

    grid[gi+GFINAL] = 1.0 - i / totpoint;
    grid[gi] = 1.0;

    for (let off of offs) {
      let w = off[2];

      w /= r;
      //w = w*w*(3.0 - 2.0*w);
      //w = 1.0 - Math.exp(-w*w*2.0);
      //w *= w;
      //w *= r;

      let ix2 = ix + off[0];
      let iy2 = iy + off[1];

      if (off[0] === 0.0 && off[1] === 0.0) {
        continue;
      }

      ix2 = ix2 % dimen;
      iy2 = iy2 % dimen;

      let gi2 = (iy2*dimen + ix2)*GTOT;

      if (1) {
        grid[gi2] = Math.max(grid[gi2], w);
        grid[gi2 + GTOTW] = 1.0;
      } else {
        grid[gi2] += w;
        grid[gi2+GTOTW]++;
      }
    }
  }

  console.log("Grid", grid);

  let idata = new ImageData(dimen, dimen);

  for (let gi=0; gi<grid.length; gi += GTOT) {
    let f = grid[gi+GFINAL];

    let idx = (gi/GTOT)*4;

    let x = ((gi / GTOT) % dimen) / dimen;

    //f = f > x;

    idata.data[idx] = f*255;
    idata.data[idx+1] = f*255;
    idata.data[idx+2] = f*255;
    idata.data[idx+3] = 255;
  }

  let canvas = document.createElement("canvas");
  let g = canvas.getContext("2d");
  canvas.width = canvas.height = dimen;
  g.putImageData(idata, 0, 0);

  _bluemasks[dimen] = idata;

  return idata;
}