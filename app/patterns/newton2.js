import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const Newton2Presets = [];

let presetCountBase = 1;

export function add_preset(sliders, options, fixScale = true, hide = false) {
  if (hide) {
    presetCountBase++;
    return;
  }

  let preset = new Newton2Pattern();

  for (let k in options) {
    k = k.toLowerCase();

    if (preset[k] !== undefined) {
      preset[k] = options[k];
    }
  }

  /* we don't want to use normal defaults, stick with zero--
     except for hoff*/
  while (sliders.length < preset.sliders.length) {
    sliders.push(sliders.length === 9 ? 0.32 : 0.0);
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

  Newton2Presets.push(savePreset(preset, name, "Builtin"));
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

#define D$ 1.0

/*

on factor;
off period;

load_package "avector";
  
fz := avec(zx, zy, 0.0);
fp := avec(px, py, 0.0);
 
a  := fz + avec(D1, S12, 0.0);
b  := fz - avec(D1, -S12, 0.0);
c  := fz + avec(D2, S12, 0.0);
d  := fz - avec(D2, -S12, 0.0);
e1 := fz - fp;

ff := avec(a[0]*b[0] - (a[1]*b[1]), a[0]*b[1] + b[0]*a[1], 0.0);
ff := avec(c[0]*ff[0] - (c[1]*ff[1]), c[0]*ff[1] + ff[0]*c[1], 0.0);
ff := avec(d[0]*ff[0] - (d[1]*ff[1]), d[0]*ff[1] + ff[0]*d[1], 0.0);
ff := avec(e1[0]*ff[0] - (e1[1]*ff[1]), e1[0]*ff[1] + ff[0]*e1[1], 0.0);

on fort;
dzx := df(ff[0], zx);
df(ff[0], zy);
df(ff[1], zx);
df(ff[1], zy);
off fort;

ff := avec(a[0]*b[0] - (a[1]*b[1]), a[0]*b[1] + b[0]*a[1], 0.0);
ff := avec(ff[0]*c[0] - (ff[1]*c[1]), ff[0]*c[1] + c[0]*ff[1], 0.0);
ff := avec(ff[0]*d[0] - (ff[1]*d[1]), ff[0]*d[1] + d[0]*ff[1], 0.0);
ff := avec(ff[0]*e1[0] - (ff[1]*e1[1]), ff[0]*e1[1] + e1[0]*ff[1], 0.0);

*/

vec2 fsample$(vec2 z, vec2 p) {
    //(z-1)(z+1)(z-p)
    vec2 a = z + vec2(SLIDERS[15], -SLIDERS[12]);
    vec2 b = z - vec2(SLIDERS[15], SLIDERS[12]);
    vec2 c = z + vec2(SLIDERS[16], -SLIDERS[12]);
    vec2 d = z - vec2(SLIDERS[16], SLIDERS[12]);
    vec2 e = z - p;
    return cmul(cmul(cmul(cmul(a, b), c), d), e);
}

vec2 dfsample_x$(vec2 z, vec2 p) {
    //const float df = 0.0001;
    //vec2 a = fsample(z + vec2(df, 0.0), p);
    //return (a - fsample(z, p)) / df;

    float d1 = SLIDERS[15];
    float d2 = SLIDERS[16];
    const float d = D$;
    float zx = z[0], zy = z[1];
    float px = p[0], py = p[1];
    float s12 = SLIDERS[12];
    
    float dx = -2.0*((py-zy+s12-zy)*zx-(px-zx)*(s12-zy));
    float dy = -((d+zx)*(d-zx)+(s12-zy)*(s12-zy)+2.0*((px-zx)*zx+(py-zy)*(s12-zy)));
    
    dx = (((d1+zx)*(d1-zx)+(s12+zy)*(s12+zy))*(d2+zx)+2.0*(s12+zy)*(s12+zy)*zx)*(
      d2-zx)+((d1+zx)*(d1-zx)+(s12+zy)*(s12+zy)-2.0*(d2+zx)*zx)*(s12+zy)*(s12+zy)+
      2.0*((d1*d1+d2*d2+6.0*s12*s12+12.0*s12*zy-2.0*zx*zx+6.0*zy*zy)*(px-zx)*zx
      -(d1*d1+d2*d2+2.0*s12*s12+4.0*s12*zy-6.0*zx*zx+2.0*zy*zy)*(py-zy)*(s12+
      zy));
           
    dy = -2.0*(((d1*d1+d2*d2+2.0*s12*s12+4.0*s12*zy-6.0*zx*zx+2.0*zy*zy)*(px-zx)
         +4.0*(py-zy)*(s12+zy)*zx)*(s12+zy)+(py-zy-(s12+zy))*(d1*d1+d2*d2+2.0
         *s12*s12+4.0*s12*zy-2.0*zx*zx+2.0*zy*zy)*zx);

    return vec2(dx, dy);
}

vec2 dfsample_y$(vec2 z, vec2 p) {
    //const float df = 0.0001;
    //vec2 a = fsample(z + vec2(0.0, df), p);    
    //return (a - fsample(z, p)) / df;
     
    float d1 = SLIDERS[15];
    float d2 = SLIDERS[16];
    const float d = D$;
    float zx = z[0], zy = z[1];
    float px = p[0], py = p[1];
    float s12 = SLIDERS[12];
    
    float dx = -((d+zx)*(d-zx)+(s12-zy)*(s12-zy)+2.0*((px-zx)*zx+(py-zy)*(s12-zy)));
    float dy = 2.0*((py-zy+s12-zy)*zx-(px-zx)*(s12-zy));
          
    //dx = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
    //dy = -2.0*((py-zy-zy)*zx+(px-zx)*zy);
    
    dx = 2.0*(((d1*d1+d2*d2+6.0*s12*s12+12.0*s12*zy-2.0*zx*zx+6.0*zy*zy)*(py-zy
         )-4.0*(px-zx)*(s12+zy)*zx)*zx+(px-zx-zx)*(d1*d1+d2*d2+2.0*s12*s12+4.0
         *s12*zy-2.0*zx*zx+2.0*zy*zy)*(s12+zy));
    
    dy =(((d1+zx)*(d1-zx)+(s12+zy)*(s12+zy))*(d2+zx)+2.0*(s12+zy)*(s12+zy)*zx)*(
        d2-zx)+((d1+zx)*(d1-zx)+(s12+zy)*(s12+zy)-2.0*(d2+zx)*zx)*(s12+zy)*(s12+zy)-
        2.0*(((d1*d1+d2*d2+2.0*s12*s12+4.0*s12*zy-6.0*zx*zx+2.0*zy*zy)*(py-zy)-4.0*
        (px-zx)*(s12+zy)*zx)*(s12+zy)-(d1*d1+d2*d2+2.0*s12*s12+4.0*s12*zy-2.0
        *zx*zx+2.0*zy*zy)*(px-zx)*zx);

     
    return vec2(dx, dy);
}

float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;
    
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[5];
    uv.y += SLIDERS[6];

    uv *= SLIDERS[4];

    vec2 seed = uv;
    
    float f = 0.0;
    float dist = 0.0;
    vec2 z;
    
    vec2 p = uv;
    float fsum = 0.00001;
    vec2 lastoff;
    vec2 doff;

    for (int i=0; i<STEPS; i++) {
      vec2 z = cmul(p, vec2(0.33333 + SLIDERS[1], SLIDERS[1]));
      
      const float d = D$;
      
      vec2 a = fsample$(z, seed);
      vec2 dx = dfsample_x$(z, seed);
      vec2 dy = dfsample_y$(z, seed);
      
      if (dot(a, a) < 0.001) {
        break;
      }
      
      mat2 mat = mat2(dx, dy);
      mat = transpose(mat);
      mat = inverse(mat);
      
      //if (abs(determinant(mat)) < 0.00001) {
      //  break;
      //}
       
      vec2 off = -(mat * a);
      
      off = mix(off, vec2(-off.y, off.x), SLIDERS[10]);
      
      //doff = (off - lastoff);//*0.5 + doff*0.5;
      doff = off - lastoff;
      
      p += off;
      
      float fscale = pow(1.0 - float(i+1) / float(STEPS), SLIDERS[17]);
      
      dx *= 0.001;
      dy *= 0.001;
      doff *= 0.001;
      vec2 divoff = dx*dy*0.00001*doff;
      
      f += fscale * length(off) / (0.01 + pow(length(divoff), 1.0/SLIDERS[9]));
      
      fsum += 1.0;
      
      lastoff = off;
    }
    
    f = abs(f / (fsum*fsum));
    //f = min(f, 1.0);
    
    f = tent(f);
    
    //f /= 1.0 + length(uv - p);
    //f = p[0] + p[1];
    //f = fract(f);
    
    return f;//fract(f);
}

`


export class Newton2Pattern extends Pattern {
  constructor() {
    super();

    this.sharpness = 0.33; //use different default sharpness
  }

  static patternDef() {
    return {
      typeName     : "newton2",
      uiName       : "Newton 2",
      flag         : 0,
      description  : "modified newton fractal",
      icon         : -1,
      offsetSliders: {
        scale: 4,
        x    : 5,
        y    : 6,
      },
      presets      : Newton2Presets,
      sliderDef    : [
        {
          name : "steps", integer: true,
          range: [5, 955],
          value: 100,
          speed: 7.0,
          exp  : 1.5,
        }, //0
        {name: "offset", value: 0.0, range: [-5.0, 5.0], speed: 0.1}, //1
        {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //3
        {name: "scale", value: 8.0, range: [0.001, 1000000.0]}, //4
        "x",  //5
        "y",  //6
        {name: "colorscale", value: 1.1, range: [0.0001, 100.0], noReset: true},//7
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset: true}, //8
        {name: "hoff", value: 0.1, range: [0.0001, 10.0]}, //9
        {name: "poff", value: 0.0, range: [-24.0, 24.0], speed: 0.1, exp: 1.0}, //10
        {name: "simple", value: 0.5, range: [-44.0, 44.0]}, //11
        {name: "offset2", value: 0.0, range: [-5, 5], speed: 0.2},//12
        {name: "valueoff", value: 0.0, range: [-15.0, 45.0], speed: 0.15, exp: 1.35, noReset: true}, //13
        {name: "offset3", value: 0.0, range: [-2.0, 10.0], speed: 0.025}, //14
        {name: "z1", value : 1.0, speed : 1.0}, //15
        {name: "z2", value : -1.0, speed : 1.0}, //16
        {name: "z3", value : 0.5, speed : 1.0}, //17
      ],
      shader,
      shaderPre
    }
  }

  setup(ctx, gl, uniforms, defines) {
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

Newton2Pattern.STRUCT = nstructjs.inherit(Newton2Pattern, Pattern) + `
}`;

Pattern.register(Newton2Pattern);
