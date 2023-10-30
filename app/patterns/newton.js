import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const NewtonPresets = [];

let presetCountBase = 1;

export function add_preset(sliders, options, fixScale = true, hide = false) {
  if (hide) {
    presetCountBase++;
    return;
  }

  let preset = new NewtonPattern();

  for (let k in options) {
    if (k === "curveset") {
      continue;
    }

    k = k.toLowerCase();

    if (preset[k] !== undefined) {
      preset[k] = options[k];
    }
  }

  if (options && "curveset" in options) {
    preset.use_curves = true;
    preset.curveset.loadJSON(options.curveset);
  }

  /* we don't want to use normal defaults, stick with zero--
     except for hoff*/
  let sdef = NewtonPattern.getPatternDef().sliderDef;

  while (sliders.length < preset.sliders.length) {
    let val = sdef[sliders.length].value || 0.0;
    sliders.push(sliders.length === 9 ? 0.32 : val);
  }

  let tot = Math.min(sliders.length, preset.sliders.length);
  for (let i = 0; i < tot; i++) {
    preset.sliders[i] = sliders[i];
  }

  if (fixScale) {
    preset.sliders[4] = 1.0/preset.sliders[4];
  }

  let name = "Builtin #" + presetCountBase;
  presetCountBase++;

  NewtonPresets.push(savePreset(preset, name, "Builtin"));
}

export function add_preset_new(sliders, options, hide = false) {
  return add_preset(sliders, options, false, hide);
}

const shaderPre = ``;

const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];

//$ is replaced with pattern.id
vec2 fsample$(vec2 z, vec2 p) {
    float d = SLIDERS[15];
    
    //(z-1)(z+1)(z-p)
    vec2 a = z - vec2(d, 0.0+SLIDERS[12]);
    vec2 b = z + vec2(d, 0.0-SLIDERS[12]);
    vec2 c = z - p;
    return cmul(cmul(a, b), c);
}

float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;
    
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[5];
    uv.y += SLIDERS[6];//+0.5*SLIDERS[4];

    uv *= SLIDERS[4];

    vec2 seed;
    
    vec2 dr, di;
    float f = 0.0;
    float dist = 0.0;
    vec2 z;
    
    vec2 startuv = uv;
    
    float tm = 0.0;
    float tm2 = 0.0;
    
#ifndef SIMPLE_MODE
  seed = uv;
#else
    seed = vec2(SLIDERS[11], 0.0); //0.4132432);
    //seed = vec2(pow(SLIDERS[11], uv[0]*0.5+0.5), pow(SLIDERS[11], uv[1]*0.5+0.5));
#endif

    tm = SLIDERS[1];
    //tm = pow(tm, 1.0/1.0);
    float toff = pow(tm, 0.25);
    
    for (int i=0; i<STEPS; i++) {
        //float toff = sin(T*0.1);
        //toff = 0.75;
        z = cmul(uv, vec2(0.333333 + tm*0.5, 0.0 + tm)); //0.85*toff));
        
        vec2 a = fsample$(z, seed);

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
        mat2 m = mat2(dr, di);
        
        m = inverse(m);
        
        vec2 off = -m * a;
        
#if 0
        if (i % 2 == 1) {
          off.x *= -1.0;
        } else {
          off.y *= -1.0;
        }
#endif
        
        off.xy += vec2(-off.y, off.x)*SLIDERS[10];
        
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
        
        off += 0.0 + SLIDERS[14];
          
        uv += off;
    }
    
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
    super();

    this.sharpness = 0.33; //use different default sharpness
  }

  static patternDef() {
    return {
      typeName     : "newton",
      uiName       : "Newton",
      flag         : 0,
      description  : "modified newton fractal",
      icon         : -1,
      offsetSliders: {
        scale: 4,
        x    : 5,
        y    : 6,
      },
      presets      : NewtonPresets,
      sliderDef    : [
        {
          name : "steps",
          type : "int",
          range: [5, 955],
          value: 100,
          speed: 7.0,
          exp  : 1.5,
        }, //0
        {name: "offset", value: 0.54, range: [-5.0, 5.0], speed: 0.1}, //1
        {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //3
        {name: "scale", value: 4.75, range: [0.001, 1000000.0]}, //4
        "x",  //5
        "y",  //6
        {name: "colorscale", value: 5.9, noReset: true},//7
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset: true}, //8
        {name: "hoff", value: 0.1, range: [0.0001, 10.0]}, //9
        {name: "poff", value: 0.39, range: [-8.0, 8.0], speed: 0.1, exp: 1.0}, //10
        {name: "simple", value: 0.5, range: [-44.0, 44.0]}, //11
        {name: "offset2", value: 0.0, range: [-5, 5], speed: 0.2},//12
        {name: "valueoff", value: 0.0, range: [-15.0, 45.0], speed: 0.15, exp: 1.35, noReset: true}, //13
        {name: "offset3", value: 0.0, range: [-2.0, 10.0], speed: 0.025}, //14
        {name: "d", value: 1.0, range: [-25.0, 25.0]}, //15
      ],
      shader,
      shaderPre
    }
  }

  setup(ctx, gl, uniforms, defines) {
    defines.STEPS = ~~this.sliders[0];

    defines.VALUE_OFFSET = "SLIDERS[13]";
    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[7]";
    defines.BRIGHTNESS = "SLIDERS[8]";
  }

  savePresetText(opt = {}) {
    opt.sharpness = opt.sharpness ?? this.sharpness;
    opt.filter_width = opt.filter_width ?? this.filter_width;
    //opt.max_samples = opt.max_samples ?? this.max_samples;

    if (this.use_curves) {
      opt.use_curves = true;
      opt.curveset = JSON.parse(JSON.stringify(this.curveset));
    }

    opt = JSON.stringify(opt);

    let sliders = JSON.stringify(util.list(this.sliders));

    return `
add_preset_new(${sliders}, ${opt});
    `.trim();
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    defines.STEPS = ~~this.sliders[0];

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b) {
    super.copyTo(b);
  }
}

NewtonPattern.STRUCT = nstructjs.inherit(NewtonPattern, Pattern) + `
}`;

Pattern.register(NewtonPattern);
