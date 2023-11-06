"use strict";

/**
 *
 * A not-so-simple 1d bspline curve class.
 *
 * It's actually a 2d bspline curve class that
 * uses a root finding algorithm to find the value
 * along the x dimension.
 *
 * To make things worse, due to the rule that widgets
 * cannot store direct references into the data model
 * there is a lot of weird event handling code that's
 * used by curve widgets to sync their internal curve copy
 * and the model.
 **/
import nstructjs from "../util/struct.js";
import config from '../config/config.js';
import {ToolOp} from '../toolsys/toolsys.js';

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
    [0, 0], [0.05, 0.25], [0.15, 0.45], [0.33, 0.65], [1, 1]
  ],
  [SplineTemplates.SMOOTH]        : [
    "DEG", 3, [0, 0], [1.0/3.0, 0], [2.0/3.0, 1.0], [1, 1]
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
  [SplineTemplates.GUASSIAN]      : [
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
import {
  BoolProperty, EnumProperty, FloatProperty, IntProperty, StringProperty, Vec2Property
} from '../toolsys/toolprop.js';

export class Curve1dBSplineOpBase extends ToolOp {
  static tooldef() {
    return {
      inputs : {
        dataPath: new StringProperty()
      },
      outputs: {},
    };
  }

  _undo = undefined;

  undoPre(ctx) {
    let curve1d = this.getCurve1d(ctx);
    if (curve1d) {
      this._undo = curve1d.copy();
    } else {
      this._undo = undefined;
    }
  }

  undo(ctx) {
    let curve1d = this.getCurve1d(ctx);
    if (curve1d) {
      curve1d.load(this._undo);
      curve1d._fireEvent("update", curve1d);
    }
  }

  getCurve1d(ctx) {
    let {dataPath} = this.getInputs();

    let curve1d;
    try {
      curve1d = ctx.api.getValue(ctx, dataPath);
    } catch (error) {
      console.error(error.stack);
      console.error(error.message);
      console.error("Failed to lookup curve1d property at path ", dataPath);
      return;
    }

    return curve1d;
  }

  execPost(ctx) {
    let curve1d = this.getCurve1d(ctx);
    if (curve1d) {
      curve1d._fireEvent("update", curve1d);
    }
  }
}

export class Curve1dBSplineResetOp extends Curve1dBSplineOpBase {
  static tooldef() {
    return {
      toolpath: "curve1d.reset_bspline",
      inputs  : ToolOp.inherit({}),
      outputs : {},
    }
  }


  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);
    if (curve1d) {
      curve1d.generators.active.reset();
    }
  }
}

ToolOp.register(Curve1dBSplineResetOp);

export class Curve1dBSplineLoadTemplOp extends Curve1dBSplineOpBase {
  static tooldef() {
    return {
      toolpath: "curve1d.bspline_load_template",
      inputs  : ToolOp.inherit({
        template: new EnumProperty(SplineTemplates.SMOOTH, SplineTemplates)
      }),
      outputs : {},
    }
  }


  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);
    let {template} = this.getInputs();

    if (curve1d) {
      curve1d.generators.active.loadTemplate(template);
    }
  }
}

ToolOp.register(Curve1dBSplineLoadTemplOp);

export class Curve1dBSplineDeleteOp extends Curve1dBSplineOpBase {
  static tooldef() {
    return {
      toolpath: "curve1d.bspline_delete_point",
      inputs  : ToolOp.inherit({}),
      outputs : {},
    }
  }


  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);

    if (curve1d) {
      curve1d.generators.active.deletePoint();
    }
  }
}

ToolOp.register(Curve1dBSplineDeleteOp);

export class Curve1dBSplineSelectOp extends Curve1dBSplineOpBase {
  static tooldef() {
    return {
      toolpath: "curve1d.bspline_select_point",
      inputs  : ToolOp.inherit({
        point : new IntProperty(-1),
        state : new BoolProperty(true),
        unique: new BoolProperty(true),
      }),
      outputs : {},
    }
  }


  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);

    if (curve1d) {
      let bspline = curve1d.generators.active;
      let {point, state, unique} = this.getInputs();

      for (let p of bspline.points) {
        if (p.eid === point) {
          if (state) {
            p.flag |= CurveFlags.SELECT;
          } else {
            p.flag &= ~CurveFlags.SELECT;
          }
        } else if (unique) {
          p.flag &= ~CurveFlags.SELECT;
        }
      }

      curve1d._fireEvent("select", bspline);
    }
  }
}

ToolOp.register(Curve1dBSplineSelectOp);

export class Curve1dBSplineAddOp extends Curve1dBSplineOpBase {
  static tooldef() {
    return {
      toolpath: "curve1d.bspline_add_point",
      inputs  : ToolOp.inherit({
        x: new FloatProperty(),
        y: new FloatProperty()
      }),
      outputs : {},
    }
  }


  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);

    if (curve1d) {
      let {x, y} = this.getInputs();
      curve1d.generators.active.addFromMouse(x, y);
    }
  }
}

ToolOp.register(Curve1dBSplineAddOp);

export class BSplineTransformOp extends ToolOp {
  constructor() {
    super();

    this.first = true;
    this.start_mpos = new Vector2();
  }

  static tooldef() {
    return {
      toolpath: "curve1d.transform_bspline",
      inputs  : {
        dataPath: new StringProperty(),
        off     : new Vec2Property(),
        dpi     : new FloatProperty(1.0),
      },
      is_modal: true,
      outputs : {},
    };
  }

  _undo = undefined;

  storePoints(ctx) {
    let curve1d = this.getCurve1d(ctx);

    if (curve1d) {
      let bspline = curve1d.generators.active;
      return Array.from(bspline.points).map(p => p.copy());
    }

    return [];
  }

  loadPoints(ctx, ps) {
    let curve1d = this.getCurve1d(ctx);

    if (curve1d) {
      let bspline = curve1d.generators.active;

      for (let p1 of bspline.points) {
        for (let p2 of ps) {
          if (p2.eid === p1.eid) {
            p1.co.load(p2.co);
            p1.rco.load(p2.rco);
            p1.sco.load(p2.sco);
          }
        }
      }

      bspline.parent._fireEvent("transform", bspline);

      bspline.recalc = RecalcFlags.ALL;
      bspline.updateKnots();
      bspline.update();
      bspline.redraw();
    }
  }

  undoPre(ctx) {
    this._undo = this.storePoints(ctx);
  }

  undo(ctx) {
    this.loadPoints(ctx, this._undo);
  }

  getCurve1d(ctx) {
    let {dataPath} = this.getInputs();

    let curve1d;
    try {
      curve1d = ctx.api.getValue(ctx, dataPath);
    } catch (error) {
      console.error(error.stack);
      console.error(error.message);
      console.error("Failed to lookup curve1d property at path ", dataPath);
      return;
    }

    return curve1d;
  }

  finish(cancel = false) {
    let ctx = this.modal_ctx;
    this.modalEnd(cancel);

    let curve1d = this.getCurve1d(ctx);
    if (curve1d) {
      curve1d.generators.active.fastmode = false;
    }

    if (cancel) {
      this.undo(ctx);
    }
  }

  on_pointerup(e) {
    this.finish();
  }

  modalStart(ctx) {
    super.modalStart(ctx);

    let curve1d = this.getCurve1d(ctx);
    if (!curve1d) {
      console.log("Failed to get curve1d!");
      return;
    }

    let bspline = curve1d.generators.active;
    for (let p of bspline.points) {
      p.startco.load(p.co);
    }
  }

  on_pointermove(e) {
    let mpos = new Vector2().loadXY(e.x, e.y);
    if (this.first) {
      this.start_mpos.load(mpos);
      this.first = false;
      return;
    }

    let curve1d = this.getCurve1d(this.modal_ctx);
    if (curve1d) {
      curve1d.generators.active.fastmode = true;
    }

    const {dpi} = this.getInputs();
    let off = new Vector2(mpos).sub(this.start_mpos).mulScalar(dpi);
    off[1] = -off[1];

    this.inputs.off.setValue(off);

    const bspline = curve1d.generators.active;
    for (let p of bspline.points) {
      p.co.load(p.startco);
    }

    this.exec(this.modal_ctx);
  }

  on_pointerdown(e) {
    this.finish();
  }

  exec(ctx) {
    let curve1d = this.getCurve1d(ctx);
    if (!curve1d) {
      return;
    }

    let bspline = curve1d.generators.active;
    let {off} = this.getInputs();

    const xRange = curve1d.xRange, yRange = curve1d.yRange;

    for (let p of bspline.points) {
      if (p.flag & CurveFlags.SELECT) {
        p.co.add(off);
        p.co[0] = Math.min(Math.max(p.co[0], xRange[0]), xRange[1]);
        p.co[1] = Math.min(Math.max(p.co[1], yRange[0]), yRange[1]);
      }
    }

    bspline.parent._fireEvent("transform", bspline);

    bspline.recalc = RecalcFlags.ALL;
    bspline.updateKnots();
    bspline.update();
    bspline.redraw();
  }
}

ToolOp.register(BSplineTransformOp);

export class Curve1DPoint {
  constructor(co) {
    this.co = new Vector2(co);
    this.rco = new Vector2(co);
    this.sco = new Vector2(co);

    //for transform
    this.startco = new Vector2();
    this.eid = -1;
    this.flag = 0;

    this.tangent = TangentModes.SMOOTH;

    Object.seal(this);
  }

  get 0() {
    throw new Error("Curve1DPoint get 0");
  }

  get 1() {
    throw new Error("Curve1DPoint get 1");
  }

  /* Needed for file compatibility. */
  set 0(v) {
    this.co[0] = v;
  }

  set 1(v) {
    this.co[1] = v;
  }

  load(b) {
    this.eid = b.eid;
    this.flag = b.flag;
    this.tangent = b.tangent;

    this.co.load(b.co);
    this.rco.load(b.rco);
    this.sco.load(b.sco);
    this.startco.load(b.startco);

    return this;
  }

  set deg(v) {
    console.warn("old file data detected");
  }

  static fromJSON(obj) {
    let ret = new Curve1DPoint(obj);

    if ("0" in obj) {
      ret.co[0] = obj[0];
      ret.co[1] = obj[1];
    } else {
      ret.co.load(obj.co);
    }

    ret.startco.load(obj.startco);
    ret.eid = obj.eid;
    ret.flag = obj.flag;
    ret.tangent = obj.tangent;

    ret.rco.load(obj.rco);

    return ret;
  }

  copy() {
    let ret = new Curve1DPoint(this.co);

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
      co     : this.co,
      eid    : this.eid,
      flag   : this.flag,
      tangent: this.tangent,

      rco    : this.rco,
      startco: this.startco,
    };
  }

  loadSTRUCT(reader) {
    reader(this);

    this.sco.load(this.co);
    this.rco.load(this.co);

    splineCache.update(this);
  }
};
Curve1DPoint.STRUCT = `
Curve1DPoint {
  co      : vec2;
  rco     : vec2;
  sco     : vec2;
  startco : vec2;
  eid     : int;
  flag    : int;
  tangent : int;
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

let _idgen = 1;

class BSplineCurve extends CurveTypeData {
  constructor() {
    super();

    this._bid = _idgen++;

    this._degOffset = 0;
    this.cache_w = 0;
    this._last_cache_key = 0;

    this.fastmode = false;
    this.points = [];
    this.length = 0;
    this.interpolating = false;

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

  get hasGUI() {
    return this.uidata !== undefined;
  }

  static define() {
    return {
      uiname  : "B-Spline",
      name    : "bspline",
      typeName: "BSplineCurve"
    }
  }

  calcHashKey(digest = _udigest.reset()) {
    let d = digest;

    super.calcHashKey(d);

    d.add(this.deg);
    d.add(this.interpolating);
    d.add(this.points.length);

    for (let p of this.points) {
      let x = ~~(p.co[0]*1024);
      let y = ~~(p.co[1]*1024);

      d.add(x);
      d.add(y);
      d.add(p.tangent); //is an enum
    }

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

      if (p1.co.vectorDistance(p2.co) > 0.00001) {
        return false;
      }

      if (p1.tangent !== p2.tangent) {
        return false;
      }
    }

    return true;
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

    p.co.loadXY(x, y);
    p.sco.load(p.co);
    p.rco.load(p.co);

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
        this.points[i].rco.load(this.points[i].co);
      }
    }

    this.points.sort(function (a, b) {
      return a.co[0] - b.co[0];
    });

    return this;
  }

  updateKnots(recalc = true, points = this.points) {
    if (recalc) {
      this.recalc = RecalcFlags.ALL;
    }

    this._sortPoints();

    this._ps = [];
    if (points.length < 2) {
      return;
    }
    let a = points[0].co[0], b = points[points.length - 1].co[0];

    let degExtra = this.deg;
    this._degOffset = -this.deg;

    for (let i = 0; i < points.length - 1; i++) {
      this._ps.push(points[i]);
    }

    if (degExtra) {
      let last = points.length - 1;
      for (let i = 0; i < degExtra; i++) {
        let p = points[last].copy();
        this._ps.push(p);
      }
    }

    if (!this.interpolating) {
      for (let i = 0; i < this._ps.length; i++) {
        this._ps[i].rco.load(this._ps[i].co);
      }
    }

    for (let i = 0; i < points.length; i++) {
      let p = points[i];
      let x = p.co[0], y = p.co[1];//this.evaluate(x);

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
      eidgen       : this.eidgen.toJSON()
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
      /* Will be version patched later. */
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

    //return table[j] + (table[j + 3] - table[j])*s; //linear
    return bez4(table[j], table[j + 1], table[j + 2], table[j + 3], s); //cubic
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
    this.redraw();

    return this;
  }

  regen_hermite(steps) {
    if (splineCache.has(this)) {
      console.log("loading spline approx from cached bspline data");

      this.hermite = splineCache.get(this).hermite;
      return;
    }

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
      p.rco.load(p.co);
    }

    let points = this.points.concat(this.points);


    this._evaluate2(0.5);

    let error1 = (p) => {
      //return p.vectorDistance(this._evaluate2(p.co[0]));
      return this._evaluate(p.co[0]) - p.co[1];
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

        let f3 = this._basis(t, i);
        let dv1;

        if (0) {
          //let f1 = this._basis(t - eps*2, i);
          let f2 = this._basis(t - eps, i);
          let f4 = this._basis(t + eps, i);
          //let f5 = this._basis(t + eps*2, i);

          dv1 = (f4 - f2)/(eps*2);
        } else {
          dv1 = this._dbasis(t, i);
        }

        if (isNaN(dv1)) {
          console.log("NaN!");
          debugger;
          dv1 = this._dbasis(t, i);
        }
        //dv1 = 0.0;

        //dv1 = 0.0;
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

  _dbasis(t, i) {
    let len = this._ps.length;
    let ps = this._ps;

    function safe_inv(n) {
      return n === 0 ? 0 : 1.0/n;
    }

    /*
    on factor;

    operator bas;

    a := (s - ki) / (knn - ki);
    b := (knn1 - s) / (knn1 - kn);

    f := a*bas(s, j, n-1) + b*bas(s, j+1, n-1);
    df(f, s);
    */

    function bas(s, i, n) {
      let kn = Math.min(Math.max(i + 1, 0), len - 1);
      let knn = Math.min(Math.max(i + n, 0), len - 1);
      let knn1 = Math.min(Math.max(i + n + 1, 0), len - 1);
      let ki = Math.min(Math.max(i, 0), len - 1);

      if (n === 0) {
        return s >= ps[ki].rco[0] && s < ps[kn].rco[0] ? 1 : 0;
      } else {

        let a = (s - ps[ki].rco[0])*safe_inv(ps[knn].rco[0] - ps[ki].rco[0] + 0.0001);
        let b = (ps[knn1].rco[0] - s)*safe_inv(ps[knn1].rco[0] - ps[kn].rco[0] + 0.0001);

        return a*bas(s, i, n - 1) + b*bas(s, i + 1, n - 1);
      }
    }

    function dbas(s, j, n) {
      let kn = Math.min(Math.max(j + 1, 0), len - 1);
      let knn = Math.min(Math.max(j + n, 0), len - 1);
      let knn1 = Math.min(Math.max(j + n + 1, 0), len - 1);
      let ki = Math.min(Math.max(j, 0), len - 1);

      kn = ps[kn].rco[0];
      knn = ps[knn].rco[0];
      knn1 = ps[knn1].rco[0];
      ki = ps[ki].rco[0];

      if (n === 0) {
        return 0;
        //return s >= ki && s < kn ? 1 : 0;
      } else {
        let div = ((ki - knn)*(kn - knn1));

        if (div === 0.0) {
          return 0.0;
        }

        return (((ki - s)*dbas(s, j, n - 1) - bas(s, j, n - 1))*(kn - knn1) - ((knn1 -
          s)*dbas(s, j + 1, n - 1) - bas(s, j + 1, n - 1))*(ki - knn))/div;
      }
    }

    let deg = this.deg;
    return dbas(t, i + this._degOffset, deg);
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

        return a*bas(s, i, n - 1) + b*bas(s, i + 1, n - 1);
      }
    }

    let p = this._ps[i].rco, nk, pk;
    let deg = this.deg;

    let b = bas(t, i + this._degOffset, deg);

    return b;
  }

  evaluate(t) {
    if (this.points.length === 0) {
      return 0.0;
    }

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

  /* Root find t on the x axis of the curve.  This
   * is more intuitive for the user.
   */
  _evaluate(t) {
    let start_t = t;

    if (this.points.length === 0) {
      return 0;
    }

    let xmin = this.points[0].rco[0];
    let xmax = this.points[this.points.length - 1].rco[0];

    let steps = this.fastmode ? 16 : 32;
    let s = xmin, ds = (xmax - xmin)/(steps - 1);

    let miny;
    let mins;
    let mindx;

    for (let i = 0; i < steps; i++, s += ds) {
      let p = this._evaluate2(s);

      let dx = Math.abs(p[0] - start_t);
      if (mindx === undefined || dx < mindx) {
        mindx = dx;
        miny = p[1];
        mins = s;
      }
    }

    let start = mins - ds, end = mins + ds;
    s = mins;

    for (let i = 0; i < 16; i++) {
      let p = this._evaluate2(s);

      if (p[0] > start_t) {
        end = s;
      } else {
        start = s;
      }

      s = (start + end)*0.5;
      miny = p[1];
    }

    if (miny === undefined) {
      miny = 0;
    }
    return miny;

    /* newton-raphson
    //t = mins;
    t = s;

    for (let i = 0; i < 2; i++) {
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
    */
  }

  _evaluate2(t) {
    let ret = eval2_rets.next();

    t *= 0.9999999;

    let sumx = 0;
    let sumy = 0;

    let totbasis = 0;

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

    if (this.parent) {
      this.parent._fireEvent("update", this.parent);
    }
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

  deletePoint() {
    for (let i = 0; i < this.points.length; i++) {
      let p = this.points[i];

      if (p.flag & CurveFlags.SELECT) {
        this.points.remove(p);
        i--;
      }
    }

    this.updateKnots();
    this.update();
    this.regen_basis();
    this.recalc = RecalcFlags.ALL;
    this.redraw();
  }

  makeGUI(container, canvas, drawTransform, datapath, onSourceUpdate) {
    console.warn(this._bid, "makeGUI", this.uidata, this.uidata ? this.uidata.start_mpos : undefined);

    let start_mpos;
    if (this.uidata) {
      start_mpos = this.uidata.start_mpos;
    }

    this.uidata = {
      start_mpos : new Vector2(start_mpos),
      transpoints: [],

      dom         : container,
      canvas      : canvas,
      g           : canvas.g,
      transforming: false,
      draw_trans  : drawTransform,
      datapath
    };

    console.warn("Building gui");

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
        if (datapath) {
          row.ctx.api.execTool(row.ctx, "curve1d.bspline_load_template", {
            dataPath: datapath,
            template: SplineTemplates[k]
          });
          onSourceUpdate();
        } else {
          this.loadTemplate(SplineTemplates[k]);
        }
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

    let icon = Icons.LARGE_X !== undefined ? Icons.LARGE_X : Icons.TINY_X;
    if (Icons.LARGE_X === undefined) {
      console.log(Icons);
      console.error("Curve widget expects Icons.LARGE_X icon for delete button.");
    }

    row.iconbutton(icon, "Delete Point", () => {
      if (datapath) {
        row.ctx.api.execTool(row.ctx, "curve1d.bspline_delete_point", {
          dataPath: datapath
        });
      } else {
        this.deletePoint();
      }

      onSourceUpdate();
      fullUpdate();
    });

    row.button("Reset", () => {
      if (datapath) {
        row.ctx.api.execTool(row.ctx, "curve1d.reset_bspline", {
          dataPath: datapath
        });
        onSourceUpdate();
      } else {
        this.reset();
      }
    });

    let slider = row.simpleslider(undefined, {
      name      : "Degree",
      min       : 1,
      max       : 7,
      isInt     : true,
      callback  : (slider) => {
        this.deg = Math.floor(slider.value);
        fullUpdate();
      }
    });
    slider.setValue(this.deg);

    let last_deg = this.deg;
    slider.update.after(() => {
      if (last_deg !== this.deg) {
        console.log("degree update", this.deg);
        last_deg = this.deg;
        slider.setValue(this.deg);
      }
    });

    /*
    let slider = row.simpleslider(undefined, "Degree", this.deg, 1, 6, 1, true, true, (slider) => {
      this.deg = Math.floor(slider.value);
      console.log(slider.value);

      fullUpdate();
    });*/

    slider.baseUnit = "none";
    slider.displayUnit = "none";

    row = container.row();
    let check = row.check(undefined, "Interpolating");
    check.checked = this.interpolating;

    check.onchange = () => {
      this.interpolating = check.value;
      fullUpdate();
    }

    return this;
  }

  killGUI(container, canvas) {
    if (this.uidata !== undefined) {
      let ud = this.uidata;
      this.uidata = undefined;

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

  start_transform(useSelected = true) {
    let dpi = 1.0/this.uidata.draw_trans[0];

    /* Manually set p.startco to avoid trashing it
     * if we're proxying another Curve1D.*/
    for (let p of this.points) {
      p.startco.load(p.co);
    }

    let transform_op = new BSplineTransformOp();
    transform_op.inputs.dataPath.setValue(this.uidata.datapath);
    transform_op.inputs.dpi.setValue(dpi);

    this.uidata.dom.ctx.api.execTool(this.uidata.dom.ctx, transform_op);

  }

  on_mousedown(e) {
    this.uidata.start_mpos.load(this.transform_mpos(e.x, e.y));
    this.fastmode = true;

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

      if (this.uidata.datapath) {
        let state = e.shiftKey ? !(this.points.highlight.flag & CurveFlags.SELECT) : true;

        this.uidata.dom.ctx.api.execTool(this.uidata.dom.ctx, "curve1d.bspline_select_point", {
          dataPath: this.uidata.datapath,
          state,
          unique  : !e.shiftKey,
          point   : this.points.highlight.eid,
        });
      }
      this.start_transform();

      this.updateKnots();
      this.update();
      this.redraw();
    } else {
      let uidata = this.uidata;

      if (this.uidata.datapath) {
        /*
         * Note: this may not update this particular curve instance,
         * that instance however should update this one via the "update"
         * event.
         **/
        let start_mpos = this.uidata.start_mpos;
        this.uidata.dom.ctx.api.execTool(this.uidata.dom.ctx, "curve1d.bspline_add_point", {
          dataPath: this.uidata.datapath,
          x       : start_mpos[0],
          y       : start_mpos[1],
        });
      } else {
        this.addFromMouse(this.uidata.start_mpos[0], this.uidata.start_mpos[1]);
        this.parent._fire("update", this.parent);
      }

      this.updateKnots();
      this.update();
      this.redraw();

      /* Event system may have regenerated this.uidata (from killGUI,
       * called from the update event handler),
       * restore the one we started with.
       */

      this.uidata = uidata;
      this.start_transform();
    }
  }

  load(b) {
    if (this === b) {
      return;
    }

    this.recalc = RecalcFlags.ALL;

    this.length = b.points.length;
    this.points.length = 0;
    this.eidgen = b.eidgen.copy();

    this.deg = b.deg;
    this.interpolating = b.interpolating;

    for (let p of b.points) {
      let p2 = new Curve1DPoint();
      p2.load(p);

      if (p === b.points.highlight) {
        this.points.highlight = p2;
      }

      this.points.push(p2);
    }

    this.updateKnots();
    this.update();
    this.redraw();

    return this;
  }

  addFromMouse(x, y) {
    let p = this.add(x, y);
    p.startco.load(p.co);
    this.points.highlight = p;

    for (let p2 of this.points) {
      p2.flag &= ~CurveFlags.SELECT;
    }
    p.flag |= CurveFlags.SELECT;

    this.updateKnots();
    this.update();
    this.redraw();

    this.points.highlight.flag |= CurveFlags.SELECT;
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
  }

  do_transform(x, y) {
    let off = new Vector2([x, y]).sub(this.uidata.start_mpos);

    let xRange = this.parent.xRange;
    let yRange = this.parent.yRange;

    for (let i = 0; i < this.uidata.transpoints.length; i++) {
      let p = this.uidata.transpoints[i];
      p.co.load(p.startco).add(off);

      p.co[0] = Math.min(Math.max(p.co[0], xRange[0]), xRange[1]);
      p.co[1] = Math.min(Math.max(p.co[1], yRange[0]), yRange[1]);
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
    g.lineWidth *= 1.5;
    let strokeStyle = g.strokeStyle;

    for (let ssi = 0; ssi < 1; ssi++) {
      break; //uncomment to draw basis functions

      let steps = 512;
      for (let si = 0; si < this.points.length; si++) {
        g.beginPath();

        let f = 0;
        let df = 1.0/(steps - 1);
        for (let i = 0; i < steps; i++, f += df) {
          let totbasis = 0;

          for (let j = 0; j < this.points.length; j++) {
            totbasis += this.basis(f, j);
          }

          let val = this.basis(f, si);

          if (ssi)
            val /= (totbasis === 0 ? 1 : totbasis);

          (i === 0 ? g.moveTo : g.lineTo).call(g, f, ssi ? val : val*0.5);
        }

        let color, alpha = this.points[si] === this.points.highlight ? 1.0 : 0.7;

        if (ssi) {
          color = "rgba(205, 125, 5," + alpha + ")";
        } else {
          color = "rgba(25, 145, 45," + alpha + ")";
        }
        g.strokeStyle = color;
        g.stroke();
      }
    }

    g.strokeStyle = strokeStyle;
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

    if (this.highlightPoint >= 0) {
      for (let p of this.points) {
        if (p.eid === this.highlightPoint) {
          this.points.highlight = p;
        }
      }

      delete this.highlightPoint;
    }

    this.updateKnots();
    this.recalc = RecalcFlags.ALL;
  }
}

BSplineCurve.STRUCT = nstructjs.inherit(BSplineCurve, CurveTypeData) + `
  points         : array(Curve1DPoint);
  highlightPoint : int | this.points.highlight ? this.points.highlight.eid : -1;
  deg            : int;
  eidgen         : IDGen;
  interpolating  : bool;
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

    let scale = 0.5;

    g.translate(-0.5, -0.5);
    g.scale(size*scale, size*scale);
    g.translate(0.5, 0.5);

    //margin
    let m = 0.0;

    let tent = f => 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;

    for (let i = 0; i < steps; i++) {
      let s = i/(steps - 1);
      let f = 1.0 - curve.evaluate(tent(s));

      s = s*(1.0 - m*2.0) + m;
      f = f*(1.0 - m*2.0) + m;

      //s += 0.5;
      //f += 0.5;

      if (i === 0) {
        g.moveTo(s, f);
      } else {
        g.lineTo(s, f);
      }
    }

    const ls = 7.0;

    g.lineCap = "round";
    g.strokeStyle = "black";
    g.lineWidth = ls*3*dpi/(size*scale);
    g.stroke();

    g.strokeStyle = "white";
    g.lineWidth = ls*dpi/(size*scale);
    g.stroke();

    let url = canvas.toDataURL();
    let img = document.createElement("img");
    img.src = url;

    SplineTemplateIcons[k] = img;
    SplineTemplateIcons[SplineTemplates[k]] = img;
  }
}

let splineTemplatesLoaded = false;

export function initSplineTemplates() {
  if (splineTemplatesLoaded) {
    return;
  }

  splineTemplatesLoaded = true;

  for (let k in SplineTemplates) {
    let curve = new BSplineCurve();
    curve.loadTemplate(SplineTemplates[k]);
    splineCache.get(curve);
  }

  makeSplineTemplateIcons();
  window._SplineTemplateIcons = SplineTemplateIcons;
}

//delay to ensure config is fully loaded
window.setTimeout(() => {
  if (config.autoLoadSplineTemplates) {
    initSplineTemplates();
  }
}, 0);

