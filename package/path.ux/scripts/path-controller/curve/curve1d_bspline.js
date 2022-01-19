"use strict";

import {nstructjs} from "../util/struct.js";

import * as util from '../util/util.js';
//import * as ui_base from './ui_base.js';
import * as vectormath from '../util/vectormath.js';
//import {EventDispatcher} from "../util/events.js";

let Vector2 = vectormath.Vector2;

export const SplineTemplates = {
  CONSTANT      : 0,
  LINEAR        : 1,
  SHARP         : 2,
  SQRT          : 3,
  SMOOTH        : 4,
  SMOOTHER      : 5,
  SHARPER       : 6,
  SPHERE        : 7,
  REVERSE_LINEAR: 8,
  GUASSIAN      : 9
};

const templates = {
  [SplineTemplates.CONSTANT]      : [
    [1, 1], [1, 1]
  ],
  [SplineTemplates.LINEAR]        : [
    [0, 0], [1, 1]
  ],
  [SplineTemplates.SHARP]         : [
    [0, 0], [0.9999, 0.0001], [1, 1]
  ],
  [SplineTemplates.SQRT]          : [
    [0, 0], [0.05, 0.25], [0.33, 0.65], [1, 1]
  ],
  [SplineTemplates.SMOOTH]        : [
    "DEG", 2, [0, 0], [1.0/3.0, 0], [2.0/3.0, 1.0], [1, 1]
  ],
  [SplineTemplates.SMOOTHER]      : [
    "DEG", 6, [0, 0], [1.0/2.25, 0], [2.0/3.0, 1.0], [1, 1]
  ],
  [SplineTemplates.SHARPER]       : [
    [0, 0], [0.3, 0.03], [0.7, 0.065], [0.9, 0.16], [1, 1]
  ],
  [SplineTemplates.SPHERE]        : [
    [0, 0], [0.01953, 0.23438], [0.08203, 0.43359], [0.18359, 0.625], [0.35938, 0.81641], [0.625, 0.97656], [1, 1]
  ],
  [SplineTemplates.REVERSE_LINEAR]: [
    [0, 1], [1, 0]
  ],
  [SplineTemplates.GUASSIAN]: [
    "DEG", 5, [0, 0], [0.17969, 0.007], [0.48958, 0.01172], [0.77995, 0.99609], [1, 1]
  ]
};

//is initialized below
export const SplineTemplateIcons = {};

let RecalcFlags = {
  BASIS: 1,
  FULL : 2,
  ALL  : 3,

  //private flag
  FULL_BASIS: 4
}

export function mySafeJSONStringify(obj) {
  return JSON.stringify(obj.toJSON(), function (key) {
    let v = this[key];

    if (typeof v === "number") {
      if (v !== Math.floor(v)) {
        v = parseFloat(v.toFixed(5));
      } else {
        v = v;
      }
    }

    return v;
  });
}

export function mySafeJSONParse(buf) {
  return JSON.parse(buf, (key, val) => {

  });
};

window.mySafeJSONStringify = mySafeJSONStringify;


let bin_cache = {};
window._bin_cache = bin_cache;

let eval2_rets = util.cachering.fromConstructor(Vector2, 32);

/*
  I hate these stupid curve widgets.  This horrible one here works by
  root-finding the x axis on a two dimensional b-spline (which works
  surprisingly well).
*/

function bez3(a, b, c, t) {
  let r1 = a + (b - a)*t;
  let r2 = b + (c - b)*t;

  return r1 + (r2 - r1)*t;
}

function bez4(a, b, c, d, t) {
  let r1 = bez3(a, b, c, t);
  let r2 = bez3(b, c, d, t);

  return r1 + (r2 - r1)*t;
}

export function binomial(n, i) {
  if (i > n) {
    throw new Error("Bad call to binomial(n, i), i was > than n");
  }

  if (i === 0 || i === n) {
    return 1;
  }

  let key = "" + n + "," + i;

  if (key in bin_cache)
    return bin_cache[key];

  let ret = binomial(n - 1, i - 1) + bin(n - 1, i);
  bin_cache[key] = ret;

  return ret;
}

window.bin = binomial;

import {CurveFlags, TangentModes, CurveTypeData} from './curve1d_base.js';

export class Curve1DPoint extends Vector2 {
  constructor(co) {
    super(co);

    this.rco = new Vector2(co);
    this.sco = new Vector2(co);

    //for transform
    this.startco = new Vector2();
    this.eid = -1;
    this.flag = 0;

    this.tangent = TangentModes.SMOOTH;

    Object.seal(this);
  }

  set deg(v) {
    console.warn("old file data detected");
  }

  copy() {
    let ret = new Curve1DPoint(this);

    ret.tangent = this.tangent;
    ret.flag = this.flag;
    ret.eid = this.eid;

    ret.startco.load(this.startco);
    ret.rco.load(this.rco);
    ret.sco.load(this.sco);

    return ret;
  }

  toJSON() {
    return {
      0      : this[0],
      1      : this[1],

      eid    : this.eid,
      flag   : this.flag,
      tangent: this.tangent,

      rco    : this.rco
    };
  }

  static fromJSON(obj) {
    let ret = new Curve1DPoint(obj);

    ret.eid = obj.eid;
    ret.flag = obj.flag;
    ret.tangent = obj.tangent;

    ret.rco.load(obj.rco);

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.sco.load(this);
    this.rco.load(this);

    splineCache.update(this);
  }
};
Curve1DPoint.STRUCT = `
Curve1DPoint {
  0       : float;
  1       : float;
  eid     : int;
  flag    : int;
  tangent : int;
  rco     : vec2;
}
`;
nstructjs.register(Curve1DPoint);

let _udigest = new util.HashDigest();

class BSplineCache {
  constructor() {
    this.curves = [];
    this.map = new Map();
    this.maxCurves = 32;
    this.gen = 0;
  }

  limit() {
    if (this.curves.length <= this.maxCurves) {
      return;
    }

    this.curves.sort((a, b) => b.cache_w - a.cache_w);
    while (this.curves.length > this.maxCurves) {
      let curve = this.curves.pop();
      this.map.delete(curve.calcHashKey());
    }
  }

  has(curve) {
    let curve2 = this.map.get(curve.calcHashKey());
    return curve2 && curve2.equals(curve);
  }

  get(curve) {
    let key = curve.calcHashKey();
    curve._last_cache_key = key;

    let curve2 = this.map.get(key);
    if (curve2 && curve2.equals(curve)) {
      curve2.cache_w = this.gen++;
      return curve2;
    }

    curve2 = curve.copy();
    curve2._last_cache_key = key;

    curve2.updateKnots();
    curve2.regen_basis();
    curve2.regen_hermite();

    this.map.set(curve2);
    this.curves.push(curve2);

    curve2.cache_w = this.gen++;

    this.limit();

    return curve2;
  }

  _remove(key) {
    let curve = this.map.get(key);
    this.map.delete(key);
    this.curves.remove(curve);
  }

  update(curve) {
    let key = curve._last_cache_key;

    if (this.map.has(key)) {
      this._remove(curve);
      this.get(curve);
    }
  }
}

let splineCache = new BSplineCache();
window._splineCache = splineCache;

class BSplineCurve extends CurveTypeData {
  constructor() {
    super();

    this.cache_w = 0;
    this._last_cache_key = 0;

    this._last_update_key = "";

    this.fastmode = false;
    this.points = [];
    this.length = 0;
    this.interpolating = false;

    this.range = [new Vector2([0, 1]), new Vector2([0, 1])];

    this._ps = [];
    this.hermite = [];
    this.fastmode = false;

    this.deg = 6;
    this.recalc = RecalcFlags.ALL;
    this.basis_tables = [];
    this.eidgen = new util.IDGen();

    this.add(0, 0);
    this.add(1, 1);

    this.mpos = new Vector2();

    this.on_mousedown = this.on_mousedown.bind(this);
    this.on_mousemove = this.on_mousemove.bind(this);
    this.on_mouseup = this.on_mouseup.bind(this);
    this.on_keydown = this.on_keydown.bind(this);
    this.on_touchstart = this.on_touchstart.bind(this);
    this.on_touchmove = this.on_touchmove.bind(this);
    this.on_touchend = this.on_touchend.bind(this);
    this.on_touchcancel = this.on_touchcancel.bind(this);
  }

  calcHashKey(digest = _udigest.reset()) {
    let d = digest;

    super.calcHashKey(d);

    d.add(this.deg);
    d.add(this.interpolating);

    for (let p of this.points) {
      let x = ~~(p[0]*1024);
      let y = ~~(p[1]*1024);

      d.add(x);
      d.add(y);
      d.add(p.tangent); //is an enum
    }

    d.add(this.range[0][0]);
    d.add(this.range[0][1]);
    d.add(this.range[1][0]);
    d.add(this.range[1][1]);

    return d.get();
  }

  copyTo(b) {
    b.deg = this.deg;
    b.interpolating = this.interpolating;
    b.fastmode = this.fastmode;

    for (let p of this.points) {
      let p2 = p.copy();

      b.points.push(p2);
    }

    return b;
  }

  copy() {
    let curve = new BSplineCurve();
    this.copyTo(curve);
    return curve;
  }

  equals(b) {
    if (b.type !== this.type) {
      return false;
    }

    let bad = this.points.length !== b.points.length;

    bad = bad || this.deg !== b.deg;
    bad = bad || this.interpolating !== b.interpolating;

    if (bad) {
      return false;
    }

    for (let i = 0; i < this.points.length; i++) {
      let p1 = this.points[i];
      let p2 = b.points[i];

      let dist = p1.vectorDistance(p2);

      if (p1.vectorDistance(p2) > 0.00001) {
        return false;
      }

      if (p1.tangent !== p2.tangent) {
        return false;
      }
    }

    return true;
  }

  static define() {
    return {
      uiname: "B-Spline",
      name  : "bspline"
    }
  }

  remove(p) {
    let ret = this.points.remove(p);
    this.length = this.points.length;

    return ret;
  }

  add(x, y, no_update = false) {
    let p = new Curve1DPoint();
    this.recalc = RecalcFlags.ALL;

    p.eid = this.eidgen.next();

    p[0] = x;
    p[1] = y;

    p.sco.load(p);
    p.rco.load(p);

    this.points.push(p);
    if (!no_update) {
      this.update();
    }

    this.length = this.points.length;

    return p;
  }

  update() {
    super.update();
  }

  _sortPoints() {
    if (!this.interpolating) {
      for (let i = 0; i < this.points.length; i++) {
        this.points[i].rco.load(this.points[i]);
      }
    }

    this.points.sort(function (a, b) {
      return a[0] - b[0];
    });

    return this;
  }

  updateKnots(recalc = true, points=this.points) {
    if (recalc) {
      this.recalc = RecalcFlags.ALL;
    }

    this._sortPoints();

    this._ps = [];
    if (points.length < 2) {
      return;
    }
    let a = points[0][0], b = points[points.length - 1][0];

    for (let i = 0; i < points.length - 1; i++) {
      this._ps.push(points[i]);
    }

    if (points.length < 3) {
      return;
    }

    let l1 = points[points.length - 1];
    let l2 = points[points.length - 2];

    let p = l1.copy();
    p.rco[0] = l1.rco[0] - 0.00004;
    p.rco[1] = l2.rco[1] + (l1.rco[1] - l2.rco[1])/3.0;
    //this._ps.push(p);

    p = l1.copy();
    p.rco[0] = l1.rco[0] - 0.00003;
    p.rco[1] = l2.rco[1] + (l1.rco[1] - l2.rco[1])/3.0;
    //this._ps.push(p);

    p = l1.copy();
    p.rco[0] = l1.rco[0] - 0.00001;
    p.rco[1] = l2.rco[1] + (l1.rco[1] - l2.rco[1])/3.0;
    this._ps.push(p);

    p = l1.copy();
    p.rco[0] = l1.rco[0] - 0.00001;
    p.rco[1] = l2.rco[1] + (l1.rco[1] - l2.rco[1])*2.0/3.0;
    this._ps.push(p);

    this._ps.push(l1);

    if (!this.interpolating) {
      for (let i = 0; i < this._ps.length; i++) {
        this._ps[i].rco.load(this._ps[i]);
      }
    }

    for (let i = 0; i < points.length; i++) {
      let p = points[i];
      let x = p[0], y = p[1];//this.evaluate(x);

      p.sco[0] = x;
      p.sco[1] = y;
    }
  }

  toJSON() {
    this._sortPoints();

    let ret = super.toJSON();

    ret = Object.assign(ret, {
      points       : this.points.map(p => p.toJSON()),
      deg          : this.deg,
      interpolating: this.interpolating,
      eidgen       : this.eidgen.toJSON(),
      range        : this.range
    });

    return ret;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.interpolating = obj.interpolating;
    this.deg = obj.deg;

    this.length = 0;
    this.points = [];
    this._ps = [];

    if (obj.range) {
      this.range = [new Vector2(obj.range[0]), new Vector2(obj.range[1])];
    }

    this.hightlight = undefined;
    this.eidgen = util.IDGen.fromJSON(obj.eidgen);
    this.recalc = RecalcFlags.ALL;
    this.mpos = [0, 0];

    for (let i = 0; i < obj.points.length; i++) {
      this.points.push(Curve1DPoint.fromJSON(obj.points[i]));
    }

    this.updateKnots();
    this.redraw();

    return this;
  }

  basis(t, i) {
    if (this.recalc & RecalcFlags.FULL_BASIS) {
      return this._basis(t, i);
    }

    if (this.recalc & RecalcFlags.BASIS) {
      this.regen_basis();
      this.recalc &= ~RecalcFlags.BASIS;
    }

    i = Math.min(Math.max(i, 0), this._ps.length - 1);
    t = Math.min(Math.max(t, 0.0), 1.0)*0.999999999;

    let table = this.basis_tables[i];

    let s = t*(table.length/4)*0.99999;

    let j = ~~s;
    s -= j;

    j *= 4;
    return table[j] + (table[j + 3] - table[j])*s;

    return bez4(table[j], table[j + 1], table[j + 2], table[j + 3], s);
  }

  reset(empty = false) {
    this.length = 0;
    this.points = [];
    this._ps = [];

    if (!empty) {
      this.add(0, 0, true);
      this.add(1, 1, true);
    }

    this.recalc = 1;
    this.updateKnots();
    this.update();

    return this;
  }

  regen_hermite(steps) {
    if (splineCache.has(this)) {
      console.log("loading spline approx from cached bspline data");

      this.hermite = splineCache.get(this).hermite;
      return;
    }

    //console.warn("building spline approx");

    if (steps === undefined) {
      steps = this.fastmode ? 120 : 340;
    }

    if (this.interpolating) {
      steps *= 2;
    }

    this.hermite = new Array(steps);
    let table = this.hermite;

    let eps = 0.00001;
    let dt = (1.0 - eps*4.001)/(steps - 1);
    let t = eps*4;
    let lastdv1, lastf3;

    for (let j = 0; j < steps; j++, t += dt) {
      let f1 = this._evaluate(t - eps*2);
      let f2 = this._evaluate(t - eps);
      let f3 = this._evaluate(t);
      let f4 = this._evaluate(t + eps);
      let f5 = this._evaluate(t + eps*2);

      let dv1 = (f4 - f2)/(eps*2);
      dv1 /= steps;

      if (j > 0) {
        let j2 = j - 1;

        table[j2*4] = lastf3;
        table[j2*4 + 1] = lastf3 + lastdv1/3.0;
        table[j2*4 + 2] = f3 - dv1/3.0;
        table[j2*4 + 3] = f3;
      }

      lastdv1 = dv1;
      lastf3 = f3;
    }
  }

  solve_interpolating() {
    //this.recalc |= RecalcFlags.FULL_BASIS;

    for (let p of this._ps) {
      p.rco.load(p);
    }
    
    let points = this.points.concat(this.points);
    

    this._evaluate2(0.5);

    let error1 = (p) => {
      //return p.vectorDistance(this._evaluate2(p[0]));
      return this._evaluate(p[0]) - p[1];
    }

    let error = (p) => {
      return error1(p);

      /*
      let err = 0.0;
      for (let p of this.points) {
        //err += error1(p)**2;
        err += Math.abs(error1(p));
      }

      //return Math.sqrt(err);
      return err;
      //*/
    };

    let err = 0.0;
    let g = new Vector2();

    for (let step = 0; step < 25; step++) {
      err = 0.0;

      for (let p of this._ps) {
        let r1 = error(p);
        const df = 0.000001;

        err += Math.abs(r1);

        if (p === this._ps[this._ps.length - 1]) {
            continue;
        }

        g.zero();

        for (let i = 0; i < 2; i++) {
          let orig = p.rco[i];
          p.rco[i] += df;
          let r2 = error(p);
          p.rco[i] = orig;

          g[i] = (r2 - r1)/df;
        }

        let totgs = g.dot(g);
        //console.log(totgs);

        if (totgs < 0.00000001) {
          continue;
        }

        r1 /= totgs;
        let k = 0.5;

        p.rco[0] += -r1*g[0]*k;
        p.rco[1] += -r1*g[1]*k;
      }

      let th = this.fastmode ? 0.001 : 0.00005;
      if (err < th) {
        break;
      }
    }

    //this.recalc &= ~RecalcFlags.FULL_BASIS;
  }

  regen_basis() {
    if (splineCache.has(this)) {
      console.log("loading from cached bspline data");

      this.basis_tables = splineCache.get(this).basis_tables;
      return;
    }

    //console.log("building basis functions");
    //let steps = this.fastmode && !this.interpolating ? 64 : 128;
    let steps = this.fastmode ? 64 : 128;

    if (this.interpolating) {
      steps *= 2;
    }

    this.basis_tables = new Array(this._ps.length);

    for (let i = 0; i < this._ps.length; i++) {
      let table = this.basis_tables[i] = new Array((steps - 1)*4);

      let eps = 0.00001;
      let dt = (1.0 - eps*8)/(steps - 1);
      let t = eps*4;
      let lastdv1 = 0.0, lastf3 = 0.0;

      for (let j = 0; j < steps; j++, t += dt) {
        //let f1 = this._basis(t - eps*2, i);
        let f2 = this._basis(t - eps, i);
        let f3 = this._basis(t, i);
        let f4 = this._basis(t + eps, i);
        //let f5 = this._basis(t + eps*2, i);

        let dv1 = (f4 - f2)/(eps*2);
        dv1 /= steps;

        if (j > 0) {
          let j2 = j - 1;

          table[j2*4] = lastf3;
          table[j2*4 + 1] = lastf3 + lastdv1/3.0;
          table[j2*4 + 2] = f3 - dv1/3.0;
          table[j2*4 + 3] = f3;
        }

        lastdv1 = dv1;
        lastf3 = f3;
      }
    }
  }

  _basis(t, i) {
    let len = this._ps.length;
    let ps = this._ps;

    function safe_inv(n) {
      return n === 0 ? 0 : 1.0/n;
    }

    function bas(s, i, n) {
      let kp = Math.min(Math.max(i - 1, 0), len - 1);
      let kn = Math.min(Math.max(i + 1, 0), len - 1);
      let knn = Math.min(Math.max(i + n, 0), len - 1);
      let knn1 = Math.min(Math.max(i + n + 1, 0), len - 1);
      let ki = Math.min(Math.max(i, 0), len - 1);

      if (n === 0) {
        return s >= ps[ki].rco[0] && s < ps[kn].rco[0] ? 1 : 0;
      } else {

        let a = (s - ps[ki].rco[0])*safe_inv(ps[knn].rco[0] - ps[ki].rco[0] + 0.0001);
        let b = (ps[knn1].rco[0] - s)*safe_inv(ps[knn1].rco[0] - ps[kn].rco[0] + 0.0001);

        let ret = a*bas(s, i, n - 1) + b*bas(s, i + 1, n - 1);

        /*
        if (isNaN(ret)) {
          console.log(a, b, s, i, n, len);
          throw new Error();
        }
        //*/

        //if (Math.random() > 0.99) {
        //console.log(ret, a, b, n, i);
        //}
        return ret;
      }
    }

    let p = this._ps[i].rco, nk, pk;
    let deg = this.deg;

    let b = bas(t, i - deg, deg);

    return b;
  }

  evaluate(t) {
    let a = this.points[0].rco, b = this.points[this.points.length - 1].rco;

    if (t < a[0]) return a[1];
    if (t > b[0]) return b[1];

    if (this.points.length === 2) {
      t = (t - a[0])/(b[0] - a[0]);
      return a[1] + (b[1] - a[1])*t;
    }

    if (this.recalc) {
      this.regen_basis();

      if (this.interpolating) {
        this.solve_interpolating();
      }

      this.regen_hermite();
      this.recalc = 0;
    }

    t *= 0.999999;

    let table = this.hermite;
    let s = t*(table.length/4);

    let i = Math.floor(s);
    s -= i;

    i *= 4;

    return table[i] + (table[i + 3] - table[i])*s;
  }

  _evaluate(t) {
    let start_t = t;

    if (this.points.length > 1) {
      let a = this.points[0], b = this.points[this.points.length - 1];

      //if (t < a[0]) return a[1];
      //if (t >= b[0]) return b[1];
    }

    for (let i = 0; i < 35; i++) {
      let df = 0.0001;
      let ret1 = this._evaluate2(t < 0.5 ? t : t - df);
      let ret2 = this._evaluate2(t < 0.5 ? t + df : t);

      let f1 = Math.abs(ret1[0] - start_t);
      let f2 = Math.abs(ret2[0] - start_t);
      let g = (f2 - f1)/df;

      if (f1 === f2) break;

      //if (f1 < 0.0005) break;

      if (f1 === 0.0 || g === 0.0)
        return this._evaluate2(t)[1];

      let fac = -(f1/g)*0.5;
      if (fac === 0.0) {
        fac = 0.01;
      } else if (Math.abs(fac) > 0.1) {
        fac = 0.1*Math.sign(fac);
      }

      t += fac;
      let eps = 0.00001;
      t = Math.min(Math.max(t, eps), 1.0 - eps);
    }

    return this._evaluate2(t)[1];
  }

  _evaluate2(t) {
    let ret = eval2_rets.next();

    t *= 0.9999999;

    let totbasis = 0;
    let sumx = 0;
    let sumy = 0;

    for (let i = 0; i < this._ps.length; i++) {
      let p = this._ps[i].rco;
      let b = this.basis(t, i);

      sumx += b*p[0];
      sumy += b*p[1];

      totbasis += b;
    }

    if (totbasis !== 0.0) {
      sumx /= totbasis;
      sumy /= totbasis;
    }

    ret[0] = sumx;
    ret[1] = sumy;

    return ret;
  }

  get hasGUI() {
    return this.uidata !== undefined;
  }

  _wrapTouchEvent(e) {
    return {
      x              : e.touches.length ? e.touches[0].pageX : this.mpos[0],
      y              : e.touches.length ? e.touches[0].pageY : this.mpos[1],
      button         : 0,
      shiftKey       : e.shiftKey,
      altKey         : e.altKey,
      ctrlKey        : e.ctrlKey,
      isTouch        : true,
      commandKey     : e.commandKey,
      stopPropagation: () => e.stopPropagation(),
      preventDefault : () => e.preventDefault()
    };
  }

  on_touchstart(e) {
    this.mpos[0] = e.touches[0].pageX;
    this.mpos[1] = e.touches[0].pageY;

    let e2 = this._wrapTouchEvent(e);

    this.on_mousemove(e2);
    this.on_mousedown(e2);
  }

  loadTemplate(templ) {
    if (templ === undefined || !templates[templ]) {
      console.warn("Unknown bspline template", templ);
      return;
    }

    templ = templates[templ];

    this.reset(true);
    this.deg = 3.0;

    for (let i = 0; i < templ.length; i++) {
      let p = templ[i];

      if (p === "DEG") {
        this.deg = templ[i + 1];
        i++;
        continue;
      }

      this.add(p[0], p[1], true);
    }

    this.recalc = 1;
    this.updateKnots();
    this.update();
    this.redraw();
  }

  on_touchmove(e) {
    this.mpos[0] = e.touches[0].pageX;
    this.mpos[1] = e.touches[0].pageY;

    let e2 = this._wrapTouchEvent(e);
    this.on_mousemove(e2);
  }

  on_touchend(e) {
    this.on_mouseup(this._wrapTouchEvent(e));
  }

  on_touchcancel(e) {
    this.on_touchend(e);
  }

  makeGUI(container, canvas, drawTransform) {
    this.uidata = {
      start_mpos : new Vector2(),
      transpoints: [],

      dom         : container,
      canvas      : canvas,
      g           : canvas.g,
      transforming: false,
      draw_trans  : drawTransform
    };

    canvas.addEventListener("touchstart", this.on_touchstart);
    canvas.addEventListener("touchmove", this.on_touchmove);
    canvas.addEventListener("touchend", this.on_touchend);
    canvas.addEventListener("touchcancel", this.on_touchcancel);

    canvas.addEventListener("mousedown", this.on_mousedown);
    canvas.addEventListener("mousemove", this.on_mousemove);
    canvas.addEventListener("mouseup", this.on_mouseup);
    canvas.addEventListener("keydown", this.on_keydown);

    let bstrip = container.row().strip();

    let makebutton = (strip, k) => {
      let uiname = k[0] + k.slice(1, k.length).toLowerCase();
      uiname = uiname.replace(/_/g, " ");

      let icon = strip.iconbutton(-1, uiname, () => {
        this.loadTemplate(SplineTemplates[k]);
      });

      icon.iconsheet = 0;
      icon.customIcon = SplineTemplateIcons[k];
    }

    for (let k in SplineTemplates) {
      makebutton(bstrip, k);
    }

    let row = container.row();

    let fullUpdate = () => {
      this.updateKnots();
      this.update();
      this.regen_basis();
      this.recalc = RecalcFlags.ALL;
      this.redraw();
    };

    let Icons = row.constructor.getIconEnum();

    row.iconbutton(Icons.TINY_X, "Delete Point", () => {
      console.log("delete point");

      for (let i = 0; i < this.points.length; i++) {
        let p = this.points[i];

        if (p.flag & CurveFlags.SELECT) {
          this.points.remove(p);
          i--;
        }
      }

      fullUpdate();
    });

    row.button("Reset", () => {
      this.reset();
    });

    let slider = row.simpleslider(undefined, "Degree", this.deg, 1, 6, 1, true, true, (slider) => {
      this.deg = Math.floor(slider.value);

      fullUpdate();
      console.log(this.deg);

    });

    slider.baseUnit = "none";
    slider.displayUnit = "none";

    row = container.row();
    let check = row.check(undefined, "Interpolating");
    check.checked = this.interpolating;

    check.onchange = () => {
      this.interpolating = check.value;
      console.log(check.value);
      fullUpdate();
    }

    let panel = container.panel("Range");

    let xmin = panel.slider(undefined, "X Min", this.range[0][0], -10, 10, 0.1, false, undefined, (val) => {
      this.range[0][0] = val.value;
    });

    let xmax = panel.slider(undefined, "X Max", this.range[0][1], -10, 10, 0.1, false, undefined, (val) => {
      this.range[0][1] = val.value;
    });

    let ymin = panel.slider(undefined, "Y Min", this.range[1][0], -10, 10, 0.1, false, undefined, (val) => {
      this.range[1][0] = val.value;
    });

    let ymax = panel.slider(undefined, "Y Max", this.range[1][1], -10, 10, 0.1, false, undefined, (val) => {
      this.range[1][1] = val.value;
    });

    xmin.displayUnit = xmin.baseUnit = "none";
    ymin.displayUnit = ymin.baseUnit = "none";
    xmax.displayUnit = xmax.baseUnit = "none";
    ymax.displayUnit = ymax.baseUnit = "none";

    panel.closed = true;

    container.update.after(() => {
      let key = this.calcHashKey();
      if (key !== this._last_update_key) {
        this._last_update_key = key;

        slider.setValue(this.deg);
        xmin.setValue(this.range[0][0]);
        xmax.setValue(this.range[0][1]);

        ymin.setValue(this.range[1][0]);
        ymax.setValue(this.range[1][1]);
      }
    });

    return this;
  }

  killGUI(container, canvas) {
    if (this.uidata !== undefined) {
      let ud = this.uidata;
      this.uidata = undefined;

      console.log("removing event handlers for bspline curve");

      canvas.removeEventListener("touchstart", this.on_touchstart);
      canvas.removeEventListener("touchmove", this.on_touchmove);
      canvas.removeEventListener("touchend", this.on_touchend);
      canvas.removeEventListener("touchcancel", this.on_touchcancel);

      canvas.removeEventListener("mousedown", this.on_mousedown);
      canvas.removeEventListener("mousemove", this.on_mousemove);
      canvas.removeEventListener("mouseup", this.on_mouseup);
      canvas.removeEventListener("keydown", this.on_keydown);
    }

    return this;
  }

  start_transform() {
    this.uidata.transpoints = [];

    for (let p of this.points) {
      if (p.flag & CurveFlags.SELECT) {
        this.uidata.transpoints.push(p);
        p.startco.load(p);
      }
    }
  }

  on_mousedown(e) {
    console.log("bspline mdown", e.x, e.y);

    this.uidata.start_mpos.load(this.transform_mpos(e.x, e.y));
    this.fastmode = true;

    console.log(this.uidata.start_mpos, this.uidata.draw_trans);

    let mpos = this.transform_mpos(e.x, e.y);
    let x = mpos[0], y = mpos[1];
    this.do_highlight(x, y);

    if (this.points.highlight !== undefined) {
      if (!e.shiftKey) {
        for (let i = 0; i < this.points.length; i++) {
          this.points[i].flag &= ~CurveFlags.SELECT;
        }

        this.points.highlight.flag |= CurveFlags.SELECT;
      } else {
        this.points.highlight.flag ^= CurveFlags.SELECT;
      }


      this.uidata.transforming = true;

      this.start_transform();

      this.updateKnots();
      this.update();
      this.redraw();
      return;
    } else { //if (!e.isTouch) {
      let p = this.add(this.uidata.start_mpos[0], this.uidata.start_mpos[1]);
      this.points.highlight = p;

      this.updateKnots();
      this.update();
      this.redraw();

      this.points.highlight.flag |= CurveFlags.SELECT;

      this.uidata.transforming = true;
      this.uidata.transpoints = [this.points.highlight];
      this.uidata.transpoints[0].startco.load(this.uidata.transpoints[0]);
    }
  }

  do_highlight(x, y) {
    let trans = this.uidata.draw_trans;
    let mindis = 1e17, minp = undefined;
    let limit = 19/trans[0], limitsqr = limit*limit;

    for (let i = 0; i < this.points.length; i++) {
      let p = this.points[i];
      let dx = x - p.sco[0], dy = y - p.sco[1], dis = dx*dx + dy*dy;

      if (dis < mindis && dis < limitsqr) {
        mindis = dis;
        minp = p;
      }
    }

    if (this.points.highlight !== minp) {
      this.points.highlight = minp;
      this.redraw()
    }
    //console.log(x, y, minp);
  }

  do_transform(x, y) {
    let off = new Vector2([x, y]).sub(this.uidata.start_mpos);

    for (let i = 0; i < this.uidata.transpoints.length; i++) {
      let p = this.uidata.transpoints[i];
      p.load(p.startco).add(off);

      p[0] = Math.min(Math.max(p[0], this.range[0][0]), this.range[0][1]);
      p[1] = Math.min(Math.max(p[1], this.range[1][0]), this.range[1][1]);
    }

    this.updateKnots();
    this.update();
    this.redraw();
  }

  transform_mpos(x, y) {
    let r = this.uidata.canvas.getClientRects()[0];
    let dpi = devicePixelRatio; //evil module cycle: UIBase.getDPI();

    x -= parseInt(r.left);
    y -= parseInt(r.top);

    x *= dpi;
    y *= dpi;

    let trans = this.uidata.draw_trans;

    x = x/trans[0] - trans[1][0];
    y = -y/trans[0] - trans[1][1];

    return [x, y];
  }

  on_mousemove(e) {
    if (e.isTouch && this.uidata.transforming) {
      e.preventDefault();
    }

    let mpos = this.transform_mpos(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.uidata.transforming) {
      this.do_transform(x, y);
      this.evaluate(0.5);
      //this.update();
      //this.doSave();
    } else {
      this.do_highlight(x, y);
    }
  }

  end_transform() {
    this.uidata.transforming = false;
    this.fastmode = false;
    this.updateKnots();
    this.update();

    splineCache.update(this);
  }

  on_mouseup(e) {
    this.end_transform();
  }

  on_keydown(e) {
    console.log(e.keyCode);

    switch (e.keyCode) {
      case 88: //xkeey
      case 46: //delete
        if (this.points.highlight !== undefined) {
          this.points.remove(this.points.highlight);
          this.recalc = RecalcFlags.ALL;

          this.points.highlight = undefined;
          this.updateKnots();
          this.update();

          if (this._save_hook !== undefined) {
            this._save_hook();
          }
        }
        break;
    }
  }

  draw(canvas, g, draw_trans) {
    g.save();

    if (this.uidata === undefined) {
      return;
    }

    this.uidata.canvas = canvas;
    this.uidata.g = g;
    this.uidata.draw_trans = draw_trans;

    let sz = draw_trans[0], pan = draw_trans[1];
    g.lineWidth *= 3.0;

    for (let ssi = 0; ssi < 2; ssi++) {
      break; //uncomment to draw basis functions
      for (let si = 0; si < this.points.length; si++) {
        g.beginPath();

        let f = 0;
        for (let i = 0; i < steps; i++, f += df) {
          let totbasis = 0;

          for (let j = 0; j < this.points.length; j++) {
            totbasis += this.basis(f, j);
          }

          let val = this.basis(f, si);

          if (ssi)
            val /= (totbasis === 0 ? 1 : totbasis);

          (i === 0 ? g.moveTo : g.lineTo).call(g, f, ssi ? val : val*0.5, w, w);
        }

        let color, alpha = this.points[si] === this.points.highlight ? 1.0 : 0.7;

        if (ssi) {
          color = "rgba(105, 25, 5," + alpha + ")";
        } else {
          color = "rgba(25, 145, 45," + alpha + ")";
        }
        g.strokeStyle = color;
        g.stroke();
      }
    }

    g.lineWidth /= 3.0;

    let w = 0.03;

    for (let p of this.points) {
      g.beginPath();

      if (p === this.points.highlight) {
        g.fillStyle = "green";
      } else if (p.flag & CurveFlags.SELECT) {
        g.fillStyle = "red";
      } else {
        g.fillStyle = "orange";
      }

      g.rect(p.sco[0] - w/2, p.sco[1] - w/2, w, w);

      g.fill();
    }

    g.restore();
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (this.basis_tables.length === 0) {
      this.recalc = RecalcFlags.ALL;

      //console.warn("Regenerating bspline data . . .");
      //this.updateKnots();
      //this.regen_basis();
    } else {
      this.updateKnots();
      this.recalc = RecalcFlags.ALL;
    }

    this.updateKnots();
    this.recalc = RecalcFlags.ALL;
  }
}

BSplineCurve.STRUCT = nstructjs.inherit(BSplineCurve, CurveTypeData) + `
  points        : array(Curve1DPoint);
  deg           : int;
  eidgen        : IDGen;
  interpolating : bool;
  range         : array(vec2);
}
`;
nstructjs.register(BSplineCurve);
CurveTypeData.register(BSplineCurve);


function makeSplineTemplateIcons(size = 64) {
  let dpi = devicePixelRatio;
  size = ~~(size*dpi);

  for (let k in SplineTemplates) {
    let curve = new BSplineCurve();
    curve.loadTemplate(SplineTemplates[k])

    curve.fastmode = true;

    let canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;

    let g = canvas.getContext("2d");
    let steps = 64;

    curve.update();

    let scale = 0.75;

    g.strokeStyle = "orange";
    g.lineWidth = 4.0*dpi/(size*scale);

    g.scale(size*scale, size*scale);

    //margin
    let m = 0.05;

    let tent = f => 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;

    for (let i = 0; i < steps; i++) {
      let s = i/(steps - 1);
      let f = 1.0 - curve.evaluate(tent(s));

      s = s*(1.0 - m*2.0) + m;
      f = f*(1.0 - m*2.0) + m;

      if (i === 0) {
        g.moveTo(s, f);
      } else {
        g.lineTo(s, f);
      }
    }

    g.stroke();

    let url = canvas.toDataURL();
    let img = document.createElement("img");
    img.src = url;

    SplineTemplateIcons[k] = img;
    SplineTemplateIcons[SplineTemplates[k]] = img;
  }
}

for (let k in SplineTemplates) {
  let curve = new BSplineCurve();
  curve.loadTemplate(SplineTemplates[k]);
  splineCache.get(curve);
}

makeSplineTemplateIcons();
window._SplineTemplateIcons = SplineTemplateIcons;
