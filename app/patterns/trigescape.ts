import {Pattern, PatternDef, DefineMap, PresetText} from '../pattern/pattern.js';
import {NewtonPresets} from './newton.js';
import {loadPreset, Preset, PresetData, savePreset} from '../pattern/preset.js';
import {PackFlags, DataAPI, DataStruct, Container, UIBase} from '../path.ux/scripts/pathux.js';
import {SliderParam} from '../pattern/pattern_types.js';
import type {UniformMap} from '../pattern/pattern_shaders.js';
import type {ToolContext} from '../core/context.js';

export const TrigEscapePresets: Preset[] = [];

export const WaveModes = {
  COS   : 0,
  SAW   : 1,
  SQUARE: 2,
  TENT  : 3
}

export const RotModes = {
  LENGTH_POWER: 0,
  ADD         : 1,
  MULTIPLY    : 2,
  EXPONENT    : 3,
  ATAN        : 4,
};

export const OriginModes = {
  EXPONENT         : 0,
  EXPONENT_ADD     : 1,
  SUBTRACT_EXPONENT: 2,
};

interface TrigEscapeOptions {
  sliders?: number[]
  [key: string]: number | boolean | number[] | undefined
}

export function trigescape_preset(opt: TrigEscapeOptions): void {
  let preset = new TrigEscapePattern();

  for (let k in opt) {
    if (typeof k === "object" && k !== "sliders") {
      continue;
    }

    if (k === "sliders") {
      let sliders = opt.sliders ?? [];
      for (let i = 0; i < sliders.length; i++) {
        preset.sliders[i] = sliders[i];
      }
    } else {
      Reflect.set(preset, k, opt[k]);
    }
  }

  const name = `Builtin #${TrigEscapePresets.length + 1}`;
  TrigEscapePresets.push(savePreset(preset, name, "Builtin"));
}

function getShader(): {shaderPre: string; shader: string} {
  return {
    shaderPre: `

    float wave(float f) {
      f *= ${0.5/Math.PI};

#if defined(WAVE_MODE_SAW)
      f = fract(f);
#elif defined(WAVE_MODE_SQUARE)
      f = float(f > 0.5);
#elif defined(WAVE_MODE_TENT)
      f = tent(f);
#endif
      return f*2.0 - 1.0;
    }
    float rcos$(float f) {
#if defined(WAVE_MODE_COS)
      return cos(f);
#else
      return wave$(f);
#endif
    }

    float rsin$(float f) {
      return rcos$(f - M_PI*0.5);
    }
    
vec2 rot2dfunc$(vec2 p, float th) {
  float costh = rcos$(th);
  float sinth = rsin$(th);
  return vec2(
    costh*p.x + sinth*p.y,
    costh*p.y - sinth*p.x
  );
}
vec2 rot2dorigin(vec2 p, vec2 o, float th) {
    return rot2dfunc(p - o, th) + o;
}
`,

    shader:
    /*language=glsl*/
      `
        //uniform vec2 iRes;
        //uniform vec2 iInvRes;
        //uniform float T;
        //uniform float SLIDERS[MAX_SLIDERS];

        //$ is replaced with pattern.id

        float pattern(float ix, float iy) {
          vec2 uv = vec2(ix, iy)/iRes;

          uv = uv*2.0 - 1.0;
          uv.x *= aspect;

          uv.x += SLIDERS[5];
          uv.y += SLIDERS[6];//+0.5*SLIDERS[4];

          uv *= SLIDERS[4];

          vec2 p = uv;
          float fi = 0.0;
          float th = 0.0;

          #ifdef ROT_MULTIPLY
          th = 1.0;
          #elif defined(ROT_EXPONENT)
          th = 2.0;
          #endif

          vec2 origin2 = -p*0.5;
          
          for (int i=0; i<STEPS; i++) {
            #ifdef ROT_LENGTH_POWER
            th = pow(dot(p, p), _%rotLengthPW + 0.5);
            if (isnan(th)) {
              break;
            }
            #elif defined(ROT_ADD)
            th += _%rotAdd;
            #elif defined(ROT_MULTIPLY)
            th *= _%rotMul;
            #elif defined(ROT_EXPONENT)
            th = pow(th, _%rotExp);
            #elif defined(ROT_ATAN)
            th = atan(p[1], p[0])*_%rotAtan;
            #endif

            //th = p.x*uv.y - p.y*uv.x;
            //th = dot(p, uv);
            
            vec2 origin;
            #ifdef ORIGIN_EXPONENT
            origin[0] = pow(abs(p[0]), _%originExp)*sign(p[0]);
            origin[1] = pow(abs(p[1]), _%originExp)*sign(p[1]);
            #elif defined(ORIGIN_EXPONENT_ADD)
            origin[0] = pow(abs(p[0]), _%originExp)*sign(p[0]) + p[0]*_%originAdd;
            origin[1] = pow(abs(p[1]), _%originExp)*sign(p[1]) + p[0]*_%originAdd;
            #elif defined(ORIGIN_SUBTRACT_EXPONENT)
            origin[0] = p[0] - pow(abs(p[0]), _%originSubExp)*sign(p[0]);
            origin[1] = p[1] - pow(abs(p[1]), _%originSubExp)*sign(p[1]);
            #endif

            p = rot2dorigin(origin, p, th)*_%finalScale;
            p = rot2d(p, _%postRotate);
          
            if (length(p) > 10000000.0) {
              break;
            }
            fi += 1.0;
          }

          float f = fract(fi*0.1);

          return f;
        }

      `
  };
}

export class TrigEscapePattern extends Pattern {
  waveMode: number
  rotMode: number
  originMode: number

  /* Registered once via Pattern.register(TrigEscapePattern) at the bottom of
   * this file (like every other pattern). Previously this used
   * nstructjs.inlineRegister(), which registered the struct a second time and
   * produced an "already registered" warning. */
  static STRUCT = `
  TrigEscapePattern {
    waveMode   : int;
    rotMode    : int;
    originMode : int;
  }
  `

  static patternDef(): PatternDef {
    return {
      typeName     : "trig_escape",
      uiName       : "Trig Escape",
      flag         : 0,
      description  : "Trig based escape fractal",
      icon         : -1,
      offsetSliders: {
        scale: 4,
        x    : 5,
        y    : 6,
      },
      presets      : TrigEscapePresets,
      sliderDef    : [
        {name: "steps", type: "int", range: [5, 955], value: 100, speed: 7.0, exp: 1.5}, //0
        {name: "offset", value: 0.54, range: [-5.0, 5.0], speed: 0.1}, //1
        {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //3
        {name: "scale", value: 4.75, range: [0.001, 1000000.0]}, //4
        "x",  //5
        "y",  //6
        {name: "colorscale", value: 0.5, noReset: true},//7
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset: true}, //8
        {name: "valueoff", value: 0.0, range: [-15.0, 45.0], speed: 0.15, exp: 1.35, noReset: true}, //9
        {
          name         : "rotLengthPW", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Power for 'length-power' rotate mode"
        }, //10
        {
          name         : "rotAdd", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'add' rotate mode"
        }, //11
        {
          name         : "rotMul", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'multiply' rotate mode"
        }, //12
        {
          name         : "rotExp", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'multiply' rotate mode"
        }, //13
        {
          name         : "rotAtan", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'multiply' rotate mode"
        }, //14
        {
          name         : "originExp", value: 2.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Exponent for 'exponent' origin mode"
        }, //15
        {
          name         : "originAdd", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'exponent add' origin mode"
        }, //16
        {
          name         : "originSubExp", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Offset for 'subtract exponent' origin mode"
        }, //17
        {
          name         : "finalScale", value: 1.0, range: [-15, 1000], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Final scaling value"
        }, //18
        {
          name         : "postRotate", value: 0.0, range: [-Math.PI*2.0, Math.PI*2.0], speed: 2.0, step: 0.1, exp: 1.35,
          decimalPlaces: 3, description: "Final scaling value"
        }, //18

      ],
      ...getShader(),
      pollShaderForUpdates: true,
    }
  }

  static apiDefine(api: DataAPI): DataStruct | undefined {
    let st = super.apiDefine(api);

    let reset = function (this: {dataref: Pattern}) {
      this.dataref.drawGen++;
      window.redraw_viewport();
      window._appstate.autoSave();
    };

    st?.enum("waveMode", "waveMode", WaveModes)
      .on('change', reset);
    st?.enum("rotMode", "rotMode", RotModes)
      .on('change', reset);
    st?.enum("originMode", "originMode", OriginModes)
      .on('change', reset);

    return st;
  }

  static buildSidebar(ctx: ToolContext, con: Container): void {
    super.buildSidebar(ctx, con);

    let panel = con.panel("Trig Escape Settings");

    const dropboxPackFlag = PackFlags.FORCE_PROP_LABELS; // | PackFlags.LABEL_ON_RIGHT;

    panel.prop("params.postRotate");
    panel.prop("params.finalScale");

    let trigPat = (el: UIBase): TrigEscapePattern | undefined => {
      /* The live context is always a ToolContext at runtime. */
      let toolCtx = el.ctx as ToolContext | undefined;
      let pat = toolCtx?.pattern;
      return pat instanceof TrigEscapePattern ? pat : undefined;
    };

    panel.prop("waveMode");
    panel.prop("rotMode", dropboxPackFlag);
    let lastMode: number | undefined;
    let modeProp = panel.prop("paramDef[10].value");
    modeProp.updateAfter(() => {
      let rotMode = trigPat(panel)?.rotMode;
      if (rotMode !== undefined && lastMode !== rotMode) {
        lastMode = rotMode;
        console.log("mode update!");

        modeProp.setAttribute("datapath", `pattern.paramDef[${lastMode + 10}].value`);
        modeProp.update();
      }
    });

    let start = 10 + Reflect.ownKeys(RotModes).length;
    let lastOriginMode: number | undefined;
    panel.prop("originMode", dropboxPackFlag);

    let originProp = panel.prop(`paramDef[${start}].value`);
    originProp.updateAfter(() => {
      let originMode = trigPat(panel)?.originMode;
      if (originMode !== undefined && lastOriginMode !== originMode) {
        lastOriginMode = originMode;
        console.log("origin mode update!");

        originProp.setAttribute("datapath", `pattern.paramDef[${start + lastOriginMode}].value`);
        originProp.update();
      }
    });

    let exp = panel.prop(`paramDef[${start}].value`);

    console.error("EXP", exp);
    panel.updateAfter(() => {
      let originMode = trigPat(panel)?.originMode;
      if (exp.isConnected && originMode !== OriginModes.EXPONENT_ADD) {
        exp.remove();
      } else if (!exp.isConnected && originMode === OriginModes.EXPONENT_ADD) {
        panel.add(exp);
      }
    });
  }

  constructor() {
    super();

    this.use_sharpness = false;
    this.rotMode = RotModes.LENGTH_POWER;
    this.waveMode = WaveModes.COS;
    this.originMode = OriginModes.EXPONENT;

    let preset = this.constructor.patternDef().presets?.[0];

    /* Note: trigescape_preset creates TrigPattern instances, so preset may not exist */
    if (preset) {
      /* The serialized pattern snapshot stored on the preset. */
      let data = preset.preset as PresetData & {sliders?: {_items?: number[]}} & Record<string, unknown>;
      let sliders = data.sliders?._items ?? [];
      for (let i=0; i<sliders.length; i++) {
        this.sliders[i] = sliders[i];
      }

      for (let k in data) {
        if (Reflect.has(this, k) && typeof Reflect.get(this, k) !== "object") {
          Reflect.set(this, k, data[k]);
        }
      }
    }
  }

  setup(ctx: ToolContext, gl: AppGL, uniforms: UniformMap, defines: DefineMap): void {
    defines.STEPS = ~~this.sliders[0];

    defines.VALUE_OFFSET = "SLIDERS[9]";
    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[7]";
    defines.BRIGHTNESS = "SLIDERS[8]";

    const rotModes: Record<string, number> = RotModes;
    for (let k in rotModes) {
      if (rotModes[k] === this.rotMode) {
        defines["ROT_" + k.toUpperCase()] = null;
      }
    }

    const originModes: Record<string, number> = OriginModes;
    for (let k in originModes) {
      if (originModes[k] === this.originMode) {
        defines["ORIGIN_" + k.toUpperCase()] = null;
      }
    }

    const waveModes: Record<string, number> = WaveModes;
    for (let k in waveModes) {
      if (waveModes[k] === this.waveMode) {
        defines["WAVE_MODE_" + k.toUpperCase()] = null;
      }
    }
  }

  savePresetText(opt: PresetText = {}): string {
    let data = super.savePresetText(opt);
    let obj: PresetText = typeof data === "string" ? {} : data;

    obj.originMode ??= this.originMode;
    obj.rotMode ??= this.rotMode;
    obj.waveMode ??= this.waveMode;

    return `trigescape_preset(${JSON.stringify(obj)})`;
  }

  copyTo(b: Pattern): void {
    super.copyTo(b);

    if (b instanceof TrigEscapePattern) {
      b.rotMode = this.rotMode;
      b.originMode = this.originMode;
      b.waveMode = this.waveMode;
    }
  }
}

Pattern.register(TrigEscapePattern);
