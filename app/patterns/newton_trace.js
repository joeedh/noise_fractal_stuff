import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const NewtonTracePresets = [];

let presetCountBase = 1;

export function add_preset(sliders, options, fixScale = true, hide = false) {
  if (hide) {
    presetCountBase++;
    return;
  }

  let preset = new NewtonTracePattern();

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

  NewtonTracePresets.push(savePreset(preset, name, "Builtin"));
}

export function add_preset_new(sliders, options, hide = false) {
  return add_preset(sliders, options, false, hide);
}

const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];


#define M_PI 3.141592654

vec2 cmul(vec2 a, vec2 b) {
    return vec2(
        a[0]*b[0] - a[1]*b[1],
        a[0]*b[1] + b[0]*a[1]
    );
}

vec2 fsample(vec2 z, vec2 p) {
    const float d = 1.0;
    //(z-1)(z+1)(z-p)
    vec2 a = z - vec2(d, 0.0);
    vec2 b = z + vec2(d, 0.0);
    vec2 c = z - p;
    return cmul(cmul(a, b), c);
}


float length2(vec2 p) {
  float sf = dot(p, p), f = sf < 1.0 ? sf*10.5 : sf*0.25;
  
  if (isnan(sf)) {
    return 0.01;
  }
  
  f = (f*f + 3.0*sf) / (3.0*f + sf/f);
  f = (f*f + 3.0*sf) / (3.0*f + sf/f);
  //f = (f + sf/f)*0.5;
 
  return f;
}

float pattern2(float ix, float iy, float offset) {
    vec2 uv = vec2(ix, iy);
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

    tm = offset;
    //tm = pow(tm, 1.0/1.0);
    float toff = pow(tm, 0.25);
    
    for (int i=0; i<STEPS; i++) {
        //float toff = sin(T*0.1);
        //toff = 0.75;
        z = cmul(uv, vec2(0.333333 + tm*0.5, 0.0 + tm)); //0.85*toff));
        
        vec2 a = fsample(z, seed);

#if 0 //finite differences
        float df = 0.0002;

        vec2 b = fsample(z+vec2(df, 0.0), seed);
        vec2 c = fsample(z+vec2(0.0, df), seed);
        
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
    //f = fract(length(fsample(z, uv)));    
    //f = fract(length(uv - startuv));
    
    return f;
}


vec2 rot2d(vec2 a, float th) {
  return vec2(cos(th)*a.x + sin(th)*a.y, cos(th)*a.y - sin(th)*a.x);
}

struct RenderState {
  vec3 co;
  vec3 dir;
  float t;
  float f;
  vec3 no;
};

RenderState cube(RenderState state) {
  vec3 co = state.co;
  
  co.x = abs(co.x);
  co.y = abs(co.y);
  co.z = abs(co.z);
  
  float f = min(min(co.x, co.y), co.z) - 0.5;
  
  co -= 0.5;
  //co -= 0.5;
  
  state.no = vec3(0.0, 0.0, 0.0);
  state.f = -f;
  
  if (co.x > co.y && co.x > co.z) {
    state.no[0] = sign(state.f);
  } else if (co.y > co.x && co.y > co.z) {
    state.no[1] = sign(state.f);
  } else {
    state.no[2] = sign(state.f);
  }
  
  return state;
}

RenderState isect(RenderState a, RenderState b) {
  if (b.f > a.f) {
    return b;
  }
  
  return a;
}

RenderState sphere(RenderState state) {
  state.f = length(state.co) - 0.5;
  state.no = normalize(state.co);
  
  return state;
}

RenderState cylinder(RenderState state) {
  state.f = length(state.co.xy) - 2.5;
  state.no = normalize(vec3(state.co.xy, 0.0));
  
  return state;
}

void field(inout RenderState state) {
  //state = cube(state);
  //state = sphere(state);
  
  float x = state.co.x*SLIDERS[20];
  float y = state.co.y*SLIDERS[20];
  
  float off = SLIDERS[1] + (abs(state.co.z + 0.25))*SLIDERS[19]*SLIDERS[20];
  
  float f = pattern2(x, y, off)*SLIDERS[21];
  
  f -= SLIDERS[18];
  f = -f;

  f /= SLIDERS[20];
  
  //f *= abs(state.co.z);
  
  state.f = f*SLIDERS[22];
  
  //if (abs(state.co.z) > 0.2) {
  //  state.f = abs(state.co.z) - 0.2;
  //}
  
  //state = isect(state, cylinder(state));
  state = isect(state, sphere(state));
}

void rtrace(inout RenderState state) {
  float mul = SLIDERS[16];
   
  state.co += state.dir * 0.0;
  
  for (int i=0; i<STEPS2; i++) {
    field(state);
    
    if (abs(state.f) < SLIDERS[23]) {
      return;
    }
    
    state.co += state.dir * state.f * mul;
    state.t += state.f * mul;
  }
  
  state.f = 0.0;
}

float pattern(float ix, float iy) {
  float f;
  
  vec2 uv = vec2(ix, iy)*iInvRes;
  uv = uv*2.0 - 1.0;
  uv.x *= aspect;
  //uv *= 2.0;
  
  uv.x += SLIDERS[5];
  uv.y += SLIDERS[6];
  uv *= SLIDERS[4];
  
  RenderState state;
  vec3 rp = vec3(0.0, SLIDERS[15], -2.0); //origin
  vec3 rt = vec3(0.0, 0.0, 0.0); //target
  vec3 rd;
  
  rp.yz = rot2d(rp.yz, SLIDERS[12]);
  rp.xy = rot2d(rp.xy, SLIDERS[13]);
  
  float pixsize = 0.2; //max(iInvRes.x, iInvRes.y);
  
  rd = normalize(rt - rp);
  
  vec3 side = normalize(cross(rd, vec3(0.0, 0.0, 1.0)));
  vec3 up = normalize(cross(side, rd));
  
  vec3 planeco = rp;
  
  planeco += side * uv.x + up*uv.y + rd*SLIDERS[14];
  
  rd = normalize(planeco - rp);
  
  state.co = rp;
  state.dir = rd;
  state.t = 0.0;
  state.f = 0.0;
  
  rtrace(state);
  
  float l = dot(state.no, normalize(vec3(0.1, 0.2, 0.3)))*0.5 + 0.5;
  //l = state.t*0.03; //fract(state.t);
  
  l = state.f;
  l = abs(state.co.z);
  l *= float(fract(state.co.z*5.0) > 0.5)*0.5 + 0.5;
  
  l = isnan(l) ? 0.001 : l;
  l = l != (1.0 / (1.0 / l)) ? 0.001 : l;
  
  vec3 co = state.co;
  vec3 no;
  const float df = 0.0001;
  
  float f1 = state.f;
  
  state.co = co + vec3(df, 0.0, 0.0);
  field(state);
  no.x = state.f - f1; 

  state.co = co + vec3(0.0, df, 0.0);
  field(state);
  no.y = state.f - f1; 

  state.co = co + vec3(0.0, 0.0, df);
  field(state);
  no.z = state.f - f1; 
  
  no = normalize(no);
  no = no*0.5 + 0.5;
  
  state.co = co + no*0.01;
  field(state);
  
  l = no[0];
  l = abs(state.f * 100.0);
  l = min(max(l, 0.0), 1.0);
  
  //l = pow(l, 0.4);
  
  l = sqrt(l*no[0]);
  
  return l*0.3;
}
`


export class NewtonTracePattern extends Pattern {
  constructor() {
    super();

    this.renderTiles = true;
    this.samplesPerTile = 5;

    this.sharpness = 0.33; //use different default sharpness
  }

  static patternDef() {
    return {
      typeName     : "newton_trace",
      uiName       : "Newton Trace",
      flag         : 0,
      description  : "modified newton fractal",
      icon         : -1,
      offsetSliders: {
        scale: 4,
        x    : 5,
        y    : 6,
      },
      presets      : NewtonTracePresets,
      sliderDef    : [
        {
          name : "steps", integer: true,
          range: [5, 955],
          value: 100,
          speed: 7.0,
          exp  : 1.5,
        }, //0
        {name: "offset", value: 0.54, range: [-5.0, 5.0], speed: 0.1}, //1
        {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset : true},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset : true}, //3
        {name: "scale", value: 1.0, range: [0.001, 1000000.0]}, //4
        "x",  //5
        "y",  //6
        {name: "colorscale", value: 5.9, noReset : true},//7
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset : true}, //8
        {name: "hoff", value: 0.1, range: [0.0001, 10.0]}, //9
        {name: "poff", value: 0.39, range: [-8.0, 8.0], speed: 0.1, exp: 1.0}, //10
        {name: "simple", value: 0.5, range: [-44.0, 44.0]}, //11
        {name: "pitch", value : 0.0}, //12,
        {name: "roll", value : 0.0}, //13
        {name: "fov", value : 0.1, speed : 0.1}, //14
        {name: "dist", value : 5.0, speed: 1.0}, //15
        {name: "eps", value : 0.25, speed : 0.0025}, //16
        {name: "steps2", value : 25.0, speed : 2.5}, //17
        {name: "limit", value : 0.5, speed : 0.1}, //18
        {name: "depth", value : 0.5, speed : 0.1}, //19
        {name: "scale2", value : 0.1, speed : 0.1}, //20
        {name: "scale3", value : 0.5, speed : 0.1}, //21
        {name: "scale4", value : 0.25, speed : 0.1}, //22
        {name: "rlimit", value : 0.001, speed : 0.00025, exp : 1.0, range : [0.00001, 0.1]}, //23
      ],
      shader
    }
  }

  setup(ctx, gl, uniforms, defines) {
    //defines.VALUE_OFFSET = "SLIDERS[13]";
    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[7]";
    defines.BRIGHTNESS = "SLIDERS[8]";
    defines.STEPS2 = ~~this.sliders.steps2;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    con.prop("samplesPerTile");
    con.prop("renderTiles");
  }
  
  savePresetText(opt={}) {
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

NewtonTracePattern.STRUCT = nstructjs.inherit(NewtonTracePattern, Pattern) + `
  renderTiles : bool;
}`;

Pattern.register(NewtonTracePattern);
