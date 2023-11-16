import {
  util, nstructjs, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const MountainPresets = [];

let baseNameIdx = 1;

export function add_preset(sliders, opts) {
  let pat = new MountainPattern();

  for (let k in opts) {
    pat[k] = opts[k];
  }

  for (let i = 0; i < Math.min(sliders.length, pat.sliders.length); i++) {
    pat.sliders[i] = sliders[i];
  }

  let name = "Builtin #" + (baseNameIdx++);

  let preset = savePreset(pat, name, "Builtin");
  MountainPresets.push(preset);
}

const shaderPre = ``;
const shader = `

float myhash$(float seed) {
    float f = fract(sin(seed*13.0) + seed*8.9);
    return fract(1.0 / (f*0.0001 + 0.0000001));
}

float myhash2$(vec2 p) {
    float a = 0.445325234;
    
    p += tent(p*4.1234)*2.0 - 1.0;
    
    float f = p[0]*a + p[1]/a;
    
    return myhash$(f);
}

float tex1(vec2 p) {
  float f;
  float u = fract(p.x);
  float v = fract(p.y);
  
  u = u*u*(3.0 - 2.0*u);
  v = v*v*(3.0 - 2.0*v);
  
  p = floor(p);
  
  float f1 = myhash2$(p);
  float f2 = myhash2$(p+vec2(0.0, 1.0));
  float f3 = myhash2$(p+vec2(1.0, 1.0));
  float f4 = myhash2$(p+vec2(1.0, 0.0));
  
  float a = f1 + (f2 - f1) * v;
  float b = f4 + (f3 - f4) * v;
  
  f = a + (b - a) * u;
  
  return f;
}

float tex2(vec2 p) {
  float f;
  
  const float th = 2.75;
  float f1 = tex1(p);
  float f2 = tex1(rot2d(p+3.23432, th));
  float f3 = tex1(rot2d(p.yx+6.432423, th*2.0));
  
  f = (f1+f2+f3)*0.333333;
  
  return f;
}

float tex(vec2 p) {
  const int steps = 5;
  
  float dscale = OFFSET1;
  float f = 0.0, fsum = 0.0;
  float totw = 0.0;
  float offset = OFFSET1;
  
  for (int i=0; i<steps; i++) {
    float f2 = tex2(p);
    float w = float(steps-i);
    w *= w;
    
    f += f2*w;
    totw += w;
    p = p*dscale + offset;    
    offset *= OFFSET1;
  }
  
  f /= totw;
  
  return f;
}

vec2 uvclamp(vec2 uv) {
  return clamp(uv, 0.000001, 0.9999);
}

vec4 bitexture(sampler2D tex, vec2 uv) {
  //return texture(tex, uv);
  
  vec2 p = uv * iRes - 0.5;
  
  float u = fract(p.x);
  float v = fract(p.y);
  
  //u = u*u*(3.0 - 2.0*u);
  //v = v*v*(3.0 - 2.0*v);
  
  p = floor(p) + 0.5;
  
  float df = 1.0;
  
  vec4 c1 = texture(tex, uvclamp((p + vec2(0.0, 0.0))*iInvRes));
  vec4 c2 = texture(tex, uvclamp((p + vec2(0.0, df))*iInvRes));
  vec4 c3 = texture(tex, uvclamp((p + vec2(df, df))*iInvRes));
  vec4 c4 = texture(tex, uvclamp((p + vec2(df, 0.0))*iInvRes));
  
  vec4 a = c1 + (c2 - c1) * v;
  vec4 b = c4 + (c3 - c4) * v;
  
  return a + (b - a)*u;
}

float pattern(vec2 tuv, inout vec2 vis) {
#ifdef FIRST_TIME
  vec2 uv = tuv;
  
  uv = uv*2.0 - 1.0;
  uv.x *= aspect;
  
  uv.x += OFFSETX;
  uv.y += OFFSETY;
  uv *= SCALE*5.0;

  float f = tex(uv);
  
  f = tent(pow(f, POW)*MUL + OFFSET2);
  return f;
#else

tuv += uhash2v(tuv*iRes+T)*iInvRes.x*RAND2;

vec4 c = bitexture(rgba, tuv);

vec2 sum;
const int n = DVFILTER;
float totw = 0.0;

for (int ix=-n; ix<=n; ix++) {
for (int iy=-n; iy<=n; iy++) {
  vec2 dv = vec2(float(ix), float(iy));
  
  float w = 1.0 - length(dv) / (sqrt(2.0)*3.0);
  //w = w*w*(3.0 - 2.0*w);
  w = pow(w, 2.0);
  
  //w *= w*w*w*w;
  //w = 1.0;
  
  vec4 c2 = bitexture(rgba, tuv + dv*iInvRes*2.0);
  float f2 = -(c2[0] - c[0]);
  
  sum += dv*w*f2;
  totw += w; 
}
}

  sum *= 2.0*iInvRes/totw;

  float df = iInvRes.x*2.0;
  vec2 off1 = uhash2v(tuv)*df*10.0;
  vec2 off2 = uhash2v(tuv+vec2(.23423, .523423))*df*1.0;
  
  vec2 offx = normalize(vec2(iInvRes.x, 0.0) + off1)*df;
  //vec2 offy = normalize(vec2(0.0, iInvRes.x) + off2)*df;
  vec2 offy = rot2d(offx, M_PI*0.5);
  
  //return c[0];
  
  vec4 c1 = bitexture(rgba, tuv + offx);
  vec4 c2 = bitexture(rgba, tuv + offy);
  
  float dx = (c1[0] - c[0]) / df;
  float dy = (c2[0] - c[0]) / df;
  
  float rand = RAND / (1.0 + T*100.0);
  vec2 dv = sum;
  
  dv.x = pow(abs(dv.x), FAC3)*sign(dv.x);
  dv.y = pow(abs(dv.y), FAC3)*sign(dv.y);
  
  //dv = rot2d(dv, (hash2(tuv*iRes+T)-0.5)*10.0*RAND); //vec2(dx, dy);
  //dv += uhash2v(tuv*iRes+T)*rand*iInvRes*0.1;

  vec2 pd = normalize(dv);
  pd = vec2(-pd.y, pd.x);
  pd *= iInvRes.x;
  
  float rnd = (hash2(tuv*iRes)-0.5);
  rnd = (tex2(tuv*iRes/RSCALE)-0.5); // + iRes*3.23432*sin(T*120.2342))-0.5);
  //rnd *= 0.5;
  
  vis[0] = rnd;
  
  if (c[0] > 0.5) {
    //dv = -dv;
  }
  
  if (c[0] > 0.99) {
  //  return c[0];
  }
  
  float speed = SPEED*200.0;

  dv *= speed;
  //dv = normalize(dv)*SPEED*iInvRes.x*10.0;
  
  dv += pd*RAND*rnd*1000.0;
  
  //f2 is lower down the mountain
  //dv = -dv;
  float f = bitexture(rgba, tuv + dv)[0];
  float f2 = bitexture(rgba, tuv - dv)[0];
  
  //f = mix(c[0], f, FAC);
  //f = abs(f);
  
  float fac = 1.0;
  //fac *= pow((1.0-c[0])*1.2, 1.0);
  fac *= FAC*0.2;
  
  f *= sign(SPEED);
  f2 *= sign(SPEED);
  
  f = c[0] + f*fac - f2*fac;
  f = mix(c[0], f, FAC2);
  
  f = max(0.0, f);
  f = min(f, 4.0);
  
  return f;
#endif
}

//note that we defined CUSTOM_MAIN in MountainPattern.setup
void main() {
  vec2 vis = vec2(1.0, 1.0);
  float f = pattern(gl_FragCoord.xy*iInvRes.xy, vis);
  
#ifndef FIRST_TIME
  //f = vis[0];
#endif
  fragColor = vec4(f, f, f, 1.0);
  fragVar = vec4(0.0, 0.0, 0.0, 1.0);
}

`;

let default_sliders = [1, 0.0225, 1.08, 1.35, 0, 0, 0, 0.24461180928, 0.5659996795654286, 2.115199714660654, 0.5051995201110887, 1.5023998012542727, 6.192799331665044, 0.29839690399169805, 0.0848000030517575, 18.414593624114985, 0.45879895019531197, 0.29439957427978347, 0.5627997131347646, 0.9860000000000004, 0.5, 3.0001];
default_sliders = [1,0.0147,1.08,1,0,0,0,0.1694019937065341,0.31599578857422106,1.9139999313354483,1.096399929046639,1.462000000000001,5.252000000000001,0.6063991889953617,0,3.7453905296325622,1.0679978637695293,0.2107994308471659,0.5035992889404283,4.319099938964844,0.9860000000000004];

export class MountainPattern extends Pattern {
  constructor() {
    super();

    this.max_samples = 1024;
    this.no_gradient = true;
    this.enableAccum = false;
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    return st;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);
  }

  static patternDef() {
    let sdefs = [
      {name: "gain", value: 1.0, range: [-1, 35], noReset : true}, //0
      {name: "color", value: 0.65, range: [-1, 35], noReset : true}, //1
      {name: "colorscale", value: 1.0, range: [-35, 35], noReset : true}, //2
      {name: "brightness", value: 1.0, range: [0.0001, 3.0], noReset : true},//3
      {name: "valoffset", value: 0.0, range: [-100, 100], noReset : true},//4
      {name: "x"},//5
      {name: "y"},//6
      {name: "scale", value: 0.2},//7
      {name: "speed", value: 1.0, range: [-10.0, 10.0], noReset: true},//8
      {name: "offset1", speed: 0.2},
      {name: "offset2", speed: 0.2, value: 0.0},
      {name: "pow", speed: 0.2, value: 1.0},
      {name: "mul", speed: 0.2, value: 1.0},
      {name: "fac", speed: 0.2, value: 0.2, noReset: true},
      {name: "rand", speed: 0.2, value: 1.0, range : [0.0, 7.0], noReset: true},
      {name: "rscale", expRate: 1.2, speed: 1.3, value: 5.0, noReset: true},
      {name: "rand2", speed : 0.2, value : 0.1, noReset : true},
      {name: "fac2", speed: 0.2, value: 0.5, noReset: true},
      {name: "fac3", speed: 0.2, value: 0.5, noReset: true},
      {name: "dvfilter", speed : 0.5, value : 3.001, noReset : true, range : [1.0001, 8.0001]},
    ];

    for (let i=0; i<Math.min(default_sliders.length, sdefs.length); i++) {
      sdefs[i].value = default_sliders[i];
    }

    return {
      typeName     : 'mountain',
      uiName       : 'Mountains',
      offsetSliders: {
        x    : 5,
        y    : 6,
        scale: 7
      },
      presets      : MountainPresets,
      sliderDef    : sdefs,
      shaderPre,
      shader,
    }
  }

  savePresetText(opt = {}) {
    opt.sharpness = opt.sharpness ?? this.sharpness;
    opt.use_sharpness = opt.use_sharpness ?? this.use_sharpness;
    opt.max_samples = opt.max_samples ?? this.max_samples;
    opt.no_gradient = opt.no_gradient ?? this.no_gradient;

    return `
add_preset(${JSON.stringify(util.list(this.sliders))}, ${JSON.stringify(opt)});
    `.trim();
  }

  setup(ctx, gl, uniforms, defines) {
    let uf = key => this.sliders.getUniformRef(key);

    defines.DVFILTER = ~~this.sliders.dvfilter;

    defines.CUSTOM_MAIN = null;
    defines.BRIGHTNESS = uf("brightness");
    defines.VALUE_OFFSET = uf("valoffset");
    defines.COLOR_SHIFT = uf("color");
    defines.COLOR_SCALE = uf("colorscale");
    defines.GAIN = uf("gain");
    defines.SPEED = uf("speed");

    defines.OFFSETX = uf("x");
    defines.OFFSETY = uf("y");
    defines.SCALE = uf("scale");

    defines.OFFSET1 = uf("offset1");
    defines.OFFSET2 = uf("offset2");
    defines.POW = uf("pow");
    defines.MUL = uf("mul");
    defines.FAC = uf("fac");
    defines.FAC2 = uf("fac2");
    defines.FAC3 = uf("fac3");
    defines.RAND = uf("rand");
    defines.RSCALE = uf("rscale");
    defines.RAND2 = uf("rand2");

    if (this.drawSample === 0) {
      defines.FIRST_TIME = null;
    }
  }

  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    super.viewportDraw(ctx, gl, uniforms, defines);
  }
}

MountainPattern.STRUCT = nstructjs.inherit(MountainPattern, Pattern) + `
}`;
Pattern.register(MountainPattern);
