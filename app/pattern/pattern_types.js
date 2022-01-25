//used for nstructjs
import {nstructjs, util, Vector2, Vector3, Vector4} from '../path.ux/scripts/pathux.js';
import {} from '../ml/ml_base.js';

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

class SavedValue {
  constructor(type) {
    this.type = type;
    this.i = this.f = 0.0;
    this.s = '';
    this.v2 = new Vector2();
    this.v3 = new Vector3();
    this.v4 = new Vector4();
  }

  setValue(param) {
    this.type = param.type;

    switch (param.type) {
      case SliderTypes.ENUM:
      case SliderTypes.FLAGS:
      case SliderTypes.INT:
        this.i = param.value;
        break;
      case SliderTypes.FLOAT:
        this.f = param.value;
        break;
      case SliderTypes.STRING:
        this.s = param.value;
        break;
      case SliderTypes.VECTOR2:
        this.v2.load(param.value);
        break;
      case SliderTypes.VECTOR3:
        this.v3.load(param.value);
        break;
      case SliderTypes.VECTOR4:
        this.v4.load(param.value);
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

export class SliderParam {
  constructor(name, type, value) {
    this.name = name;
    this.type = type;

    this.owner = undefined;

    this.id = -1;

    this._propBound = false;
    this.binding = undefined;

    this.enumDef = undefined;
    this.flagsDef = undefined;

    this.min = -1e17;
    this.max = 1e17;
    this.unit = "none";
    this.expRate = 1.5;
    this.step = 0.01;
    this.noReset = false;

    /*graph stuff*/
    this.links = [];

    this._value === undefined;
    this._initValue();

    if (type !== undefined && value !== undefined) {
      this.setValue(value);
    }

    this._api_struct = undefined;
  }

  get value() {
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
          val[0] = list[i];
          val[1] = list[i + 1];
        case SliderTypes.VECTOR3:
          val[2] = list[i + 2];
        case SliderTypes.VECTOR4:
          val[3] = list[i + 3];
          return val;
      }
    } else {
      return this._value;
    }
  }

  set value(val) {
    this.setValue(val);
  }

  //XXX do we need this?
  static apiDefine(api, gst, enumdef, flagsdef) {
    if (!gst) {
      gst = api.mapStruct(this, true);
    }

    gst.enum("type", "type", SliderTypes, "Type");

    gst.list("links", "links", [
      function get(api, list, key) {
        return list[key];
      },
      function getKey(api, list, object) {
        return list.indexOf(object);
      },
      function getStruct(api, list, key) {
        let cls = list[key].constructor;
        if (!cls) {
          cls = SliderLink;
        }

        return api.mapStruct(cls, false);
      },
      function getIter(api, list) {
        return list[Symbol.iterator]();
      },
      function getLength(api, list) {
        return list.length;
      }

    ]);

    return gst;
  }

  getStruct(api) {
    if (this._api_struct) {
      return this._api_struct;
    }

    class dummy {

    };

    let st = api.inheritStruct(dummy, SliderParam);
    let uiname = ToolProperty.makeUIName(this.name);
    let def;

    st.string("name", "name", "Name").readOnly();
    st.enum("type", "type", SliderTypes, "Type").readOnly();

    switch (this.type) {
      case SliderTypes.FLOAT:
        def = st.float("value", "value", uiname);

        break;
      case SliderTypes.INT:
        def = st.int("value", "value", uiname);
        break;
      case SliderTypes.VECTOR2:
        def = st.vec2("value", "value", uiname);
        break;
      case SliderTypes.VECTOR3:
        def = st.vec3("value", "value", uiname);
        break;
      case SliderTypes.VECTOR4:
        def = st.vec4("value", "value", uiname);
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

    if (!(this.type & (SliderTypes.STRING | SliderTypes.ENUM | SliderTypes.FLAGS))) {
      def.expRate(this.expRate)
        .range(this.min, this.max)
        .step(this.step)
        .baseUnit(this.unit)
        .displayUnit(this.unit);
    }

    def.on('change', function () {
      window.redraw_viewport();
    });

    let ok = !(this.type === SliderTypes.ENUM && !this.enumDef);
    ok = ok && !(this.type === SliderTypes.FLAGS && !this.flagsDef);

    if (ok) {
      this._api_struct = st;
    }

    return st;
  }

  range(min, max) {
    this.min = min;
    this.max = max;

    return this;
  }

  _initValue() {
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

  setValue(value) {
    if (this.binding) {
      let list = this.binding.list;
      let i = this.binding.i;

      switch (this.type) {
        case SliderTypes.FLOAT:
        case SliderTypes.INT:
        case SliderTypes.ENUM:
        case SliderTypes.FLAGS:
        case SliderTypes.STRING:
          list[i] = value;
          break;
        case SliderTypes.VECTOR2:
          list[i] = value[0];
          list[i + 1] = value[1];
        case SliderTypes.VECTOR3:
          list[i + 2] = value[2];
        case SliderTypes.VECTOR4:
          list[i + 3] = value[3];
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
        case SliderTypes.VECTOR3:
        case SliderTypes.VECTOR4:
          this._value.load(value);
          break;
        case SliderTypes.DEPEND:
          break; //do nothing
      }
    }
    return this;
  }

  connect(dst) {
    let link = new SliderLink();

    link.src = this;
    link.dst = dst;

    dst.links.push(link);
    this.links.push(link);

    return this;
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);

    return ret;
  }

  copyTo(b) {
    b.type = this.type;
    b.name = this.name;

    if (typeof b.value === "object") {
      this.value.copyTo(b.value);
    } else {
      b.value = this.value;
    }

    b.min = this.min;
    b.max = this.max;
    b.unit = this.unit;
    b.expRate = this.expRate;
    b.step = this.step;
  }

  _wrapValue() {
    return new SavedValue(this.type).setValue(this);
  }

  loadSTRUCT(reader) {
    reader(this);

    let val = this._value;
    this._value = undefined;
    this._initValue();

    this.setValue(val.getValue());
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
  constructor(src, dst) {
    this.src = src;
    this.dst = dst;
    this.factor = 1.0;
    this.blendMode = SliderBlendModes.MIX;
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    st.float("factor", "factor", "Factor")
      .noUnits()
      .range(-3, 3);
    st.enum("blendMode", "blendMode", SliderBlendModes, "Blend Mode");

    return st;
  }

  copyTo(b) {
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

export class Sliders extends Array {
  constructor() {
    super();

    this._items = undefined; //temporary for loadSTRUCT
    this.params = [];
  }

  clear() {
    this.unbindProperties();

    this.params.length = 0;
    this.length = 0;

    return this;
  }

  getUniformRef(name_or_param) {
    return `SLIDERS[${this.getParamIndex(name_or_param)}]`;
  }

  getParamIndex(name_or_param) {
    let param;

    if (typeof name_or_param === "string") {
      param = this.get(name_or_param);
    } else {
      param = name_or_param;
    }

    return param !== undefined ? this.params.indexOf(param) : -1;
  }

  getSliderIndex(name_or_param) {
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

  unbindProperties() {
    for (let param of this.params) {
      if (!param._propBound) {
        continue;
      }

      try {
        delete this[param.name];

        /*
        Object.defineProperty(this, param.name, {
          get : undefined,
          set : undefined,
          configurable : true
        });//*/

        param._propBound = false;
      } catch (error) {
        console.error(error.stack);
        console.error(error.message);
      }
    }
  }

  bindProperties() {
    let visit = new Set();

    let bindProp = (key, i) => {
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

      if (this[prop.name] !== undefined) {
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

  get(name) {
    for (let item of this.params) {
      if (item.name === name) {
        return item;
      }
    }
  }

  has(name) {
    return this.get(name) !== undefined;
  }

  push(param) {
    this.params.push(param);

    if (param.type === SliderTypes.STRING) {
      return;
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

    if (size === 1) {
      super.push(param._value);
    } else {
      for (let i = 0; i < size; i++) {
        super.push(param._value[i]);
      }
    }
  }

  rebindProperties() {
    this.unbindProperties();
    this.bindProperties();

    return this;
  }

  merge(paramDef) {
    paramDef = paramDef.concat([]); //copy

    let newlist = new Array(paramDef.length);
    let map = {};

    //build map from names to newlist index
    for (let i = 0; i < paramDef.length; i++) {
      let pdef = paramDef[i];
      map[pdef.name] = i;
    }

    let extra = [];

    //remap existing parameters
    for (let param of this.params) {
      if (!(param.name in map)) {
        extra.push(param);
        continue;
      }

      newlist[map[param.name]] = param;
    }

    //add any missing parameters
    for (let i = 0; i < paramDef.length; i++) {
      let pdef = paramDef[i];

      if (newlist[i] === undefined) {
        let param = new SliderParam(pdef.name, SliderTypeMap[pdef.type], pdef.value);
        newlist[i] = param;
      }

      newlist[i].noReset = !!pdef.noReset;
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

    this.unbindProperties();
    this.bindProperties();
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let item of this._items) {
      super.push(item);
    }

    this._items = undefined;

    try {
      this.bindProperties();
    } catch (error) {
      console.error(error.stack);
      console.error(error.message);
    }
  }

  asArray() {
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
