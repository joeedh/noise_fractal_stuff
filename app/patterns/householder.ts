import {nstructjs, util} from '../path.ux/scripts/pathux.js';

import {Pattern, PatternDef, DefineMap, PresetText} from '../pattern/pattern.js';
import {Preset, savePreset} from '../pattern/preset.js';
import type {UniformMap} from '../pattern/pattern_shaders.js';
import type {ToolContext} from '../core/context.js';

export const HouseholderPresets: Preset[] = [];

let presetCountBase = 1;

export function add_preset(sliders: number[], options: Record<string, number | boolean> = {}, hide = false): void {
  if (hide) {
    presetCountBase++;
    return;
  }

  const preset = new HouseholderPattern();

  for (let key in options) {
    const k = key.toLowerCase();
    const v = options[key];
    if (Reflect.get(preset, k) !== undefined && (typeof v === 'number' || typeof v === 'boolean')) {
      Reflect.set(preset, k, v);
    }
  }

  while (sliders.length < preset.sliders.length) {
    sliders.push(0.0);
  }

  const tot = Math.min(sliders.length, preset.sliders.length);
  for (let i = 0; i < tot; i++) {
    preset.sliders[i] = sliders[i];
  }

  const name = 'Builtin #' + presetCountBase;
  presetCountBase++;

  HouseholderPresets.push(savePreset(preset, name, 'Builtin'));
}

const shader = `
// Complex helpers not in the shared header
vec2 cdiv$(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / max(d, 1e-30);
}

vec2 clog$(vec2 z) {
    return vec2(log(max(length(z), 1e-30)), atan(z.y, z.x));
}

vec2 cexp$(vec2 z) {
    return exp(z.x) * vec2(cos(z.y), sin(z.y));
}

vec2 cpow$(vec2 z, float n) {
    return cexp$(n * clog$(z + SLIDERS[15]));
}

// Householder step for f(z) = z^deg - 1.
// ORDER$ is a #define set to 1 (Newton), 2 (Halley), or 3 (Householder-3).
vec2 hstep$(vec2 z, float deg) {
    vec2 zp  = cpow$(z, deg);
    vec2 f   = zp - vec2(1.0, 0.0);
    vec2 fp  = deg * cdiv$(zp, z);                          // deg * z^(deg-1)

#if ORDER$ == 1
    return cdiv$(f, fp);

#elif ORDER$ == 2
    // Halley: 2*f*f' / (2*f'^2 - f*f'')
    vec2 fpp = deg*(deg-1.0) * cdiv$(zp, cmul(z,z));
    vec2 num = 2.0 * cmul(f, fp);
    vec2 den = 2.0*cmul(fp,fp) - cmul(f,fpp);
    return cdiv$(num, den);

#else
    // Householder order 3: f*(6f'^2 - 3f*f'') / (6f'^3 - 6f*f'*f'' + f^2*f''')
    vec2 fpp  = deg*(deg-1.0)         * cdiv$(zp, cmul(z,z));
    vec2 fppp = deg*(deg-1.0)*(deg-2.0) * cdiv$(zp, cmul(z,cmul(z,z)));
    vec2 fp2  = cmul(fp, fp);
    vec2 num  = cmul(f, 6.0*fp2 - 3.0*cmul(f, fpp));
    vec2 den  = 6.0*cmul(fp,fp2)
              - 6.0*cmul(cmul(f,fp), fpp)
              + cmul(cmul(f,f), fppp);
    return cdiv$(num, den);
#endif
}

float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    uv.x += SLIDERS[5];
    uv.y += SLIDERS[6];
    uv *= SLIDERS[4];

    float deg     = max(2.0, floor(SLIDERS[9] + 0.5));
    float damping = SLIDERS[11];
    float twist   = SLIDERS[1];
    float test = SLIDERS[15];

    vec2  z       = uv;
    float iter    = float(STEPS);
    float distsum = 0.0;

    for (int i = 0; i < STEPS; i++) {
        if (dot(z,z) > 1e8) {
            iter = float(i);
            break;
        }

        vec2 step = hstep$(z, deg);
        step = rot2d(step, twist);
        step *= pow(length(step), SLIDERS[16]);
        float slen = length(step);
        distsum += slen;

        if (slen < 1e-6) {
            iter = float(i);
            break;
        }

        z -= damping * step;
    }

    // root basin: fractional position within the p equal sectors
    float root_t = fract(atan(z.y, z.x) / (2.0*M_PI) * deg + deg);
    float iter_t  = iter / float(STEPS);

    float f = mix(root_t, iter_t, SLIDERS[12]) + distsum * 0.001 * SLIDERS[13];
    return tent(f);
}
`

export class HouseholderPattern extends Pattern {
  constructor() {
    super();
    this.sharpness = 0.33;
  }

  static patternDef(): PatternDef {
    return {
      typeName: 'householder',
      uiName: 'Householder',
      flag: 0,
      description: 'Higher-order Newton fractals using Householder\'s method (z^n - 1)',
      icon: -1,
      offsetSliders: {
        scale: 4,
        x: 5,
        y: 6,
      },
      presets: HouseholderPresets,
      sliderDef: [
        {name: 'steps', type: 'int', range: [5, 500], value: 64, speed: 5.0, exp: 1.5}, //0
        {name: 'twist', value: 0.0, range: [-3.14159, 3.14159], speed: 0.15, exp: 2.0},            //1
        {name: 'gain', value: 1.0, range: [0.001, 1000], speed: 2.0, exp: 2.0, noReset: true}, //2
        {name: 'color', value: 0.675, range: [-50, 50], speed: 0.25, noReset: true},        //3
        {name: 'scale', value: 3.0, range: [0.001, 1000000.0]},                           //4
        'x', //5
        'y', //6
        {name: 'colorscale', value: 3.0, range: [0.0001, 100.0], noReset: true},          //7
        {name: 'brightness', value: 1.0, range: [0.001, 10.0], noReset: true},            //8
        {name: 'degree', value: 3.0, range: [2.0, 12.0], speed: 1.0},                    //9
        {name: 'order', value: 2.0, range: [1.0, 3.0], speed: 1.0},                      //10
        {name: 'damping', value: 1.0, range: [0.1, 2.0], speed: 0.05},                   //11
        {name: 'rootmix', value: 0.5, range: [0.0, 1.0], speed: 0.05},                   //12
        {name: 'distscale', value: 1.0, range: [0.0, 10.0]},                              //13
        {name: 'valueoff', value: 0.0, range: [-15.0, 45.0], speed: 0.15, exp: 1.35, noReset: true}, //14
        {name: 'test', value: 0.0, range: [-2.0, 2.0], speed: 0.01, exp: 2.0, noReset: false}, //15
        {name: 'test2', value: 0.0, range: [-20.0, 20.0], speed: 0.01, exp: 2.0, noReset: false}, //16
      ],
      shader,
    }
  }

  setup(ctx: ToolContext, gl: AppGL, uniforms: UniformMap, defines: DefineMap): void {
    defines.STEPS = ~~this.sliders[0];
    defines.ORDER = Math.max(1, Math.min(3, Math.round(this.sliders[10])));

    defines.VALUE_OFFSET = 'SLIDERS[14]';
    defines.GAIN = 'SLIDERS[2]';
    defines.COLOR_SHIFT = 'SLIDERS[3]';
    defines.COLOR_SCALE = 'SLIDERS[7]';
    defines.BRIGHTNESS = 'SLIDERS[8]';
  }

  savePresetText(opt: PresetText = {}): string {
    opt.sharpness = opt.sharpness ?? this.sharpness;
    opt.filter_width = opt.filter_width ?? this.filter_width;

    const optStr = JSON.stringify(opt);
    const sliders = JSON.stringify(util.list(this.sliders));

    return `add_preset(${sliders}, ${optStr});`;
  }

  viewportDraw(ctx: ToolContext, gl: AppGL, uniforms: UniformMap = {}, defines: DefineMap = {}): void {
    defines.STEPS = ~~this.sliders[0];
    defines.ORDER = Math.max(1, Math.min(3, Math.round(this.sliders[10])));

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b: Pattern): void {
    super.copyTo(b);
  }
}

HouseholderPattern.STRUCT = nstructjs.inherit(HouseholderPattern, Pattern) + `
}`;

Pattern.register(HouseholderPattern);
