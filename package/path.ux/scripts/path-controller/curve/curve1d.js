"use strict";

/*FIXME: not sure this works anymore*/
import nstructjs from "../util/struct.js";

import * as util from '../util/util.js';
//import * as ui_base from './ui_base.js';
import {Vector2, Vector3, Vector4, Matrix4} from '../util/vectormath.js';
import {EventDispatcher} from "../util/events.js";

export {getCurve} from './curve1d_base.js';
export {SplineTemplates, SplineTemplateIcons} from './curve1d_bspline.js';

import './curve1d_basic.js';
import './curve1d_bspline.js';
import './curve1d_anim.js';

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

export {CurveConstructors, CURVE_VERSION, CurveTypeData} from './curve1d_base.js';
import {CurveConstructors, CURVE_VERSION, CurveTypeData} from './curve1d_base.js';

let _udigest = new util.HashDigest();

export class Curve1D {
  constructor() {
    this._eventCBs = [];

    this.uiZoom = 1.0;
    this.xRange = new Vector2().loadXY(0.0, 1.0);
    this.yRange = new Vector2().loadXY(0.0, 1.0);
    this.clipToRange = false;

    this.generators = [];
    this.VERSION = CURVE_VERSION;

    for (let gen of CurveConstructors) {
      gen = new gen();

      gen.parent = this;
      this.generators.push(gen);
    }

    //this.generators.active = this.generators[0];
    this.setGenerator("bspline");
  }

  get generatorType() {
    return this.generators.active ? this.generators.active.type : undefined;
  }

  get fastmode() {
    return this._fastmode;
  }

  set fastmode(val) {
    this._fastmode = val;

    for (let gen of this.generators) {
      gen.fastmode = val;
    }
  }

  /** cb_is_dead is a callback that returns true if it
   *  should be removed from the callback list. */
  on(type, cb, owner, cb_is_dead) {
    if (cb_is_dead === undefined) {
      cb_is_dead = () => false;
    }

    this._eventCBs.push({type, cb, owner, dead: cb_is_dead, once: false});
  }

  off(type, cb) {
    this._eventCBs = this._eventCBs.filter(cb => cb.cb !== cb);
  }

  once(type, cb, owner, cb_is_dead) {
    this.on(type, cb, owner, cb_is_dead);
    this._eventCBs[this._eventCBs.length - 1].once = true;
  }

  subscribed(type, owner) {
    for (let cb of this._eventCBs) {
      if ((!type || cb.type === type) && cb.owner === owner) {
        return true;
      }
    }

    return false;
  }

  _pruneEventCallbacks() {
    this._eventCBs = this._eventCBs.filter(cb => !cb.dead());
  }

  _fireEvent(evt, data) {
    this._pruneEventCallbacks();

    for (let i = 0; i < this._eventCBs.length; i++) {
      let cb = this._eventCBs[i];

      if (cb.type !== evt) {
        continue;
      }

      try {
        cb.cb(data);
      } catch (error) {
        console.error(error.stack);
        console.error(error.message);
      }

      if (cb.once) {
        this._eventCBs.remove(cb);
        i--;
      }
    }
  }

  calcHashKey(digest = _udigest.reset()) {
    let d = digest;

    for (let g of this.generators) {
      g.calcHashKey(d);
    }

    return d.get();
  }

  equals(b) {
    let gen1 = this.generators.active;
    let gen2 = b.generators.active;

    if (!gen1 || !gen2 || gen1.constructor !== gen2.constructor) {
      return false;
    }

    return gen1.equals(gen2);
  }

  load(b) {
    if (b === undefined || b === this) {
      return;
    }
    /*
    if (b === undefined) {
      return;
    }

    let buf1 = mySafeJSONStringify(b);
    let buf2 = mySafeJSONStringify(this);

    if (buf1 === buf2) {
      return;
    }

    this.loadJSON(JSON.parse(buf1));
    this._on_change();
    this.redraw();

    return this;*/

    let json = nstructjs.writeJSON(b, Curve1D);
    let cpy = nstructjs.readJSON(json, Curve1D);

    let activeCls = this.generators.active.constructor;
    let oldGens = this.generators;

    this.generators = cpy.generators;
    this.generators.active = undefined;

    for (let gen of cpy.generators) {
      /* See if generator provides a .load() method. */
      for (let gen2 of oldGens) {
        if (gen2.constructor === gen.constructor && gen2.load !== undefined) {
          cpy.generators[cpy.generators.indexOf(gen)] = gen2;

          if (gen2.constructor === activeCls) {
            this.generators.active = gen2;
          }

          gen2.parent = this;
          gen2.load(gen);
          gen = gen2;
          break;
        }
      }

      if (gen.constructor === activeCls) {
        this.generators.active = gen;
      }
      gen.parent = this;
    }

    for (let k in json) {
      if (k === "generators") {
        continue;
      }
      if (k.startsWith("_")) {
        continue;
      }

      let v = cpy[k];
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
        this[k] = v;
      } else if (v instanceof Vector2 || v instanceof Vector3 || v instanceof Vector4 || v instanceof Matrix4) {
        this[k].load(v);
      }
    }

    this._on_change();
    this.redraw();

    return this;
  }

  copy() {
    let json = nstructjs.writeJSON(this, Curve1D);
    return nstructjs.readJSON(json, Curve1D);
  }

  _on_change() {

  }

  redraw() {
    this._fireEvent("draw", this);
  }

  setGenerator(type) {
    for (let gen of this.generators) {
      if (gen.constructor.define().name === type
        || gen.type === type
        || gen.constructor.define().typeName === type
        || gen.constructor === type) {
        if (this.generators.active) {
          this.generators.active.onInactive();
        }

        this.generators.active = gen;
        gen.onActive();

        return;
      }
    }

    throw new Error("unknown curve type " + type);
  }

  toJSON() {
    let ret = {
      generators      : [],
      uiZoom          : this.uiZoom,
      VERSION         : this.VERSION,
      active_generator: this.generatorType,
      xRange          : this.xRange,
      yRange          : this.yRange,
      clipToRange     : this.clipToRange,
    };

    for (let gen of this.generators) {
      ret.generators.push(gen.toJSON());
    }

    ret.generators.sort((a, b) => a.type.localeCompare(b.type));

    return ret;
  }

  getGenerator(type, throw_on_error = true) {
    for (let gen of this.generators) {
      if (gen.type === type) {
        return gen;
      }
    }

    //was a new generator registerd?
    for (let cls of CurveConstructors) {
      if (cls.define().typeName === type) {
        let gen = new cls();
        gen.type = type;
        gen.parent = this;
        this.generators.push(gen);
        return gen;
      }
    }

    if (throw_on_error) {
      throw new Error("Unknown generator " + type + ".");
    } else {
      return undefined;
    }
  }

  switchGenerator(type) {
    let gen = this.getGenerator(type);

    if (gen !== this.generators.active) {
      let old = this.generators.active;

      this.generators.active = gen;

      old.onInactive(this);
      gen.onActive(this);
    }

    return gen;
  }

  destroy() {
    return this;
  }

  loadJSON(obj) {
    this.VERSION = obj.VERSION;

    this.uiZoom = parseFloat(obj.uiZoom) || this.uiZoom;
    if (obj.xRange) {
      this.xRange = new Vector2(obj.xRange);
    }
    if (obj.yRange) {
      this.yRange = new Vector2(obj.yRange);
    }
    this.clipToRange = Boolean(obj.clipToRange);

    //this.generators = [];
    for (let gen of obj.generators) {
      let gen2 = this.getGenerator(gen.type, false);

      if (!gen2 || !(gen2 instanceof CurveTypeData)) {
        //old curve class?
        console.warn("Bad curve generator class:", gen2);
        if (gen2) {
          this.generators.remove(gen2);
        }
        continue;
      }

      gen2.parent = undefined;
      gen2.reset();
      gen2.loadJSON(gen);
      gen2.parent = this;

      if (gen.type === obj.active_generator) {
        this.generators.active = gen2;
      }

      //this.generators.push(gen2);
    }

    if (this.VERSION < 1.1) {
      this.#patchRange();
    }

    return this;
  }

  evaluate(s) {
    if (this.clipToRange) {
      s = Math.min(Math.max(s, this.xRange[0]), this.xRange[1]);
    }

    let f = this.generators.active.evaluate(s);
    if (this.clipToRange) {
      f = Math.min(Math.max(f, this.yRange[0]), this.yRange[1]);
    }

    return f;
  }

  integrate(s, quadSteps) {
    return this.generators.active.integrate(s, quadSteps);
  }

  derivative(s) {
    return this.generators.active.derivative(s);
  }

  derivative2(s) {
    return this.generators.active.derivative2(s);
  }

  inverse(s) {
    return this.generators.active.inverse(s);
  }

  reset() {
    this.generators.active.reset();
  }

  update() {
    return this.generators.active.update();
  }

  draw(canvas, g, draw_transform) {
    let w = canvas.width, h = canvas.height;

    g.save();

    let sz = draw_transform[0], pan = draw_transform[1];

    g.beginPath();
    g.moveTo(-1, 0);
    g.lineTo(1, 0);
    g.strokeStyle = "red";
    g.stroke();

    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(0, 1);
    g.strokeStyle = "green";
    g.stroke();

    //g.rect(0, 0, 1, 1);
    //g.fillStyle = "rgb(50, 50, 50)";
    //g.fill();

    let f = this.xRange[0], steps = 64;
    let df = (this.xRange[1] - this.xRange[0])/(steps - 1);
    w = 6.0/sz;

    let curve = this.generators.active;

    g.beginPath();
    for (let i = 0; i < steps; i++, f += df) {
      let val = this.evaluate(f);

      (i === 0 ? g.moveTo : g.lineTo).call(g, f, val, w, w);
    }

    g.strokeStyle = "grey";
    g.stroke();

    if (this.overlay_curvefunc !== undefined) {
      g.beginPath();
      f = this.xRange[0];

      for (let i = 0; i < steps; i++, f += df) {
        let val = this.overlay_curvefunc(f);

        (i === 0 ? g.moveTo : g.lineTo).call(g, f, val, w, w);
      }

      g.strokeStyle = "green";
      g.stroke();
    }

    this.generators.active.draw(canvas, g, draw_transform);

    g.restore();
    return this;
  }

  loadSTRUCT(reader) {
    this.generators = [];
    reader(this);

    if (this.VERSION <= 0.75) {
      this.generators = [];

      for (let cls of CurveConstructors) {
        this.generators.push(new cls());
      }

      this.generators.active = this.getGenerator("BSplineCurve");
    }

    for (let gen of this.generators.concat([])) {
      if (!(gen instanceof CurveTypeData)) {
        console.warn("Bad generator data found:", gen);
        this.generators.remove(gen);
        continue;
      }

      if (gen.type === this._active) {
        this.generators.active = gen;
      }
    }

    for (let gen of this.generators) {
      gen.parent = this;
    }

    if (this.VERSION < 1.1) {
      this.#patchRange();
    }

    delete this._active;
    this.VERSION = CURVE_VERSION;
  }

  #patchRange() {
    let range = this.getGenerator("BSplineCurve").range;
    if (range) {
      this.xRange.load(range[0]);
      this.yRange.load(range[1]);
    }
  }
}

/* Remember to update toJSON() loadJSON api. */
Curve1D.STRUCT = `
Curve1D {
  generators  : array(abstract(CurveTypeData));
  _active     : string | obj.generators.active.type;
  VERSION     : float;
  uiZoom      : float;
  xRange      : vec2;
  yRange      : vec2;
  clipToRange : bool;
}
`;
nstructjs.register(Curve1D);

