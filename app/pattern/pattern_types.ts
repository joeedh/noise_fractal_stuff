//used for nstructjs
import {nstructjs, PropFlags, util, Vector2, Vector3, Vector4, ToolProperty, DataAPI, DataStruct, DataPath, DataPathToolProperty} from '../path.ux/scripts/pathux.js';
import {} from '../ml/ml_base.js';
import type {Pattern} from './pattern.js';

/* The execution `this` of a path.ux data-path 'change' callback: the bound
 * data object plus the active context. */
interface ApiChangeThis<T> {
  dataref: T
  ctx: {pattern: Pattern}
}

export const SliderTypes = {
  FLOAT  : 1,
  INT    : 2,
  VECTOR2: 4,
  VECTOR3: 8,
  VECTOR4: 16,
  STRING : 32,
  ENUM   : 64,
  FLAGS  : 128,
  DEPEND : 256
};
/* A single entry in a pattern's sliderDef array. Raw entries may be a bare
 * string (shorthand for {name, type: "float"}); after Pattern.getSliderDef()
 * they are always normalized to objects of this shape. */
export interface SliderDef {
  name: string
  type?: string
  value?: number | string
  range?: number[]
  min?: number
  max?: number
  step?: number
  speed?: number
  slideSpeed?: number
  exp?: number
  expRate?: number
  decimalPlaces?: number
  unit?: string
  baseUnit?: string
  displayUnit?: string
  description?: string
  noReset?: boolean
  enumDef?: Record<string, number>
}

export const SliderTypeMap = {
  "float" : SliderTypes.FLOAT,
  "string": SliderTypes.STRING,
  "int"   : SliderTypes.INT,
  "enum"  : SliderTypes.ENUM,
  "flags" : SliderTypes.FLAGS,
  "vec2"  : SliderTypes.VECTOR2,
  "vec3"  : SliderTypes.VECTOR3,
  "vec4"  : SliderTypes.VECTOR4,
  "depend": SliderTypes.DEPEND
};

/* Resolves a SliderDef.type name (defaulting to float) to its numeric code. */
function sliderTypeFromName(name: string | undefined): number {
  let map: Record<string, number> = SliderTypeMap;
  return map[name ?? "float"] ?? SliderTypes.FLOAT;
}

class SavedValue {
  type: number
  i: number
  f: number
  s: string
  v2: Vector2
  v3: Vector3
  v4: Vector4

  static STRUCT: string

  constructor(type = 0) {
    this.type = type;
    this.i = this.f = 0.0;
    this.s = '';
    this.v2 = new Vector2();
    this.v3 = new Vector3();
    this.v4 = new Vector4();
  }

  setValue(param: SliderParam): this {
    this.type = param.type;

    let val = param.value;

    switch (param.type) {
      case SliderTypes.ENUM:
      case SliderTypes.FLAGS:
      case SliderTypes.INT:
        if (typeof val === "number") this.i = val;
        break;
      case SliderTypes.FLOAT:
        if (typeof val === "number") this.f = val;
        break;
      case SliderTypes.STRING:
        if (typeof val === "string") this.s = val;
        break;
      case SliderTypes.VECTOR2:
        if (val instanceof Vector2) this.v2.load(val);
        break;
      case SliderTypes.VECTOR3:
        if (val instanceof Vector3) this.v3.load(val);
        break;
      case SliderTypes.VECTOR4:
        if (val instanceof Vector4) this.v4.load(val);
        break;
      case SliderTypes.DEPEND:
        break; //do nothing
    }

    return this;
  }

  getValue() {
    switch (this.type) {
      case SliderTypes.ENUM:
      case SliderTypes.FLAGS:
      case SliderTypes.INT:
        return this.i;
      case SliderTypes.FLOAT:
        return this.f;
      case SliderTypes.STRING:
        return this.s;
      case SliderTypes.VECTOR2:
        return this.v2;
      case SliderTypes.VECTOR3:
        return this.v3;
      case SliderTypes.VECTOR4:
        return this.v4;
      case SliderTypes.DEPEND:
        return undefined; //do nothing
    }
  }
}

SavedValue.STRUCT = `
SavedValue {
  type : int;
  i    : int;
  f    : double;
  s    : string;
  v2   : vec2;
  v3   : vec3;
  v4   : vec4;
}`
nstructjs.register(SavedValue);

interface SliderBinding {
  list: Sliders
  i: number
}

export class SliderParam {
  name: string
  type: number
  owner: Pattern | undefined
  id: number
  _propBound: boolean
  binding: SliderBinding | undefined
  enumDef: Record<string, number> | undefined
  flagsDef: Record<string, number> | undefined
  noReset: boolean
  description: string
  slideSpeed: number
  decimalPlaces: number
  rollerSlider: boolean
  min: number
  max: number
  unit: string
  expRate: number
  step: number
  links: SliderLink[]
  _value: number | string | Vector2 | Vector3 | Vector4 | undefined
  _api_struct: object | undefined

  static STRUCT: string

  constructor(name = "", type = SliderTypes.FLOAT, value?: number | string | Vector2 | Vector3 | Vector4, _isNew?: boolean) {
    this.name = name;
    this.type = type;

    this.owner = undefined;

    this.id = -1;

    this._propBound = false;
    this.binding = undefined;

    this.enumDef = undefined;
    this.flagsDef = undefined;

    this.noReset = false;
    this.description = "";

    this.slideSpeed = 1.0;
    this.decimalPlaces = 3;
    this.rollerSlider = true;
    this.min = -1e17;
    this.max = 1e17;
    this.unit = "none";
    this.expRate = 1.5;
    this.step = 0.01;

    /*graph stuff*/
    this.links = [];

    this._value === undefined;
    this._initValue();

    if (type !== undefined && value !== undefined) {
      this.setValue(value);
    }

    this._api_struct = undefined;
  }

  get value(): number | string | Vector2 | Vector3 | Vector4 | undefined {
    if (this.binding) {
      let list = this.binding.list;
      let i = this.binding.i;

      let val = this._value;

      switch (this.type) {
        case SliderTypes.FLOAT:
        case SliderTypes.INT:
        case SliderTypes.ENUM:
        case SliderTypes.FLAGS:
        case SliderTypes.STRING:
          return list[i];
        case SliderTypes.VECTOR2:
          if (val instanceof Vector2 || val instanceof Vector3 || val instanceof Vector4) {
            val[0] = list[i];
            val[1] = list[i + 1];
          }
        case SliderTypes.VECTOR3:
          if (val instanceof Vector3 || val instanceof Vector4) {
            val[2] = list[i + 2];
          }
        case SliderTypes.VECTOR4:
          if (val instanceof Vector4) {
            val[3] = list[i + 3];
          }
          return val;
      }
    } else {
      return this._value;
    }
  }

  set value(val: number | string | Vector2 | Vector3 | Vector4 | undefined) {
    if (val !== undefined) {
      this.setValue(val);
    }
  }

  //XXX do we need this?
  static apiDefine(api: DataAPI, gst?: DataStruct): DataStruct {
    if (!gst) {
      gst = api.mapStruct(this, true);
    }

    gst.enum("type", "type", SliderTypes, "Type");

    gst.list("links", "links", [
      function get(api: DataAPI, list: SliderLink[], key: number) {
        return list[key];
      },
      function getKey(api: DataAPI, list: SliderLink[], object: SliderLink) {
        return list.indexOf(object);
      },
      function getStruct(api: DataAPI, list: SliderLink[], key: number) {
        let cls: typeof SliderLink | Function = list[key].constructor;
        if (!cls) {
          cls = SliderLink;
        }

        return api.mapStruct(cls, false);
      },
      function getIter(api: DataAPI, list: SliderLink[]) {
        return list[Symbol.iterator]();
      },
      function getLength(api: DataAPI, list: SliderLink[]) {
        return list.length;
      }

    ]);

    return gst;
  }

  getStruct(api: DataAPI): object {
    if (this._api_struct) {
      return this._api_struct;
    }

    class dummy {

    };

    let st = api.inheritStruct(dummy, SliderParam);
    let uiname = ToolProperty.makeUIName(this.name);
    let def: DataPath | undefined;

    st.string("name", "name", "Name").readOnly();
    st.enum("type", "type", SliderTypes, "Type").readOnly();

    let min = this.min ?? -10000000;
    let max = this.max ?? 10000000;
    console.log(uiname, "MINMAX", min, max);

    switch (this.type) {
      case SliderTypes.FLOAT:
        def = st.float("value", "value", uiname)

        break;
      case SliderTypes.INT:
        def = st.int("value", "value", uiname)
        break;
      case SliderTypes.VECTOR2:
        def = st.vec2("value", "value", uiname)
        break;
      case SliderTypes.VECTOR3:
        def = st.vec3("value", "value", uiname)
        break;
      case SliderTypes.VECTOR4:
        def = st.vec4("value", "value", uiname)
        break;
      case SliderTypes.STRING:
        def = st.string("value", "value", uiname);
        break;
      case SliderTypes.ENUM:
        def = st.enum("value", "value", this.enumDef ?? {}, uiname);
        break;
      case SliderTypes.FLAGS:
        def = st.flags("value", "value", this.flagsDef ?? {}, uiname);
        break;
    }

    if (def && this.type === SliderTypes.ENUM) {
      (def.data as DataPathToolProperty).flag |= PropFlags.LABEL;
    }

    if (def && !(this.type & (SliderTypes.STRING | SliderTypes.ENUM | SliderTypes.FLAGS))) {
      def.expRate(this.expRate)
        .range(this.min, this.max)
        .step(this.step)
        .slideSpeed(this.slideSpeed)
        .expRate(this.expRate)
        .baseUnit(this.unit)
        .decimalPlaces(this.decimalPlaces)
        .displayUnit(this.unit)
        .description(this.description);

      if (this.rollerSlider) {
        def.rollerSlider();
      } else {
        def.simpleSlider();
      }
    }

    if (def) {
      def.on('change', function (this: ApiChangeThis<SliderParam>) {
        if (!this.dataref.noReset) {
          this.ctx.pattern.drawGen++;
          window.redraw_viewport();
          window._appstate.autoSave();
        }
        window.redraw_viewport();
      });
    }

    let ok = !(this.type === SliderTypes.ENUM && !this.enumDef);
    ok = ok && !(this.type === SliderTypes.FLAGS && !this.flagsDef);

    if (ok) {
      this._api_struct = st;
    }

    return st;
  }

  setDescription(desc: string): this {
    this.description = desc;
    return this;
  }

  setStep(n: number): this {
    this.step = n;
    return this;
  }

  setSlideSpeed(n: number): this {
    this.slideSpeed = n;
    return this;
  }

  setExpRate(n: number): this {
    this.expRate = n;
    return this;
  }

  setDecimalPlaces(n: number): this {
    this.decimalPlaces = n;
    return this;
  }

  range(min: number | number[], max?: number): this {
    console.warn("Deprecated: SliderParam.prototype.range, use setRange instead.");
    return this.setRange(min, max);
  }

  setRange(min: number | number[], max?: number): this {
    if (Array.isArray(min)) {
      this.min = min[0];
      this.max = min[1];
    } else {
      this.min = min;
      this.max = max ?? this.max;
    }

    return this;
  }

  useRollerSlider(): this {
    this.rollerSlider = true;
    return this;
  }

  useSimpleSlider(): this {
    this.rollerSlider = false;
    return this;
  }

  _initValue(): void {
    switch (this.type) {
      case SliderTypes.FLOAT:
      case SliderTypes.INT:
      case SliderTypes.ENUM:
      case SliderTypes.FLAGS:
        this._value = 0;
        break;
      case SliderTypes.STRING:
        this._value = '';
        break;
      case SliderTypes.VECTOR2:
        this._value = new Vector2();
        break;
      case SliderTypes.VECTOR3:
        this._value = new Vector3();
        break;
      case SliderTypes.VECTOR4:
        this._value = new Vector4();
        break;
      case SliderTypes.DEPEND:
        break; //do nothing
    }
  }

  setValue(value: number | string | Vector2 | Vector3 | Vector4): this {
    if (this.binding) {
      let list = this.binding.list;
      let i = this.binding.i;

      switch (this.type) {
        case SliderTypes.FLOAT:
        case SliderTypes.INT:
        case SliderTypes.ENUM:
        case SliderTypes.FLAGS:
        case SliderTypes.STRING:
          if (typeof value === "number") list[i] = value;
          break;
        case SliderTypes.VECTOR2:
          if (value instanceof Vector2 || value instanceof Vector3 || value instanceof Vector4) {
            list[i] = value[0];
            list[i + 1] = value[1];
          }
        case SliderTypes.VECTOR3:
          if (value instanceof Vector3 || value instanceof Vector4) {
            list[i + 2] = value[2];
          }
        case SliderTypes.VECTOR4:
          if (value instanceof Vector4) {
            list[i + 3] = value[3];
          }
          break;
        case SliderTypes.DEPEND:
          break; //do nothing
      }
    } else {
      switch (this.type) {
        case SliderTypes.FLOAT:
        case SliderTypes.INT:
        case SliderTypes.ENUM:
        case SliderTypes.FLAGS:
        case SliderTypes.STRING:
          this._value = value;
          break;
        case SliderTypes.VECTOR2:
          if (this._value instanceof Vector2 && value instanceof Vector2) {
            this._value.load(value);
          }
          break;
        case SliderTypes.VECTOR3:
          if (this._value instanceof Vector3 && value instanceof Vector3) {
            this._value.load(value);
          }
          break;
        case SliderTypes.VECTOR4:
          if (this._value instanceof Vector4 && value instanceof Vector4) {
            this._value.load(value);
          }
          break;
        case SliderTypes.DEPEND:
          break; //do nothing
      }
    }
    return this;
  }

  connect(dst: SliderParam): this {
    let link = new SliderLink();

    link.src = this;
    link.dst = dst;

    dst.links.push(link);
    this.links.push(link);

    return this;
  }

  copy(): SliderParam {
    let ret = new SliderParam();
    this.copyTo(ret);

    return ret;
  }

  copyTo(b: SliderParam): void {
    b.type = this.type;
    b.name = this.name;

    let val = this.value;
    let bval = b.value;
    if (val instanceof Vector2 && bval instanceof Vector2) {
      bval.load(val);
    } else if (val instanceof Vector3 && bval instanceof Vector3) {
      bval.load(val);
    } else if (val instanceof Vector4 && bval instanceof Vector4) {
      bval.load(val);
    } else if (typeof val === "number" || typeof val === "string") {
      b.value = val;
    }

    b.min = this.min;
    b.max = this.max;
    b.unit = this.unit;
    b.expRate = this.expRate;
    b.step = this.step;
  }

  _wrapValue(): SavedValue {
    return new SavedValue(this.type).setValue(this);
  }

  loadSTRUCT(reader: nstructjs.StructReader<this>): void {
    reader(this);

    /* nstructjs deserializes `_value` as a SavedValue (see STRUCT). */
    let val: unknown = this._value
    this._value = undefined;
    this._initValue();

    if (val instanceof SavedValue) {
      let loaded = val.getValue();
      if (loaded !== undefined) {
        this.setValue(loaded);
      }
    }
  }
}

SliderParam.STRUCT = `
SliderParam {
  name    : string;
  type    : int;
  id      : int;
  links   : array(SliderLink);
  _value  : abstract(SavedValue) | this._wrapValue();
  owner   : int | this.owner ? this.owner.id : -1;
}`;
nstructjs.register(SliderParam);

export const SliderBlendModes = {
  MIX: 0,
  MUL: 1,
  ADD: 2,
  SUB: 3,
  DIV: 4
};

export class SliderLink {
  /* Endpoints are SliderParams when wired via SliderParam.connect(); the
   * pattern graph may also reference owning Patterns directly. */
  src: SliderParam | Pattern | undefined
  dst: SliderParam | Pattern | undefined
  factor: number
  blendMode: number

  static STRUCT: string

  constructor(src?: SliderParam, dst?: SliderParam) {
    this.src = src;
    this.dst = dst;
    this.factor = 1.0;
    this.blendMode = SliderBlendModes.MIX;
  }

  static apiDefine(api: DataAPI): DataStruct {
    let st = api.mapStruct(this, true);

    st.float("factor", "factor", "Factor")
      .noUnits()
      .range(-3, 3);
    st.enum("blendMode", "blendMode", SliderBlendModes, "Blend Mode");

    return st;
  }

  copyTo(b: SliderLink): void {
    b.factor = this.factor;
    b.blendMode = this.blendMode;
  }
}

SliderLink.STRUCT = `
SliderLink {
  src       : int | this.src ? this.src.id : -1;
  dst       : int | this.dst ? this.dst.id : -1;
  factor    : double;
  blendMode : int;
}
`;
nstructjs.register(SliderLink);

export class Sliders extends Array<number> {
  _items: number[] | undefined
  params: SliderParam[]

  static STRUCT: string

  constructor() {
    super();

    this._items = undefined; //temporary for loadSTRUCT
    this.params = [];
  }

  clear(): this {
    this.unbindProperties();

    this.params.length = 0;
    this.length = 0;

    return this;
  }

  getUniformRef(name_or_param: string | SliderParam): string {
    return `SLIDERS[${this.getParamIndex(name_or_param)}]`;
  }

  getParamIndex(name_or_param: string | SliderParam): number {
    let param;

    if (typeof name_or_param === "string") {
      param = this.get(name_or_param);
    } else {
      param = name_or_param;
    }

    return param !== undefined ? this.params.indexOf(param) : -1;
  }

  getSliderIndex(name_or_param: string | SliderParam): number {
    let param;

    if (typeof name_or_param === "string") {
      param = this.get(name_or_param);
    } else {
      param = name_or_param;
    }

    let i = 0;
    for (let param of this.params) {
      if (param === param) {
        return i;
      }

      switch (param.type) {
        case SliderTypes.STRING:
          break;
        case SliderTypes.VECTOR2:
          i += 2;
          break;
        case SliderTypes.VECTOR3:
          i += 3;
          break;
        case SliderTypes.VECTOR4:
          i += 4;
          break;
        default:
          i++;
      }
    }

    return -1;
  }

  unbindProperties(): void {
    for (let param of this.params) {
      if (!param._propBound) {
        continue;
      }

      try {
        Reflect.deleteProperty(this, param.name);

        /*
        Object.defineProperty(this, param.name, {
          get : undefined,
          set : undefined,
          configurable : true
        });//*/

        param._propBound = false;
      } catch (error) {
        if (error instanceof Error) {
          console.error(error.stack);
          console.error(error.message);
        }
      }
    }
  }

  bindProperties(): void {
    let visit = new Set();

    let bindProp = (key: string, i: number) => {
      let this2 = this;

      Object.defineProperty(this, key, {
        get() {
          return this2.params[i].value;
        },
        set(val) {
          this2.params[i].setValue(val);
        },
        configurable: true
      });
    }

    let li = 0;

    for (let i = 0; i < this.params.length; i++) {
      let prop = this.params[i];

      if (prop._propBound) {
        continue;
      }

      if (Reflect.get(this, prop.name) !== undefined) {
        console.warn("Property name " + prop.name + " collides with internal property or method");
        continue;
      }

      if (visit.has(prop.name)) {
        console.error("Name collision", prop.name, prop);
        continue;
      }

      prop._propBound = true;

      visit.add(prop.name);
      bindProp(prop.name, i);

      if (prop.type === SliderTypes.STRING) {
        continue; //can't bind strings to sliders
      }

      prop.binding = {
        list: this,
        i   : li
      }

      switch (prop.type) {
        case SliderTypes.VECTOR2:
          li += 2;
          break;
        case SliderTypes.VECTOR3:
          li += 3;
          break;
        case SliderTypes.VECTOR4:
          li += 4;
          break;
        case SliderTypes.STRING:
          break; //do nothing
        default:
          li += 1;
      }
    }
  }

  get(name: string): SliderParam | undefined {
    for (let item of this.params) {
      if (item.name === name) {
        return item;
      }
    }
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /* Numeric value of a named slider; mirrors the dynamically-bound
   * `sliders.<name>` accessor for code that needs a typed number. */
  getf(name: string): number {
    let param = this.get(name);
    let val = param !== undefined ? param.value : undefined;
    return typeof val === "number" ? val : 0;
  }

  push(param: SliderParam): number
  push(...items: number[]): number
  push(...items: (SliderParam | number)[]): number {
    let param = items[0] as SliderParam;

    this.params.push(param);

    if (param.type === SliderTypes.STRING) {
      return this.length;
    }

    let size = 1;
    switch (param.type) {
      case SliderTypes.VECTOR2:
        size = 2;
        break;
      case SliderTypes.VECTOR3:
        size = 3;
        break;
      case SliderTypes.VECTOR4:
        size = 4;
        break;
    }

    let val = param._value;

    if (size === 1) {
      if (typeof val === "number") {
        super.push(val);
      }
    } else if (val instanceof Vector2 || val instanceof Vector3 || val instanceof Vector4) {
      for (let i = 0; i < size; i++) {
        super.push(val[i] as number);
      }
    }

    return this.length;
  }

  rebindProperties(): this {
    this.unbindProperties();
    this.bindProperties();

    return this;
  }

  merge(paramDef: SliderDef[]): void {
    paramDef = paramDef.concat([]); //copy

    this.unbindProperties();

    let newlist: SliderParam[] = new Array(paramDef.length);
    let map: Record<string, number> = {};

    //build map from names to newlist index
    for (let i = 0; i < paramDef.length; i++) {
      let pdef = paramDef[i];
      map[pdef.name] = i;
    }

    let extra: SliderParam[] = [];

    //remap existing parameters
    for (let param of this.params) {
      if (!(param.name in map)) {
        extra.push(param);
        continue;
      }

      newlist[map[param.name]] = param;
    }

    //add any missing parameters
    let defparam = new SliderParam("", SliderTypes.FLOAT, 0);

    for (let i = 0; i < paramDef.length; i++) {
      let pdef = paramDef[i];
      let param = new SliderParam(pdef.name, sliderTypeFromName(pdef.type), pdef.value)
        .setRange(pdef.range ?? [-100000000, 100000000])
        .setDecimalPlaces(pdef.decimalPlaces ?? defparam.decimalPlaces)
        .setExpRate(pdef.expRate ?? defparam.expRate)
        .setSlideSpeed(pdef.slideSpeed ?? defparam.slideSpeed)
        .setStep(pdef.step ?? defparam.step)
        .setDescription(pdef.description ?? "")

      let is_new = false;

      if (newlist[i] === undefined) {
        newlist[i] = param;
        is_new = true;
      } else {
        let prev = newlist[i].value;
        if (prev !== undefined) {
          param.value = prev;
        }
        newlist[i] = param;
      }

      newlist[i].noReset = !!pdef.noReset;

      if (pdef.name === "d" && newlist[i].value === 0) {
        debugger;
        param = new SliderParam(pdef.name, sliderTypeFromName(pdef.type), pdef.value, is_new)
          .setRange(pdef.range ?? [-100000000, 100000000])
          .setDecimalPlaces(pdef.decimalPlaces ?? defparam.decimalPlaces)
          .setExpRate(pdef.expRate ?? defparam.expRate)
          .setSlideSpeed(pdef.slideSpeed ?? defparam.slideSpeed)
          .setStep(pdef.step ?? defparam.step)

        console.log("PARAM", param, pdef);
      }
    }

    this.length = 0;
    this.params.length = 0;

    for (let item of newlist) {
      this.push(item);
    }

    //add anything not in sliderdef to end
    for (let item of extra) {
      this.push(item);
    }

    this.bindProperties();
  }

  loadSTRUCT(reader: nstructjs.StructReader<this>): void {
    reader(this);

    if (this._items) {
      for (let item of this._items) {
        super.push(item);
      }
    }

    this._items = undefined;

    try {
      this.bindProperties();
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.stack);
        console.error(error.message);
      }
    }
  }

  asArray(): number[] {
    return util.list(this);
  }
}

Sliders.STRUCT = `
Sliders {
  params : array(SliderParam);
  _items : array(double) | this; 
}
`;
nstructjs.register(Sliders);
