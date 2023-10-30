import * as util from '../util/util.js';
import * as vectormath from '../util/vectormath.js';
import {Vector3, Vector4} from '../util/vectormath.js';

let rgb_to_hsv_rets = new util.cachering(() => [0, 0, 0], 64);

export function rgb_to_hsv(r, g, b) {
  let computedH = 0;
  let computedS = 0;
  let computedV = 0;

  if (r == null || g == null || b == null ||
    isNaN(r) || isNaN(g) || isNaN(b)) {
    throw new Error(`Please enter numeric RGB values! r: ${r} g: ${g} b: ${b}`);
  }
  /*
  if (r<0 || g<0 || b<0 || r>1.0 || g>1.0 || b>1.0) {
   throw new Error('RGB values must be in the range 0 to 1.0');
   return;
  }//*/

  let minRGB = Math.min(r, Math.min(g, b));
  let maxRGB = Math.max(r, Math.max(g, b));

  // Black-gray-white
  if (minRGB === maxRGB) {
    computedV = minRGB;

    let ret = rgb_to_hsv_rets.next();
    ret[0] = 0, ret[1] = 0, ret[2] = computedV;
    return ret;
  }

  // Colors other than black-gray-white:
  let d = (r === minRGB) ? g - b : ((b === minRGB) ? r - g : b - r);
  let h = (r === minRGB) ? 3 : ((b === minRGB) ? 1 : 5);

  computedH = (60*(h - d/(maxRGB - minRGB)))/360.0;
  computedS = (maxRGB - minRGB)/maxRGB;
  computedV = maxRGB;

  let ret = rgb_to_hsv_rets.next();
  ret[0] = computedH, ret[1] = computedS, ret[2] = computedV;
  return ret;
}

let hsv_to_rgb_rets = new util.cachering(() => [0, 0, 0], 64);

export function hsv_to_rgb(h, s, v) {
  let c = 0, m = 0, x = 0;
  let ret = hsv_to_rgb_rets.next();

  ret[0] = ret[1] = ret[2] = 0.0;
  h *= 360.0;

  c = v*s;
  x = c*(1.0 - Math.abs(((h/60.0)%2) - 1.0));
  m = v - c;
  let color;

  function RgbF_Create(r, g, b) {
    ret[0] = r;
    ret[1] = g;
    ret[2] = b;

    return ret;
  }

  if (h >= 0.0 && h < 60.0) {
    color = RgbF_Create(c + m, x + m, m);
  } else if (h >= 60.0 && h < 120.0) {
    color = RgbF_Create(x + m, c + m, m);
  } else if (h >= 120.0 && h < 180.0) {
    color = RgbF_Create(m, c + m, x + m);
  } else if (h >= 180.0 && h < 240.0) {
    color = RgbF_Create(m, x + m, c + m);
  } else if (h >= 240.0 && h < 300.0) {
    color = RgbF_Create(x + m, m, c + m);
  } else if (h >= 300.0) {
    color = RgbF_Create(c + m, m, x + m);
  } else {
    color = RgbF_Create(m, m, m);
  }

  return color;
}

let rgb_to_cmyk_rets = util.cachering.fromConstructor(Vector4, 512);
let cmyk_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);

export function cmyk_to_rgb(c, m, y, k) {
  let ret = cmyk_to_rgb_rets.next();

  if (k === 1.0) {
    ret.zero();
    return ret;
  }

  c = c - c*k + k;
  m = m - m*k + k;
  y = y - y*k + k;

  ret[0] = 1.0 - c;
  ret[1] = 1.0 - m;
  ret[2] = 1.0 - y;

  return ret;
}

export function rgb_to_cmyk(r, g, b) {
  //CMYK and CMY values from 0 to 1
  let ret = rgb_to_cmyk_rets.next();

  let C = 1.0 - r;
  let M = 1.0 - g;
  let Y = 1.0 - b;

  let var_K = 1

  if (C < var_K) var_K = C
  if (M < var_K) var_K = M
  if (Y < var_K) var_K = Y
  if (var_K === 1) { //Black
    C = 0
    M = 0
    Y = 0
  } else {
    C = (C - var_K)/(1 - var_K)
    M = (M - var_K)/(1 - var_K)
    Y = (Y - var_K)/(1 - var_K)
  }

  let K = var_K

  ret[0] = C;
  ret[1] = M;
  ret[2] = Y;
  ret[3] = K;

  return ret;
}

