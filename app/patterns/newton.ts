import {nstructjs, util, math, Vector2, Vector3, Vector4, Matrix4, Quat} from '../path.ux/scripts/pathux.js'

import {Pattern, PatternDef, PresetText, DefineMap} from '../pattern/pattern.js'
import {savePreset, Preset} from '../pattern/preset.js'
import {UniformMap} from '../pattern/pattern_shaders.js'
import type {ToolContext} from '../core/context.js'

export const NewtonPresets: Preset[] = []

let presetCountBase = 1

export function add_preset(
  sliders: number[],
  options: Record<string, number | boolean | object> = {},
  fixScale = true,
  hide = false
): void {
  if (hide) {
    presetCountBase++
    return
  }

  let preset = new NewtonPattern()

  for (let key in options) {
    if (key === 'curveset') {
      continue
    }

    let k = key.toLowerCase()
    let v = options[key]

    if (Reflect.get(preset, k) !== undefined && (typeof v === 'number' || typeof v === 'boolean')) {
      Reflect.set(preset, k, v)
    }
  }

  if (options && 'curveset' in options) {
    let cs = options.curveset
    if (cs && typeof cs === 'object') {
      preset.use_curves = true
      preset.curveset.loadJSON(cs as Record<'v' | 'r' | 'g' | 'b', Record<string, unknown>>)
    }
  }

  /* we don't want to use normal defaults, stick with zero--
     except for hoff*/
  let sdef = NewtonPattern.getPatternDef().sliderDef

  while (sliders.length < preset.sliders.length) {
    let entry = sdef[sliders.length]
    let val = typeof entry === 'string' ? 0.0 : entry.value || 0.0
    let num = typeof val === 'number' ? val : 0.0
    sliders.push(sliders.length === 9 ? 0.32 : num)
  }

  let tot = Math.min(sliders.length, preset.sliders.length)
  for (let i = 0; i < tot; i++) {
    preset.sliders[i] = sliders[i]
  }

  if (fixScale) {
    preset.sliders[4] = 1.0 / preset.sliders[4]
  }

  let name = 'Builtin #' + presetCountBase
  presetCountBase++

  NewtonPresets.push(savePreset(preset, name, 'Builtin'))
}

export function add_preset_new(
  sliders: number[],
  options?: Record<string, number | boolean | object>,
  hide = false
): void {
  return add_preset(sliders, options, false, hide)
}

const shaderPre = ``

const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];

vec2 ds_split(float a) {
    uint bits = floatBitsToUint(a);
    float hi = uintBitsToFloat(bits & 0xFFFFF000u); // zero low 12 mantissa bits
    return vec2(hi, a - hi);
}

vec2 twoProduct(float a, float b) {
      float p = a * b;
      // Use bit-split on both factors, then compute cross-terms
      vec2 as = ds_split(a);
      vec2 bs = ds_split(b);
      float err = ((as.x * bs.x - p) + as.x * bs.y + as.y * bs.x) + as.y * bs.y;
      return vec2(p, err);
}

#ifdef HIGH_PREC
/* double-single (ds) arithmetic: a number is vec2(hi, lo) with value hi + lo
   and |lo| <= 0.5*ulp(hi), giving ~47 mantissa bits.  A ds complex number is
   packed as vec4(x.hi, x.lo, y.hi, y.lo).

   NOTE: twoSum relies on strict IEEE float add (no reassociation).  If a
   driver's optimizer breaks it the symptom is ds having no effect; test with
   twoSum(1.0, 1e-10).y != 0.0. */

// Knuth twoSum: result.x + result.y == a + b exactly
vec2 twoSum(float a, float b) {
    float s = a + b;
    float bb = s - a;
    float err = (a - (s - bb)) + (b - bb);
    return vec2(s, err);
}

vec2 dsAdd(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    s.y += a.y + b.y;
    return twoSum(s.x, s.y);
}

vec2 dsSub(vec2 a, vec2 b) {
    return dsAdd(a, -b);
}

vec2 dsAddF(vec2 a, float b) {
    return dsAdd(a, vec2(b, 0.0));
}

vec2 dsMulF(vec2 a, float b) {
    vec2 p = twoProduct(a.x, b);
    p.y += a.y*b;
    return twoSum(p.x, p.y);
}

vec2 dsMul(vec2 a, vec2 b) {
    vec2 p = twoProduct(a.x, b.x);
    p.y += a.x*b.y + a.y*b.x;
    return twoSum(p.x, p.y);
}

vec2 dsDiv(vec2 a, vec2 b) {
    float q1 = a.x / b.x;
    vec2 r = dsAdd(a, dsMulF(b, -q1));
    float q2 = r.x / b.x;
    return twoSum(q1, q2);
}

float dsCollapse(vec2 a) {
    return a.x + a.y;
}

// ds complex * ds complex
vec4 dsCmul(vec4 a, vec4 b) {
    vec2 x = dsSub(dsMul(a.xy, b.xy), dsMul(a.zw, b.zw));
    vec2 y = dsAdd(dsMul(a.xy, b.zw), dsMul(a.zw, b.xy));
    return vec4(x, y);
}

// ds complex * plain float complex
vec4 dsCmulF(vec4 a, vec2 b) {
    vec2 x = dsSub(dsMulF(a.xy, b.x), dsMulF(a.zw, b.y));
    vec2 y = dsAdd(dsMulF(a.xy, b.y), dsMulF(a.zw, b.x));
    return vec4(x, y);
}
#endif //HIGH_PREC

//$ is replaced with pattern.id
vec2 fsample$(vec2 z, vec2 p) {
    float d = SLIDERS[15];

    //(z-1)(z+1)(z-p)
    vec2 a = z - vec2(d, 0.0+SLIDERS[12]);
    vec2 b = z + vec2(d, 0.0-SLIDERS[12]);
    vec2 c = z - p;
    return cmul(cmul(a, b), c);
}

#ifdef HIGH_PREC
// ds version of fsample$: the (z - root) subtractions are where per-pixel
// deltas live at deep zoom, so the whole residual is computed in ds
vec4 fsample_ds$(vec4 z, vec4 p) {
    float d = SLIDERS[15];

    //(z-1)(z+1)(z-p)
    vec4 a = vec4(dsAddF(z.xy, -d), dsAddF(z.zw, -SLIDERS[12]));
    vec4 b = vec4(dsAddF(z.xy, d), dsAddF(z.zw, -SLIDERS[12]));
    vec4 c = vec4(dsSub(z.xy, p.xy), dsSub(z.zw, p.zw));
    return dsCmul(dsCmul(a, b), c);
}
#endif //HIGH_PREC

float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;

    uv = uv*2.0 - 1.0;
    uv.x *= aspect;

#ifdef HIGH_PREC
    /* world coordinate as ds: U = (ndc + offset)*scale, with the x/y offsets
       split into hi/lo float32 pairs from float64 in pattern.ts */
    float fscale = viewTransform[0];
    vec2 Ux = dsMulF(dsAdd(vec2(uv.x, 0.0), vec2(viewTransform[1], viewTransform[3])), fscale);
    vec2 Uy = dsMulF(dsAdd(vec2(uv.y, 0.0), vec2(viewTransform[2], viewTransform[4])), fscale);

    vec4 S; //seed, ds complex
#else
    uv.x += viewTransform[1]; //x
    uv.y += viewTransform[2]; //y
    uv *= viewTransform[0]; //scale

    vec2 seed;
    vec2 z;
#endif

    vec2 dr, di;
    float f = 0.0;
    float dist = 0.0;

    float tm = 0.0;

#ifdef HIGH_PREC
  #ifndef SIMPLE_MODE
    S = vec4(Ux, Uy);
  #else
    S = vec4(SLIDERS[11], 0.0, 0.0, 0.0); //0.4132432);
  #endif
#else
  #ifndef SIMPLE_MODE
    seed = uv;
  #else
    seed = vec2(SLIDERS[11], 0.0); //0.4132432);
    //seed = vec2(pow(SLIDERS[11], uv[0]*0.5+0.5), pow(SLIDERS[11], uv[1]*0.5+0.5));
  #endif
#endif

    tm = SLIDERS[1];
    //tm = pow(tm, 1.0/1.0);
    float toff = pow(tm, 0.25);

#ifdef HIGH_PREC
    float rotc = cos(SLIDERS[16]);
    float rots = sin(SLIDERS[16]);
#endif

    for (int i=0; i<STEPS; i++) {
        //float toff = sin(T*0.1);
        //toff = 0.75;
#ifdef HIGH_PREC
        vec4 Z = dsCmulF(vec4(Ux, Uy), vec2(0.333333 + tm*0.5, 0.0 + tm)); //0.85*toff));

        vec4 A = fsample_ds$(Z, S);
        vec2 a = vec2(dsCollapse(A.xy), dsCollapse(A.zw));

        /* float32 copies for the Jacobian/hessians/dist: their rounding error
           is locally smooth across pixels, so it shifts the image slightly
           instead of destroying per-pixel detail */
        vec2 z = vec2(dsCollapse(Z.xy), dsCollapse(Z.zw));
        vec2 seed = vec2(dsCollapse(S.xy), dsCollapse(S.zw));
#else
        z = cmul(uv, vec2(0.333333 + tm*0.5, 0.0 + tm)); //0.85*toff));

        vec2 a = fsample$(z, seed);
#endif

#if 0 //finite differences
        float df = 0.0002;

        vec2 b = fsample$(z+vec2(df, 0.0), seed);
        vec2 c = fsample$(z+vec2(0.0, df), seed);

        dr = (b - a) / df;
        di = (c - a) / df;
#else //anayltical derivatives
        vec2 p = seed;
        float zx = z[0], zy = z[1];
        float px = p[0], py = p[1];
        
        /* heissan matrices
        on factor;
        off period;
        
        drx := -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        dry := -2.0*((py-zy-zy)*zx+(px-zx)*zy);
      
        dix := 2.0*((py-zy-zy)*zx+(px-zx)*zy);
        diy := -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        
        rxzx := df(drx, zx);
        rxzy := df(drx, zy);
        ryzx := df(dry, zx);
        ryzy := df(dry, zy);

        ixzx := df(dix, zx);
        ixzy := df(dix, zy);
        iyzx := df(diy, zx);
        iyzy := df(diy, zy);
        
        rxm := mat((rxzx*rxzx, rxzy*rxzx),
            (rxzy*rxzx, rxzy*rxzy));
        rym := mat((ryzx*ryzx, ryzy*ryzx),
            (ryzy*ryzx, ryzy*ryzy));
        ixm := mat((ixzx*ixzx, ixzy*ixzx),
            (ixzy*ixzx, ixzy*ixzy));
        iym := mat((iyzx*iyzx, iyzy*iyzx),
            (iyzy*iyzx, iyzy*iyzy));
        
        on fort;
        rxm;
        rym;
        ixm;
        iym;
        off fort;
        
        */
        dr.x = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        dr.y = -2.0*((py-zy-zy)*zx+(px-zx)*zy);
      
        di.x = 2.0*((py-zy-zy)*zx+(px-zx)*zy);
        di.y = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
#endif

#if 1

 mat2 rxm = mat2( vec2(4.0*(px-3.0*zx)*(px-3.0*zx),-4.0*(px-3.0*zx)*(py-3.0*zy)),
                 vec2(-4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(py-3.0*zy)*(py-3.0*zy)));

 mat2 rym = mat2(vec2(4.0*(py-3.0*zy)*(py-3.0*zy), 4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(px-3.0*zx)*(px-3.0*zx)));

  mat2 ixm = mat2(vec2(4.0*(py-3.0*zy)*(py-3.0*zy), 4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(px-3.0*zx)*(px-3.0*zx)));

  mat2 iym = mat2(vec2(4.0*(px-3.0*zx)*(px-3.0*zx), -4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(-4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(py-3.0*zy)*(py-3.0*zy))); 
#endif
#ifdef HIGH_PREC
        /* The Newton step entirely in ds.  f is analytic, so the Jacobian
           mat2(dr, di) is just complex multiplication by f'(z) (note
           di == (-dr.y, dr.x), i.e. Cauchy-Riemann), and -m^-1*a is the
           complex division -a/f'(z).

           f'(z) must be computed from the ds z, not the collapsed float32
           copy: the collapsed z quantizes in ulp(|z|) steps, which makes the
           step direction piecewise-constant over multi-pixel tiles at deep
           zoom (visible as a grid of randomly shifted blocks). */
        vec2 dxr = dsSub(S.xy, Z.xy); // px - zx
        vec2 dyr = dsSub(S.zw, Z.zw); // py - zy
        vec2 zx2 = dsMul(Z.xy, Z.xy);
        vec2 zy2 = dsMul(Z.zw, Z.zw);

        // WA = dr.x = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx)
        vec2 WA = dsSub(dsMul(dxr, Z.xy), dsMul(dyr, Z.zw));
        WA = dsMulF(WA, 2.0);
        WA = dsAdd(WA, zy2);
        WA = dsAddF(WA, 1.0);
        WA = -dsSub(WA, zx2);

        // WB = dr.y = -2.0*((py-zy-zy)*zx+(px-zx)*zy)
        vec2 WB = dsAdd(dsMul(dsSub(dyr, Z.zw), Z.xy), dsMul(dxr, Z.zw));
        WB = dsMulF(WB, -2.0);

        // off = -A/(WA + i*WB) = -A*conj(W)/|W|^2
        vec2 DEN = dsAdd(dsMul(WA, WA), dsMul(WB, WB));
        vec2 NUMx = dsAdd(dsMul(A.xy, WA), dsMul(A.zw, WB));
        vec2 NUMy = dsSub(dsMul(A.zw, WA), dsMul(A.xy, WB));

        vec2 Ox = -dsDiv(NUMx, DEN);
        vec2 Oy = -dsDiv(NUMy, DEN);

        // rot2d(off, SLIDERS[16])
        vec2 Tx = dsAdd(dsMulF(Ox, rotc), dsMulF(Oy, rots));
        vec2 Ty = dsAdd(dsMulF(Oy, rotc), dsMulF(Ox, -rots));
        Ox = Tx;
        Oy = Ty;

        // off.xy += vec2(-off.y, off.x)*SLIDERS[10]
        Tx = dsAdd(Ox, dsMulF(Oy, -SLIDERS[10]));
        Ty = dsAdd(Oy, dsMulF(Ox, SLIDERS[10]));
        Ox = Tx;
        Oy = Ty;

        vec2 off = vec2(dsCollapse(Ox), dsCollapse(Oy));
#else
        mat2 m = mat2(dr, di);

        m = inverse(m);

        vec2 off = -m * a;
        off = rot2d(off, SLIDERS[16]);

#if 0
        if (i % 2 == 1) {
          off.x *= -1.0;
        } else {
          off.y *= -1.0;
        }
#endif

        off.xy += vec2(-off.y, off.x)*SLIDERS[10];
#endif

        dist += 2.0*length(off) / (SLIDERS[9] + length(iym*rxm * off));
        //dist += 0.12 / (0.1 + length(rym*off));
        
        //dist += (determinant(rxm) + determinant(rym) + determinant(ixm) + determinant(iym))*1000.0;
        //dist += determinant(rxm*rym*ixm*iym)*100000.0;
        //dist += (abs(off[0]) + abs(off[1]))*0.5;
        //dist += max(abs(off[0]), abs(off[1]));
        
        if (i > int(SLIDERS[0])) {
            break;
        }
        
        //uv += abs(off.x) > abs(off.y) ? off.x : off.y;
        //off.x = pow(abs(off.x), SLIDERS[14]+1.0)*sign(off.x);
        //off.y = pow(abs(off.y), SLIDERS[14]+1.0)*sign(off.y);

#ifdef HIGH_PREC
        // off += SLIDERS[14]; uv += off
        Ox = dsAddF(Ox, SLIDERS[14]);
        Oy = dsAddF(Oy, SLIDERS[14]);

        Ux = dsAdd(Ux, Ox);
        Uy = dsAdd(Uy, Oy);
#else
        off += 0.0 + SLIDERS[14];

        uv += off;
#endif
    }

#ifdef HIGH_PREC
    uv = vec2(dsCollapse(Ux), dsCollapse(Uy));
    vec2 seed = vec2(dsCollapse(S.xy), dsCollapse(S.zw));
#endif

    float d1 = length(uv - vec2(-1.0, 0.0));
    float d2 = length(uv - vec2(1.0, 0.0));
    float d3 = length(uv - seed);
    
    //find closest root shade
    f = d1 < d2 ? 1.0 : 0.75;
    f = d3 < d2 && d3 < d1 ? 0.5 : f;
    
    float tfac = pow(1.0 - toff, 0.25);
    float dfract;
    //dfract = min(dist*0.0025, 1.0);
    dfract = tent(dist*0.004);
    f = sqrt(dfract)*0.5;
    //f = (dfract + f)*0.5;
    //f = sqrt(dfract*f)*0.5;
    
    //f = dfract;
    //f *= f;
    
    //f = pow(f * (1.0-dfract), 0.4);
    //f = mix(pow(dfract, 0.25), dfract, 0.5);
    //f = dfract*dfract*(3.0-2.0*dfract);
    
    //f = f*f*(3.0-2.0*f);
    //f = fract(length(fsample$(z, uv)));    
    //f = fract(length(uv - startuv));

    return f;
}

`

export class NewtonPattern extends Pattern {
  constructor() {
    super()

    this.sharpness = 0.33 //use different default sharpness
  }

  static patternDef(): PatternDef {
    return {
      typeName: 'newton',
      uiName: 'Newton',
      flag: 0,
      description: 'modified newton fractal',
      icon: -1,
      offsetSliders: {
        scale: 4,
        x: 5,
        y: 6,
      },
      presets: NewtonPresets,
      sliderDef: [
        {
          name: 'steps',
          type: 'int',
          range: [5, 955],
          value: 100,
          speed: 7.0,
          exp: 1.5,
        }, //0
        {name: 'offset', value: 0.54, range: [-5.0, 5.0], speed: 0.1}, //1
        {name: 'gain', value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true}, //2
        {name: 'color', value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //3
        {name: 'scale', value: 4.75, range: [0.001, 1000000.0]}, //4
        'x', //5
        'y', //6
        {name: 'colorscale', value: 5.9, noReset: true}, //7
        {name: 'brightness', value: 1.0, range: [0.001, 10.0], noReset: true}, //8
        {name: 'hoff', value: 0.1, range: [-10.0001, 100.0]}, //9
        {name: 'poff', value: 0.39, range: [-8.0, 8.0], speed: 0.1, exp: 1.0}, //10
        {name: 'simple', value: 0.5, range: [-44.0, 44.0]}, //11
        {name: 'offset2', value: 0.0, range: [-5, 5], speed: 0.2}, //12
        {name: 'valueoff', value: 0.0, range: [-15.0, 45.0], speed: 0.15, exp: 1.35, noReset: true}, //13
        {name: 'offset3', value: 0.0, range: [-2.0, 10.0], speed: 0.025}, //14
        {name: 'd', value: 1.0, range: [-25.0, 25.0]}, //15
        {name: 'rot', value: 0.0, range: [-5, 5], baseUnit: 'radian', displayUnit: 'degree'}, //16
      ],
      shader,
      shaderPre,
    }
  }

  setup(ctx: ToolContext, gl: AppGL, uniforms: UniformMap, defines: DefineMap): void {
    defines.STEPS = ~~this.sliders[0]

    defines.VALUE_OFFSET = 'SLIDERS[13]'
    defines.GAIN = 'SLIDERS[2]'
    defines.COLOR_SHIFT = 'SLIDERS[3]'
    defines.COLOR_SCALE = 'SLIDERS[7]'
    defines.BRIGHTNESS = 'SLIDERS[8]'
  }

  savePresetText(opt: PresetText = {}): string {
    let saved = super.savePresetText(opt)
    let obj: PresetText = typeof saved === 'string' ? opt : saved
    delete obj.sliders

    let optStr = JSON.stringify(obj)

    let sliders = JSON.stringify(util.list(this.sliders))

    return `
add_preset_new(${sliders}, ${optStr});
    `.trim()
  }

  viewportDraw(ctx: ToolContext, gl: AppGL, uniforms: UniformMap, defines: DefineMap): void {
    defines.STEPS = ~~this.sliders[0]

    super.viewportDraw(ctx, gl, uniforms, defines)
  }

  copyTo(b: Pattern): void {
    super.copyTo(b)
  }
}

NewtonPattern.STRUCT =
  nstructjs.inherit(NewtonPattern, Pattern) +
  `
}`

Pattern.register(NewtonPattern)
