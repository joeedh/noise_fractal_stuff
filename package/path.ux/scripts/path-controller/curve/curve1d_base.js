import nstructjs from "../util/struct.js";
import * as util from '../util/util.js';

export const CurveConstructors = [];
export const CURVE_VERSION = 1.1;

export const CurveFlags = {
  SELECT   : 1,
  TRANSFORM: 2,
};


export const TangentModes = {
  SMOOTH: 1,
  BREAK : 2
};

export function getCurve(type, throw_on_error = true) {
  for (let cls of CurveConstructors) {
    if (cls.name === type)
      return cls;
    if (cls.define().name === type)
      return cls;
  }

  if (throw_on_error) {
    throw new Error("Unknown curve type " + type)
  } else {
    console.warn("Unknown curve type", type);
    return getCurve("ease");
  }
}

let _udigest = new util.HashDigest();

export class CurveTypeData {
  constructor() {
    this.type = this.constructor.define().typeName;
    this.parent = undefined;
  }

  get hasGUI() {
    throw new Error("get hasGUI(): implement me!");
  }

  static register(cls) {
    if (cls.define === CurveTypeData.define) {
      throw new Error("missing define() static method");
    }

    let def = cls.define();

    if (!def.name) {
      throw new Error(cls.name + ".define() result is missing 'name' field");
    }

    if (!def.typeName) {
      throw new Error(cls.name + ".define() is missing .typeName, which should equal class name; needed for minificaiton");
    }

    CurveConstructors.push(cls);
  }

  static define() {
    return {
      uiname  : "Some Curve",
      name    : "somecurve",
      typeName: CurveTypeData
    }
  }

  calcHashKey(digest = _udigest.reset()) {
    let d = digest;

    d.add(this.type);

    return d.get();
  }

  toJSON() {
    return {
      type: this.type
    }
  }

  equals(b) {
    return this.type === b.type;
  }

  loadJSON(obj) {
    this.type = obj.type;

    return this;
  }

  redraw() {
    if (this.parent)
      this.parent.redraw();
  }

  makeGUI(container) {

  }

  killGUI(container) {
    container.clear();
  }

  evaluate(s) {
    throw new Error("implement me!");
  }

  integrate(s1, quadSteps = 64) {
    let ret = 0.0, ds = s1/quadSteps;

    for (let i = 0, s = 0; i < quadSteps; i++, s += ds) {
      ret += this.evaluate(s)*ds;
    }

    return ret;
  }

  derivative(s) {
    let df = 0.0001;

    if (s > 1.0 - df*3) {
      return (this.evaluate(s) - this.evaluate(s - df))/df;
    } else if (s < df*3) {
      return (this.evaluate(s + df) - this.evaluate(s))/df;
    } else {
      return (this.evaluate(s + df) - this.evaluate(s - df))/(2*df);
    }
  }

  derivative2(s) {
    let df = 0.0001;

    if (s > 1.0 - df*3) {
      return (this.derivative(s) - this.derivative(s - df))/df;
    } else if (s < df*3) {
      return (this.derivative(s + df) - this.derivative(s))/df;
    } else {
      return (this.derivative(s + df) - this.derivative(s - df))/(2*df);
    }
  }

  inverse(y) {
    let steps = 9;
    let ds = 1.0/steps, s = 0.0;
    let best = undefined;
    let ret = undefined;

    for (let i = 0; i < steps; i++, s += ds) {
      let s1 = s, s2 = s + ds;

      let mid;

      for (let j = 0; j < 11; j++) {
        let y1 = this.evaluate(s1);
        let y2 = this.evaluate(s2);
        mid = (s1 + s2)*0.5;

        if (Math.abs(y1 - y) < Math.abs(y2 - y)) {
          s2 = mid;
        } else {
          s1 = mid;
        }
      }

      let ymid = this.evaluate(mid);

      if (best === undefined || Math.abs(y - ymid) < best) {
        best = Math.abs(y - ymid);
        ret = mid;
      }
    }

    return ret === undefined ? 0.0 : ret;
  }

  onActive(parent, draw_transform) {
  }

  onInactive(parent, draw_transform) {
  }

  reset() {

  }

  destroy() {
  }

  update() {
    if (this.parent)
      this.parent._on_change();
  }

  draw(canvas, g, draw_transform) {
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

CurveTypeData.STRUCT = `
CurveTypeData {
  type : string;
}
`;
nstructjs.register(CurveTypeData);


const unitRange = [0, 1];

export function evalHermiteTable(table, t, range = unitRange) {
  t = (t - range[0])/(range[1] - range[0]);

  let s = t*(table.length/4);
  let i = Math.floor(s);

  s -= i;
  i *= 4;

  let a = table[i] + (table[i + 1] - table[i])*s;
  let b = table[i + 2] + (table[i + 3] - table[i + 2])*s;

  return a + (b - a)*s;
  //return table[i] + (table[i + 3] - table[i])*s;
}

export function genHermiteTable(evaluate, steps, range = [0, 1]) {
  //console.log("building spline approx");

  let table = new Array(steps);

  let [min, max] = range;

  let eps = 0.0001;
  let dt = ((max - min) - eps*4.001)/(steps - 1);
  let t = min + eps*4;
  let lastdv1, lastf3;

  for (let j = 0; j < steps; j++, t += dt) {
    //let f1 = evaluate(t - eps*2);
    let f2 = evaluate(t - eps);
    let f3 = evaluate(t);
    let f4 = evaluate(t + eps);
    //let f5 = evaluate(t + eps*2);

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

  return table;
}
