import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {ToolPropertyIF, PropTypes, PropFlags} from "./toolprop_abstract.js";
import nstructjs from '../util/struct.js';

export {PropTypes, PropFlags} from './toolprop_abstract.js';

export const NumberConstraintsBase = new Set([
  'range', 'expRate', 'step', 'uiRange', 'baseUnit', 'displayUnit', 'stepIsRelative',
  'slideSpeed'
]);

export const IntegerConstraints = new Set([
  'radix'
].concat(util.list(NumberConstraintsBase)));

export const FloatConstrinats = new Set([
  'decimalPlaces'
].concat(util.list(NumberConstraintsBase)));

export const NumberConstraints = new Set(util.list(IntegerConstraints).concat(util.list(FloatConstrinats)));

export const PropSubTypes = {
  COLOR: 1
};

let first = (iter) => {
  if (iter === undefined) {
    return undefined;
  }

  if (!(Symbol.iterator in iter)) {
    for (let item in iter) {
      return item;
    }

    return undefined;
  }

  for (let item of iter) {
    return item;
  }
};

//set PropTypes to custom type integers
export function setPropTypes(types) {
  for (let k in types) {
    PropTypes[k] = types[k];
  }
}

export let customPropertyTypes = [];
export let PropClasses = {};

let customPropTypeBase = 17;

let wordmap = {
  sel  : "select",
  unsel: "deselect",
  eid  : "id",
  props: "properties",
  res  : "resource",

};

export var defaultRadix = 10;
export var defaultDecimalPlaces = 4;

class OnceTag {
  constructor(cb) {
    this.cb = cb;
  }
}

export class ToolProperty extends ToolPropertyIF {
  constructor(type, subtype, apiname, uiname = "", description = "", flag = 0, icon = -1) {
    super();

    this.data = undefined;

    if (type === undefined) {
      type = this.constructor.PROP_TYPE_ID;
    }

    this.type = type;
    this.subtype = subtype;

    //is false if this property still has its default value,
    //i.e. it hasn't been set by the user or anyone else
    this.wasSet = false;

    this.apiname = apiname;
    this.uiname = uiname !== undefined ? uiname : apiname;
    this.description = description;
    this.flag = flag;
    this.icon = icon;
    this.icon2 = icon; //another icon, e.g. unchecked state

    //remember to update NumberConstraintsBase et al when adding new number
    //constraints

    this.decimalPlaces = defaultDecimalPlaces;
    this.radix = defaultRadix;
    this.step = 0.05;

    this.callbacks = {};
  }

  static internalRegister(cls) {
    PropClasses[new cls().type] = cls;
  }

  static getClass(type) {
    return PropClasses[type];
  }

  static setDefaultRadix(n) {
    defaultRadix = n;
  }

  static setDefaultDecimalPlaces(n) {
    defaultDecimalPlaces = n;
  }

  static makeUIName(name) {
    let parts = [""];
    let lastc = undefined;

    let ischar = (c) => {
      c = c.charCodeAt(0);

      let upper = c >= "A".charCodeAt(0);
      upper = upper && c <= "Z".charCodeAt(0);

      let lower = c >= "a".charCodeAt(0);
      lower = lower && c <= "z".charCodeAt(0);

      return upper || lower;
    }

    for (let i = 0; i < name.length; i++) {
      let c = name[i];

      if (c === '_' || c === '-' || c === '$') {
        lastc = c;
        c = ' ';
        parts.push('');
        continue;
      }

      if (i > 0 && c === c.toUpperCase() && lastc !== lastc.toUpperCase()) {
        if (ischar(c) && ischar(lastc)) {
          parts.push('');
        }
      }

      parts[parts.length - 1] += c;
      lastc = c;
    }


    let subst = (word) => {
      if (word in wordmap) {
        return wordmap[word];
      } else {
        return word;
      }
    }

    parts = parts
      .filter(f => f.trim().length > 0)
      .map(f => subst(f))
      .map(f => f[0].toUpperCase() + f.slice(1, f.length).toLowerCase())
      .join(" ").trim();
    return parts;
  }

  static register(cls) {
    cls.PROP_TYPE_ID = (1<<customPropTypeBase);
    PropTypes[cls.name] = cls.PROP_TYPE_ID;

    customPropTypeBase++;
    customPropertyTypes.push(cls);

    PropClasses[new cls().type] = cls;

    return cls.PROP_TYPE_ID;
  }

  static calcRelativeStep(step, value, logBase = 1.5) {
    value = Math.log(Math.abs(value) + 1.0)/Math.log(logBase);
    value = Math.max(value, step);

    this.report(util.termColor("STEP", "red"), value);
    return value;
  }

  setDescription(s) {
    this.description = s;
    return this;
  }

  setUIName(s) {
    this.uiname = s;
    return this;
  }

  calcMemSize() {
    function strlen(s) {
      //length of string plus an assumed member pointer
      return s !== undefined ? s.length + 8 : 8;
    }

    let tot = 0;

    tot += strlen(this.apiname) + strlen(this.uiname);
    tot += strlen(this.description);

    tot += 11*8; //assumed member pointers
    for (let k in this.callbacks) {
      tot += 24;
    }

    return tot;
  }

  equals(b) {
    throw new Error("implement me");
  }

  private() {
    this.flag |= PropFlags.PRIVATE;
    return this;
  }

  saveLastValue() {
    this.flag |= PropFlags.SAVE_LAST_VALUE;
    return this;
  }

  report() {
    console.warn(...arguments);
  }

  _fire(type, arg1, arg2) {
    if (this.callbacks[type] === undefined) {
      return;
    }

    let stack = this.callbacks[type];
    stack = stack.concat([]); //copy

    for (let i = 0; i < stack.length; i++) {
      let cb = stack[i];

      if (cb instanceof OnceTag) {
        let j = i;

        //remove callback;
        while (j < stack.length - 1) {
          stack[j] = stack[j + 1];
          j++;
        }

        stack[j] = undefined;
        stack.length--;

        i--;

        cb.cb.call(this, arg1, arg2);
      } else {
        cb.call(this, arg1, arg2);
      }
    }

    return this;
  }

  clearEventCallbacks() {
    this.callbacks = {}
    return this;
  }

  once(type, cb) {
    if (this.callbacks[type] === undefined) {
      this.callbacks[type] = [];
    }

    //check if cb is already in callback list inside a OnceTag
    for (let cb2 of this.callbacks[type]) {
      if (cb2 instanceof OnceTag && cb2.cb === cb) {
        return;
      }
    }

    cb = new OnceTag(cb);

    this.callbacks[type].push(cb);

    return this;
  }

  on(type, cb) {
    if (this.callbacks[type] === undefined) {
      this.callbacks[type] = [];
    }

    this.callbacks[type].push(cb);
    return this;
  }

  off(type, cb) {
    this.callbacks[type].remove(cb);
    return this;
  }

  toJSON() {
    return {
      type       : this.type,
      subtype    : this.subtype,
      apiname    : this.apiname,
      uiname     : this.uiname,
      description: this.description,
      flag       : this.flag,
      icon       : this.icon,
      data       : this.data,
      range      : this.range,
      uiRange    : this.uiRange,
      step       : this.step
    };
  }

  loadJSON(obj) {
    this.type = obj.type;
    this.subtype = obj.subtype;
    this.apiname = obj.apiname;
    this.uiname = obj.uiname;
    this.description = obj.description;
    this.flag = obj.flag;
    this.icon = obj.icon;
    this.data = obj.data;

    return this;
  }

  getValue() {
    return this.data;
  }

  setValue(val) {
    if (this.constructor === ToolProperty) {
      throw new Error("implement me!");
    }

    this.wasSet = true;

    this._fire("change", val);
  }

  copyTo(b) {
    b.apiname = this.apiname;

    b.uiname = this.uiname;
    b.description = this.description;
    b.icon = this.icon;
    b.icon2 = this.icon2;

    b.baseUnit = this.baseUnit;
    b.subtype = this.subtype;
    b.displayUnit = this.displayUnit;

    b.flag = this.flag;

    for (let k in this.callbacks) {
      b.callbacks[k] = this.callbacks[k];
    }
  }

  copy() { //default copy method
    let ret = new this.constructor();

    this.copyTo(ret);

    return ret;
  }

  setStep(step) {
    this.step = step;
    return this;
  }

  getStep(value = 1.0) {
    if (this.stepIsRelative) {
      return ToolProperty.calcRelativeStep(this.step, value);
    } else {
      return this.step;
    }
  }

  setRelativeStep(step) {
    this.step = step;
    this.stepIsRelative = true;
  }

  setRange(min, max) {
    if (min === undefined || max === undefined) {
      throw new Error("min and/or max cannot be undefined");
    }

    this.range = [min, max];
    return this;
  }

  noUnits() {
    this.baseUnit = this.displayUnit = "none";
    return this;
  }

  setBaseUnit(unit) {
    this.baseUnit = unit;
    return this;
  }

  setDisplayUnit(unit) {
    this.displayUnit = unit;
    return this;
  }

  setUnit(unit) {
    this.baseUnit = this.displayUnit = unit;
    return this;
  }

  setFlag(f, combine = false) {
    this.flag = combine ? this.flag | f : f;
    return this;
  }

  setUIRange(min, max) {
    if (min === undefined || max === undefined) {
      throw new Error("min and/or max cannot be undefined");
    }

    this.uiRange = [min, max];
    return this;
  }

  setIcon(icon) {
    this.icon = icon;

    return this;
  }

  setIcon2(icon) {
    this.icon2 = icon;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (this.uiRange[0] === -1e17 && this.uiRange[1] === 1e17) {
      this.uiRange = undefined;
    }

    if (this.baseUnit === "undefined") {
      this.baseUnit = undefined;
    }

    if (this.displayUnit === "undefined") {
      this.displayUnit = undefined;
    }
  }
}

ToolProperty.STRUCT = `
ToolProperty { 
  apiname        : string | ""+this.apiname;
  type           : int;
  flag           : int;
  subtype        : int;
  icon           : int;
  icon2          : int;
  baseUnit       : string | ""+this.baseUnit;
  displayUnit    : string | ""+this.displayUnit;
  range          : array(float) | this.range ? this.range : [-1e17, 1e17];
  uiRange        : array(float) | this.uiRange ? this.uiRange : [-1e17, 1e17];
  description    : string;
  stepIsRelative : bool;
  step           : float;
  expRate        : float;
  radix          : float;
  decimalPlaces  : int;
  uiname         : string | this.uiname || this.apiname || "";
  wasSet         : bool;
}
`;
nstructjs.register(ToolProperty);

window.ToolProperty = ToolProperty;

export class FloatArrayProperty extends ToolProperty {
  constructor(value, apiname, uiname, description, flag, icon) {
    super(PropTypes.FLOAT_ARRAY, undefined, apiname, uiname, description, flag, icon);

    this.value = [];

    if (value !== undefined) {
      this.setValue(value);
    }
  }

  [Symbol.iterator]() {
    return this.value[Symbol.iterator]();
  }

  setValue(value) {
    super.setValue();

    if (value === undefined) {
      throw new Error("value was undefined in FloatArrayProperty's setValue method");
    }

    this.value.length = 0;

    for (let item of value) {
      if (typeof item !== "number" && typeof item !== "boolean") {
        console.log(value);
        throw new Error("bad item for FloatArrayProperty " + item);
      }

      this.value.push(item);
    }
  }

  push(item) {
    if (typeof item !== "number" && typeof item !== "boolean") {
      console.log(value);
      throw new Error("bad item for FloatArrayProperty " + item);
    }

    this.value.push(item);
  }

  getValue() {
    return this.value;
  }

  clear() {
    this.value.length = 0;
    return this;
  }
}

FloatArrayProperty.STRUCT = nstructjs.inherit(FloatArrayProperty, ToolProperty) + `
  value : array(float);
}`;
nstructjs.register(FloatArrayProperty);

export class StringProperty extends ToolProperty {
  constructor(value, apiname, uiname, description, flag, icon) {
    super(PropTypes.STRING, undefined, apiname, uiname, description, flag, icon);

    this.multiLine = false;

    if (value) {
      this.setValue(value);
    } else {
      this.setValue("");
    }

    this.wasSet = false;
  }

  calcMemSize() {
    return super.calcMemSize() + (this.data !== undefined ? this.data.length*4 : 0) + 8;
  }

  equals(b) {
    return this.data === b.data;
  }

  copyTo(b) {
    super.copyTo(b);

    b.data = this.data;
    b.multiLine = this.multiLine;

    return this;
  }

  getValue() {
    return this.data;
  }

  setValue(val) {
    //fire events
    super.setValue(val);
    this.data = val;
  }
}

StringProperty.STRUCT = nstructjs.inherit(StringProperty, ToolProperty) + `
  data : string;
}
`;
nstructjs.register(StringProperty);
ToolProperty.internalRegister(StringProperty);

/*
let num_res = [
  /([0-9]+)/,
  /((0x)?[0-9a-fA-F]+(h?))/,
  /([0-9]+\.[0-9]*)/,
  /([0-9]*\.[0-9]+)/,
  /(\.[0-9]+)/
];
//num_re = /([0-9]+\.[0-9]*)|([0-9]*\.[0-9]+)/
*/

export {isNumber} from '../../core/units.js';
/*
export function isNumber(f) {
  if (f === "NaN" || (typeof f == "number" && isNaN(f))) {
    return false;
  }

  f = ("" + f).trim();

  let ok = false;

  for (let re of num_res) {
    let ret = f.match(re)
    if (!ret) {
      ok = false;
      continue;
    }

    ok = ret[0].length === f.length;
    if (ok) {
      break;
    }
  }

  return ok;
}*/

//window.isNumber = isNumber;

export class NumProperty extends ToolProperty {
  constructor(type, value, apiname,
              uiname, description, flag, icon) {
    super(type, undefined, apiname, uiname, description, flag, icon);

    this.data = 0;
    this.range = [0, 0];
  }

  equals(b) {
    return this.data == b.data;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
};
NumProperty.STRUCT = nstructjs.inherit(NumProperty, ToolProperty) + `
  range : array(float);
  data  : float;
}
`;

export class _NumberPropertyBase extends ToolProperty {
  constructor(type, value, apiname,
              uiname, description, flag, icon) {
    super(type, null, apiname, uiname, description, flag, icon);

    this.data = 0.0;

    //remember to update NumberConstraintsBase et al when adding new number
    //constraints

    /** controls roller slider rate */
    this.slideSpeed = 1.0;

    /** exponential rate, used by roller sliders */
    this.expRate = 1.33;
    this.step = 0.1;

    this.stepIsRelative = false;

    this.range = [-1e17, 1e17];

    /** if undefined this.range will be used */
    this.uiRange = undefined;

    if (value !== undefined && value !== null) {
      this.setValue(value);
      this.wasSet = false;
    }
  }

  get ui_range() {
    this.report("NumberProperty.ui_range is deprecated");
    return this.uiRange;
  }

  set ui_range(val) {
    this.report("NumberProperty.ui_range is deprecated");
    this.uiRange = val;
  }

  calcMemSize() {
    return super.calcMemSize() + 8*8;
  }

  equals(b) {
    return this.data === b.data;
  }

  toJSON() {
    let json = super.toJSON();

    json.data = this.data;
    json.expRate = this.expRate;

    return json;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.data = obj.data || this.data;
    this.expRate = obj.expRate || this.expRate;

    return this;
  }

  copyTo(b) {
    super.copyTo(b);

    b.displayUnit = this.displayUnit;
    b.baseUnit = this.baseUnit;
    b.expRate = this.expRate;
    b.step = this.step;
    b.range = this.range ? [this.range[0], this.range[1]] : undefined;
    b.uiRange = this.uiRange ? [this.uiRange[0], this.uiRange[1]] : undefined;
    b.slideSpeed = this.slideSpeed;
    
    b.data = this.data;
  }


  setSlideSpeed(f) {
    this.slideSpeed = f;

    return this;
  }

  /*
  * non-linear exponent for number sliders
  * in roll mode
  * */
  setExpRate(exp) {
    this.expRate = exp;
  }

  setValue(val) {
    if (val === undefined || val === null) {
      return;
    }

    if (typeof val !== "number") {
      throw new Error("Invalid number " + val);
    }

    this.data = val;

    super.setValue(val);
    return this;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    let get = (key) => {
      if (key in obj) {
        this[key] = obj[key];
      }
    };

    get("range");
    get("step");
    get("expRate");
    get("ui_range");

    return this;
  }
};
_NumberPropertyBase.STRUCT = nstructjs.inherit(_NumberPropertyBase, ToolProperty) + `
  range      : array(float);
  expRate    : float;
  data       : float;
  step       : float;
  slideSpeed : float;
}
`;
nstructjs.register(_NumberPropertyBase);

export class IntProperty extends _NumberPropertyBase {
  constructor(value, apiname,
              uiname, description, flag, icon) {
    super(PropTypes.INT, value, apiname, uiname, description, flag, icon);

    //remember to update NumberConstraintsBase et al when adding new number
    //constraints

    /* Integer properties don't use default unit. */
    this.baseUnit = this.displayUnit = "none";

    this.radix = 10;
  }

  setValue(val) {
    super.setValue(Math.floor(val));
    return this;
  }

  setRadix(radix) {
    this.radix = radix;
  }

  toJSON() {
    let json = super.toJSON();

    json.data = this.data;
    json.radix = this.radix;

    return json;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.data = obj.data || this.data;
    this.radix = obj.radix || this.radix;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

IntProperty.STRUCT = nstructjs.inherit(IntProperty, _NumberPropertyBase) + `
  data : int;
}`;
nstructjs.register(IntProperty);

ToolProperty.internalRegister(IntProperty);

export class ReportProperty extends StringProperty {
  constructor(value, apiname, uiname, description, flag, icon) {
    super(value, apiname, uiname, description, flag, icon);

    this.type = PropTypes.REPORT;
  }
}

ReportProperty.STRUCT = nstructjs.inherit(ReportProperty, StringProperty) + `
}
`;
nstructjs.register(ReportProperty);
ToolProperty.internalRegister(ReportProperty);

export class BoolProperty extends ToolProperty {
  constructor(value, apiname,
              uiname, description, flag, icon) {
    super(PropTypes.BOOL, undefined, apiname, uiname, description, flag, icon);

    this.data = !!value;
  }

  equals(b) {
    return this.data == b.data;
  }

  copyTo(b) {
    super.copyTo(b);
    b.data = this.data;

    return this;
  }

  setValue(val) {
    this.data = !!val;
    super.setValue(val);

    return this;
  }

  getValue() {
    return this.data;
  }

  toJSON() {
    let ret = super.toJSON();

    return ret;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    return this;
  }
}

ToolProperty.internalRegister(BoolProperty);
BoolProperty.STRUCT = nstructjs.inherit(BoolProperty, ToolProperty) + `
  data : bool;
}
`;
nstructjs.register(BoolProperty);


export class FloatProperty extends _NumberPropertyBase {
  constructor(value, apiname,
              uiname, description, flag, icon) {
    super(PropTypes.FLOAT, value, apiname, uiname, description, flag, icon);

    //remember to update NumberConstraintsBase et al when adding new number
    //constraints

    this.decimalPlaces = 4;
  }

  setDecimalPlaces(n) {
    this.decimalPlaces = n;
    return this;
  }

  copyTo(b) {
    super.copyTo(b);
    b.data = this.data;
    return this;
  }

  setValue(val) {
    this.data = val;

    //fire events
    super.setValue(val);

    return this;
  }

  toJSON() {
    let json = super.toJSON();

    json.data = this.data;
    json.decimalPlaces = this.decimalPlaces;

    return json;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.data = obj.data || this.data;
    this.decimalPlaces = obj.decimalPlaces || this.decimalPlaces;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

ToolProperty.internalRegister(FloatProperty);
FloatProperty.STRUCT = nstructjs.inherit(FloatProperty, _NumberPropertyBase) + `
  decimalPlaces : int;
  data          : float;
}
`;
nstructjs.register(FloatProperty);

export class EnumKeyPair {
  constructor(key, val) {
    this.key = "" + key;
    this.val = "" + val;
    this.key_is_int = typeof key === "number" || typeof key === "boolean";
    this.val_is_int = typeof val === "number" || typeof val === "boolean";
  }

  loadSTRUCT(reader) {
    reader(this);

    if (this.val_is_int) {
      this.val = parseInt(this.val);
    }

    if (this.key_is_int) {
      this.key = parseInt(this.key);
    }
  }
}

EnumKeyPair.STRUCT = `
EnumKeyPair {
  key        : string;
  val        : string;
  key_is_int : bool;
  val_is_int : bool; 
}
`
nstructjs.register(EnumKeyPair);

export class EnumProperty extends ToolProperty {
  constructor(string_or_int, valid_values, apiname,
              uiname, description, flag, icon) {
    super(PropTypes.ENUM, undefined, apiname, uiname, description, flag, icon);

    this.values = {};
    this.keys = {};
    this.ui_value_names = {};
    this.descriptions = {};

    if (valid_values === undefined) return this;

    if (valid_values instanceof Array || valid_values instanceof String) {
      for (var i = 0; i < valid_values.length; i++) {
        this.values[valid_values[i]] = valid_values[i];
        this.keys[valid_values[i]] = valid_values[i];
      }
    } else {
      for (var k in valid_values) {
        this.values[k] = valid_values[k];
        this.keys[valid_values[k]] = k;
      }
    }

    if (string_or_int === undefined) {
      this.data = first(valid_values);
    } else {
      this.setValue(string_or_int);
    }

    for (var k in this.values) {
      let uin = k.replace(/[_-]/g, " ").trim();
      uin = uin.split(" ")

      let uiname = ToolProperty.makeUIName(k);

      this.ui_value_names[k] = uiname;
      this.descriptions[k] = uiname;
    }

    this.iconmap = {};
    this.iconmap2 = {};

    this.wasSet = false;
  }

  calcHash(digest = new util.HashDigest()) {
    for (let key in this.keys) {
      digest.add(key);
      digest.add(this.keys[key]);
    }

    return digest.get();
  }

  updateDefinition(enumdef_or_prop) {
    let descriptions = this.descriptions;
    let ui_value_names = this.ui_value_names;

    this.values = {};
    this.keys = {};
    this.ui_value_names = {};
    this.descriptions = {};

    let enumdef;

    if (enumdef_or_prop instanceof EnumProperty) {
      enumdef = enumdef_or_prop.values;
    } else {
      enumdef = enumdef_or_prop;
    }

    for (let k in enumdef) {
      let v = enumdef[k];

      this.values[k] = v;
      this.keys[v] = k;
    }

    if (enumdef_or_prop instanceof EnumProperty) {
      let prop = enumdef_or_prop;
      this.iconmap = Object.assign({}, prop.iconmap);
      this.iconmap2 = Object.assign({}, prop.iconmap2);

      this.ui_value_names = Object.assign({}, prop.ui_value_names);
      this.descriptions = Object.assign({}, prop.descriptions);
    } else {
      for (let k in this.values) {
        if (k in ui_value_names) {
          this.ui_value_names[k] = ui_value_names[k];
        } else {
          this.ui_value_names[k] = ToolProperty.makeUIName(k);
        }

        if (k in descriptions) {
          this.descriptions[k] = descriptions[k];
        } else {
          this.descriptions[k] = ToolProperty.makeUIName(k);
        }
      }
    }

    this._fire('metaChange', this);

    return this;
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    for (let k in this.values) {
      tot += (k.length*4 + 16)*4;
    }

    if (this.descriptions) {
      for (let k in this.descriptions) {
        tot += (k.length + this.descriptions[k].length)*4;
      }
    }

    return tot + 64;
  }

  equals(b) {
    return this.getValue() === b.getValue();
  }

  addUINames(map) {
    for (let k in map) {
      this.ui_value_names[k] = map[k];
    }

    return this;
  }

  addDescriptions(map) {
    for (let k in map) {
      this.descriptions[k] = map[k];
    }

    return this;
  }

  addIcons2(iconmap2) {
    if (this.iconmap2 === undefined) {
      this.iconmap2 = {};
    }

    for (let k in iconmap2) {
      this.iconmap2[k] = iconmap2[k];
    }

    return this;
  }

  addIcons(iconmap) {
    if (this.iconmap === undefined) {
      this.iconmap = {};
    }
    for (let k in iconmap) {
      this.iconmap[k] = iconmap[k];
    }

    return this;
  }

  copyTo(p) {
    super.copyTo(p);

    p.data = this.data;

    p.keys = Object.assign({}, this.keys);
    p.values = Object.assign({}, this.values);
    p.ui_value_names = this.ui_value_names;
    p.update = this.update;
    p.api_update = this.api_update;

    p.iconmap = this.iconmap;
    p.iconmap2 = this.iconmap2;
    p.descriptions = this.descriptions;

    return p;
  }

  copy() {
    var p = new this.constructor("dummy", {"dummy": 0}, this.apiname, this.uiname, this.description, this.flag)

    this.copyTo(p);
    return p;
  }

  getValue() {
    if (this.data in this.values)
      return this.values[this.data];
    else
      return this.data;
  }

  setValue(val) {
    if (!(val in this.values) && (val in this.keys))
      val = this.keys[val];

    if (!(val in this.values)) {
      this.report("Invalid value for enum!", val, this.values);
      return;
    }

    this.data = val;

    //fire events
    super.setValue(val);
    return this;
  }

  _loadMap(obj) {
    if (!obj) {
      return {};
    }

    let ret = {};
    for (let k of obj) {
      ret[k.key] = k.val;
    }

    return ret;
  }

  _saveMap(obj) {
    obj = obj === undefined ? {} : obj;
    let ret = [];

    for (let k in obj) {
      ret.push(new EnumKeyPair(k, obj[k]));
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.keys = this._loadMap(this._keys);
    this.values = this._loadMap(this._values);
    this.ui_value_names = this._loadMap(this._ui_value_names);
    this.iconmap = this._loadMap(this._iconmap);
    this.iconmap2 = this._loadMap(this._iconmap2);
    this.descriptions = this._loadMap(this._descriptions);

    if (this.data_is_int) {
      this.data = parseInt(this.data);
      delete this.data_is_int;
    } else if (this.data in this.keys) {
      this.data = this.keys[this.data];
    }
  }

  _is_data_int() {
    return typeof this.data === "number";
  }
}

ToolProperty.internalRegister(EnumProperty);
EnumProperty.STRUCT = nstructjs.inherit(EnumProperty, ToolProperty) + `
  data            : string             | ""+this.data;
  data_is_int     : bool               | this._is_data_int();
  _keys           : array(EnumKeyPair) | this._saveMap(this.keys) ;
  _values         : array(EnumKeyPair) | this._saveMap(this.values) ;
  _ui_value_names : array(EnumKeyPair) | this._saveMap(this.ui_value_names) ;
  _iconmap        : array(EnumKeyPair) | this._saveMap(this.iconmap) ;
  _iconmap2       : array(EnumKeyPair) | this._saveMap(this.iconmap2) ;
  _descriptions   : array(EnumKeyPair) | this._saveMap(this.descriptions) ;  
}
`;
nstructjs.register(EnumProperty);

export class FlagProperty extends EnumProperty {
  constructor(string_or_int, valid_values, apiname,
              uiname, description, flag, icon) {
    super(string_or_int, valid_values, apiname,
      uiname, description, flag, icon);

    this.type = PropTypes.FLAG;
    this.wasSet = false;
  }

  setValue(bitmask) {
    this.data = bitmask;

    //do not trigger EnumProperty's setValue
    ToolProperty.prototype.setValue.call(this, bitmask);
    return this;
  }
}

ToolProperty.internalRegister(FlagProperty);
FlagProperty.STRUCT = nstructjs.inherit(FlagProperty, EnumProperty) + `
}
`;
nstructjs.register(FlagProperty);


export class VecPropertyBase extends FloatProperty {
  constructor(data, apiname, uiname, description) {
    super(undefined, apiname, uiname, description);

    this.hasUniformSlider = false;
  }

  calcMemSize() {
    return super.calcMemSize() + this.data.length*8;
  }

  equals(b) {
    return this.data.vectorDistance(b.data) < 0.00001;
  }

  uniformSlider(state = true) {
    this.hasUniformSlider = state;
    return this;
  }

  copyTo(b) {
    super.copyTo(b);
    b.hasUniformSlider = this.hasUniformSlider;
  }
}

VecPropertyBase.STRUCT = nstructjs.inherit(VecPropertyBase, FloatProperty) + `
  hasUniformSlider : bool | this.hasUniformSlider || false;
}
`;


export class Vec2Property extends FloatProperty {
  constructor(data, apiname, uiname, description) {
    super(undefined, apiname, uiname, description);

    this.type = PropTypes.VEC2;
    this.data = new Vector2(data);
  }

  setValue(v) {
    this.data.load(v);

    //do not trigger parent classes's setValue
    ToolProperty.prototype.setValue.call(this, v);
    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    let data = b.data;
    super.copyTo(b);

    b.data = data;
    b.data.load(this.data);
  }
}

Vec2Property.STRUCT = nstructjs.inherit(Vec2Property, VecPropertyBase) + `
  data : vec2;
}
`;
nstructjs.register(Vec2Property);

ToolProperty.internalRegister(Vec2Property);

export class Vec3Property extends VecPropertyBase {
  constructor(data, apiname, uiname, description) {
    super(undefined, apiname, uiname, description);

    this.type = PropTypes.VEC3;
    this.data = new Vector3(data);
  }

  isColor() {
    this.subtype = PropSubTypes.COLOR;
    return this;
  }

  setValue(v) {
    this.data.load(v);

    //do not trigger parent classes's setValue
    ToolProperty.prototype.setValue.call(this, v);
    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    let data = b.data;
    super.copyTo(b);

    b.data = data;
    b.data.load(this.data);
  }
}

Vec3Property.STRUCT = nstructjs.inherit(Vec3Property, VecPropertyBase) + `
  data : vec3;
}
`;
nstructjs.register(Vec3Property);
ToolProperty.internalRegister(Vec3Property);

export class Vec4Property extends FloatProperty {
  constructor(data, apiname, uiname, description) {
    super(undefined, apiname, uiname, description);

    this.type = PropTypes.VEC4;
    this.data = new Vector4(data);
  }

  setValue(v, w = 1.0) {
    this.data.load(v);

    //do not trigger parent classes's setValue
    ToolProperty.prototype.setValue.call(this, v);

    if (v.length < 3) {
      this.data[2] = 0.0;
    }
    if (v.length < 4) {
      this.data[3] = w;
    }

    return this;
  }

  isColor() {
    this.subtype = PropSubTypes.COLOR;
    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    let data = b.data;
    super.copyTo(b);

    b.data = data;
    b.data.load(this.data);
  }
}

Vec4Property.STRUCT = nstructjs.inherit(Vec4Property, VecPropertyBase) + `
  data : vec4;
}
`;
nstructjs.register(Vec4Property);
ToolProperty.internalRegister(Vec4Property);

export class QuatProperty extends ToolProperty {
  constructor(data, apiname, uiname, description) {
    super(PropTypes.QUAT, undefined, apiname, uiname, description);
    this.data = new Quat(data);
  }

  equals(b) {
    return this.data.vectorDistance(b.data) < 0.00001;
  }

  setValue(v) {
    this.data.load(v);
    super.setValue(v);
    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    let data = b.data;
    super.copyTo(b);

    b.data = data;
    b.data.load(this.data);
  }
}

QuatProperty.STRUCT = nstructjs.inherit(QuatProperty, VecPropertyBase) + `
  data : vec4;
}
`;
nstructjs.register(QuatProperty);

ToolProperty.internalRegister(QuatProperty);

export class Mat4Property extends ToolProperty {
  constructor(data, apiname, uiname, description) {
    super(PropTypes.MATRIX4, undefined, apiname, uiname, description);
    this.data = new Matrix4(data);
  }

  calcMemSize() {
    return super.calcMemSize() + 16*8 + 32;
  }

  equals(b) {
    let m1 = this.data.$matrix;
    let m2 = b.data.$matrix;

    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 4; j++) {
        let key = `m${i}${j}`;

        if (Math.abs(m1[key] - m2[key]) > 0.00001) {
          return false;
        }
      }
    }

    return true;
  }

  setValue(v) {
    this.data.load(v);
    super.setValue(v);
    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    let data = b.data;
    super.copyTo(b);
    b.data = data;

    b.data.load(this.data);
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

Mat4Property.STRUCT = nstructjs.inherit(Mat4Property, FloatProperty) + `
  data           : mat4;
}
`;
nstructjs.register(Mat4Property);
ToolProperty.internalRegister(Mat4Property);

/**
 * List of other tool props (all of one type)
 */
export class ListProperty extends ToolProperty {
  /*
  * Prop must be a ToolProperty subclass instance
  * */
  constructor(prop, list = [], uiname = "") {
    super(PropTypes.PROPLIST);

    this.uiname = uiname;

    if (typeof prop == "number") {
      prop = PropClasses[prop];

      if (prop !== undefined) {
        prop = new prop();
      }
    } else if (prop !== undefined) {
      if (prop instanceof ToolProperty) {
        prop = prop.copy();
      } else {
        prop = new prop();
      }
    }


    this.prop = prop;
    this.value = [];

    if (list) {
      for (let val of list) {
        this.push(val);
      }
    }

    this.wasSet = false;
  }

  get length() {
    return this.value.length;
  }

  set length(val) {
    this.value.length = val;
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    let psize = this.prop ? this.prop.calcMemSize() + 8 : 8;
    if (!this.prop && this.value.length > 0) {
      psize = this.value[0].calcMemSize();
    }

    tot += psize*this.value.length + 8;
    tot += 16;

    return tot;
  }

  equals(b) {
    let l1 = this.value ? this.value.length : 0;
    let l2 = b.value ? b.value.length : 0;

    if (l1 !== l2) {
      return false;
    }

    for (let i = 0; i < l1; i++) {
      let prop1 = this.value[i];
      let prop2 = b.value[i];

      let bad = prop1.constructor !== prop2.constructor;
      bad = bad || !prop1.equals(prop2);

      if (bad) {
        return false;
      }
    }

    return true;
  }

  copyTo(b) {
    super.copyTo(b);

    b.prop = this.prop.copy();

    for (let prop of this.value) {
      b.value.push(prop.copy());
    }

    return b;
  }

  copy() {
    return this.copyTo(new ListProperty(this.prop.copy()));
  }

  push(item = undefined) {
    if (item === undefined) {
      item = this.prop.copy();
    }

    if (!(item instanceof ToolProperty)) {
      let prop = this.prop.copy();
      prop.setValue(item);
      item = prop;
    }

    this.value.push(item);
    return item;
  }

  clear() {
    this.value.length = 0;
  }

  getListItem(i) {
    return this.value[i].getValue();
  }

  setListItem(i, val) {
    this.value[i].setValue(val);
  }

  setValue(value) {
    this.clear();

    for (let item of value) {
      let prop = this.push();

      if (typeof item !== "object") {
        prop.setValue(item);
      } else if (item instanceof prop.constructor) {
        item.copyTo(prop);
      } else {
        this.report(item);
        throw new Error("invalid value " + item);
      }
    }

    super.setValue(value);
    return this;
  }

  getValue() {
    return this.value;
  }

  [Symbol.iterator]() {
    let list = this.value;

    return (function* () {
      for (let item of list) {
        yield item.getValue();
      }
    })();
  }
}

ListProperty.STRUCT = nstructjs.inherit(ListProperty, ToolProperty) + `
  prop  : abstract(ToolProperty);
  value : array(abstract(ToolProperty));
}`;
nstructjs.register(ListProperty);

ToolProperty.internalRegister(ListProperty);


//like FlagsProperty but uses strings
export class StringSetProperty extends ToolProperty {
  constructor(value = undefined, definition = []) {
    super(PropTypes.STRSET);

    let values = [];

    this.value = new util.set();

    let def = definition;
    if (Array.isArray(def) || def instanceof util.set || def instanceof Set) {
      for (let item of def) {
        values.push(item);
      }
    } else if (typeof def === "object") {
      for (let k in def) {
        values.push(k);
      }
    } else if (typeof def === "string") {
      values.push(def);
    }

    this.values = {};
    this.ui_value_names = {};
    this.descriptions = {};
    this.iconmap = {};
    this.iconmap2 = {};

    for (let v of values) {
      this.values[v] = v;

      let uiname = ToolProperty.makeUIName(v);
      this.ui_value_names[v] = uiname;
    }

    if (value !== undefined) {
      this.setValue(value);
    }

    this.wasSet = false;
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    for (let k in this.values) {
      tot += (k.length + 16)*5;
    }

    if (this.descriptions) {
      for (let k in this.descriptions) {
        tot += (k.length + this.descriptions[k].length + 8)*4;
      }
    }

    return tot + 64;
  }

  equals(b) {
    return this.value.equals(b.value);
  }

  /*
  * Values can be a string, undefined/null, or a list/set/object-literal of strings.
  * If destructive is true, then existing set will be cleared.
  * */
  setValue(values, destructive = true, soft_fail = true) {
    let bad = typeof values !== "string";
    bad = bad && typeof values !== "object";
    bad = bad && values !== undefined && values !== null;

    if (bad) {
      if (soft_fail) {
        this.report("Invalid argument to StringSetProperty.prototype.setValue() " + values);
        return;
      } else {
        throw new Error("Invalid argument to StringSetProperty.prototype.setValue() " + values);
      }
    }

    //handle undefined/null
    if (!values) {
      this.value.clear();
    } else if (typeof values === "string") {
      if (destructive)
        this.value.clear();

      if (!(values in this.values)) {
        if (soft_fail) {
          this.report(`"${values}" is not in this StringSetProperty`);
          return;
        } else {
          throw new Error(`"${values}" is not in this StringSetProperty`);
        }
      }

      this.value.add(values);
    } else {
      let data = [];

      if (Array.isArray(values) || values instanceof util.set || values instanceof Set) {
        for (let item of values) {
          data.push(item);
        }
      } else { //object literal?
        for (let k in values) {
          data.push(k);
        }
      }

      for (let item of data) {
        if (!(item in this.values)) {
          if (soft_fail) {
            this.report(`"${item}" is not in this StringSetProperty`);
            continue;
          } else {
            throw new Error(`"${item}" is not in this StringSetProperty`);
          }
        }

        this.value.add(item);
      }
    }

    super.setValue();
    return this;
  }

  getValue() {
    return this.value;
  }

  addIcons2(iconmap2) {
    if (iconmap2 === undefined)
      return;

    for (let k in iconmap2) {
      this.iconmap2[k] = iconmap2[k];
    }

    return this;
  }

  addIcons(iconmap) {
    if (iconmap === undefined)
      return;

    for (let k in iconmap) {
      this.iconmap[k] = iconmap[k];
    }

    return this;
  }

  addUINames(map) {
    for (let k in map) {
      this.ui_value_names[k] = map[k];
    }

    return this;
  }

  addDescriptions(map) {
    for (let k in map) {
      this.descriptions[k] = map[k];
    }

    return this;
  }

  copyTo(b) {
    super.copyTo(b);

    for (let val of this.value) {
      b.value.add(val);
    }

    b.values = {};
    for (let k in this.values) {
      b.values[k] = this.values[k];
    }

    b.ui_value_names = {};
    for (let k in this.ui_value_names) {
      b.ui_value_names[k] = this.ui_value_names[k];
    }

    b.iconmap = {};
    b.iconmap2 = {};

    for (let k in this.iconmap) {
      b.iconmap[k] = this.iconmap[k];
    }

    for (let k in this.iconmap2) {
      b.iconmap2[k] = this.iconmap2[k];
    }

    b.descriptions = {};
    for (let k in this.descriptions) {
      b.descriptions[k] = this.descriptions[k];
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    let values = this.values;
    this.values = {};

    for (let s of values) {
      this.values[s] = s;
    }

    this.value = new util.set(this.value);
  }
}

StringSetProperty.STRUCT = nstructjs.inherit(StringSetProperty, ToolProperty) + `
  value  : iter(string);
  values : iterkeys(string);  
}`;
nstructjs.register(StringSetProperty);

ToolProperty.internalRegister(StringSetProperty);

import {Curve1D} from '../curve/curve1d.js';

export class Curve1DProperty extends ToolProperty {
  constructor(curve, apiname, uiname, description, flag, icon) {
    super(PropTypes.CURVE, undefined, apiname, uiname, description, flag, icon);

    this.data = new Curve1D();

    if (curve !== undefined) {
      this.setValue(curve);
    }

    this.wasSet = false;
  }

  calcMemSize() {
    //bleh, just return a largish block size
    return 1024;
  }

  equals(b) {

  }

  getValue() {
    return this.data;
  }

  evaluate(t) {
    return this.data.evaluate(t);
  }

  setValue(curve) {
    if (curve === undefined) {
      return;
    }

    this.data.load(curve);
    super.setValue(curve);
  }

  copyTo(b) {
    super.copyTo(b);

    b.setValue(this.data);
  }
}

Curve1DProperty.STRUCT = nstructjs.inherit(Curve1DProperty, ToolProperty) + `
  data : Curve1D;
}
`;

nstructjs.register(Curve1DProperty);
ToolProperty.internalRegister(Curve1DProperty);

