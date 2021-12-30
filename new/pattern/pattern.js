import {EnumProperty, nstructjs} from '../path.ux/pathux.js';
import {renderPattern} from './pattern_draw.js';

export const PatternClasses = [];

export class PatternConfig {
  constructor() {
    this.SLIDERS = [];
  }

  loadSlidersFromDef(sliderDef) {
    this.SLIDERS.length = 0;

    for (let item of sliderDef) {
      if (typeof item === "string") {
        item = {name: item};
      }

      if ("value" in item) {
        this.SLIDERS.push(item.value);
      } else {
        this.SLIDERS.push(0.0);
      }
    }

    return this;
  }
}

PatternConfig.STRUCT = `
PatternConfig {
  SLIDERS    : array(double);
  PIXEL_SIZE : double; 
}
`;
nstructjs.register(PatternConfig);

export class Pattern {
  constructor() {
    let def = this.constructor.patternDef();

    if (!def.typeName) {
      throw new Error("patternDef is missing typeName!");
    }

    this.typeName = def.typeName;
    this.uiName = def.uiName;
    this.flag = def.flag !== undefined ? def.flag : 0;

    this.config = new PatternConfig(this.constructor.patternDef().sliderDef);
    this.config.loadSlidersFromDef(this.constructor.patternDef().sliderDef);
  }

  static patternDef() {
    throw new Error("implement me!");
    return {
      typeName   : "",
      uiName     : "",
      flag       : 0,
      description: "",
      icon       : -1,
      sliderDef  : [
        "steps",
        {
          name : "bleh",
          range: [1, 2],
          value: 1.0
        }
      ]
    }
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    class dummy {
    }

    let floatst = api.mapStruct(dummy, true);
    floatst.float("value", "value", "Value").customGetSet(function () {
      console.log(this.dataref);
    }, function (val) {

    });

    st.string("typeName", "type", "").readOnly();
    st.arrayList("value", "value", floatst);

    return st;
  }

  static register(cls) {
    if (!cls.STRUCT || cls.STRUCT === Pattern.STRUCT) {
      throw new Error("you forgot to add a struct script");
    }

    PatternClasses.push(cls);
    nstructjs.register(cls);
  }

  viewportDraw(ctx, gl) {
    renderPattern(ctx, gl);
  }
}

Pattern.STRUCT = `
Pattern {
  typeName : string;
  config   : abstract(PatternConfig);
}
`;
nstructjs.register(Pattern);

export var PatternsEnum;

export function makePatternsEnum() {
  let i = 0;

  let def = {}, uidef = {}, descr = {}, icons = {};

  for (let cls of PatternClasses) {
    let pdef = cls.patternDef();
    let uiname = def.uiName ?? ToolProperty.makeUIName(pdef.typeName);

    let key = pdef.typeName;

    def[key] = i;
    uidef[key] = uiname;
    descr[key] = pdef.description ?? "";
    icons[key] = pdef.icon ?? -1;

    i++;
  }

  let prop = new EnumProperty(0, def);
  prop.addIcons(icons);
  prop.addDescriptions(descr);
  prop.addUINames(uidef);

  if (PatternsEnum) {
    PatternsEnum.updateDefinition(prop);
  } else {
    PatternsEnum = prop;
  }

  window._PatternsEnum = PatternsEnum;
  return PatternsEnum;
}