import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern, PatternFlags} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const FractalTracePresets = [];

let presetCountBase = 1;

export const LightingModes = {
  SHADOW: 1,
  AO    : 2,
  GI    : 4
};

export function add_preset(sliders, opts = {}, hide = false) {
  let pat = new TraceFractalPattern();

  opts.filter_width = opts.filter_width ?? pat.filter_width;
  opts.pixel_size = opts.pixel_size ?? pat.pixel_size;
  opts.sharpness = opts.sharpness ?? pat.sharpness;

  for (let k in opts) {
    pat[k] = opts[k];
  }

  for (let i = 0; i < Math.min(sliders.length, pat.sliders.length); i++) {
    pat.sliders[i] = sliders[i];
  }

  let name = "Builtin " + (presetCountBase++);
  let preset = savePreset(pat, name, "Builtin");

  FractalTracePresets.push(preset);
}

const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];

uniform vec3 lightCo;
uniform vec3 lightNo;

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

struct RenderState {
  vec3 co;
  vec3 dir;
  float t;
  float f;
  float scale;
  float color;
  vec3 no;
};

RenderState cube(RenderState state, float limit) {
  vec3 co = state.co;
  
  co.x = abs(co.x);
  co.y = abs(co.y);
  co.z = abs(co.z);
  
  float f = max(max(co.x, co.y), co.z)-limit;
  //f = min(min(co.x, co.y), co.z) - limit;
  
  //co -= 0.5;
  //co -= 0.5;
  
  state.no = vec3(0.0, 0.0, 0.0);
  state.f = f;
  
  if (co.x > co.y && co.x > co.z) {
    state.no[0] = sign(state.co[0]);
  } else if (co.y > co.x && co.y > co.z) {
    state.no[1] = sign(state.co[1]);
  } else {
    state.no[2] = sign(state.co[2]);
  }
  
  return state;
}

RenderState isect(RenderState a, RenderState b) {
  if (b.f > a.f) {
    return b;
  }
  
  return a;
}

RenderState sunion(RenderState a, RenderState b) {
  if (b.f < a.f) {
    //b.f = smin(a.f, b.f, SMOOTH_FAC);
    return b;
  }
  
  //a.f = smin(a.f, b.f, SMOOTH_FAC);
  return a;
}

RenderState diff(RenderState a, RenderState b) {
  if (-b.f > a.f) {
    b.f = -b.f;
    return b;
  }
  
  return a;
}

RenderState sphere(RenderState state, float limit) {
  state.f = length(state.co) - limit;
  state.no = normalize(state.co);
  
  return state;
}

RenderState cylinder(RenderState state) {
  state.f = length(state.co.xy) - 2.5;
  state.no = normalize(vec3(state.co.xy, 0.0));
  
  return state;
}

RenderState scaleField(RenderState state, float scale) {
  state.co *= scale;
  //state.f *= scale;
  //state.scale *= scale;
  
  return state;
}

float smoothabs(float f, float t) {
  f = abs(f);
  if (f < t) {
    f /= t;
    f = f*f*(3.0 - 2.0*f);
    //f = cos((1.0 - f)*M_PI)*0.5 + 0.5;
    //f = 1.0 - exp(-f*f*6.0);
    
    f *= t;
  }
  
  return f;
}

void field(inout RenderState state) {
  state.color = 1.0;
  
  RenderState state2 = state;
  state2 = cube(state2, 0.5);
  
  float level_scale = LEVEL_SCALE;
  float level_limit = LEVEL_LIMIT;
  float level_rot1 = LEVEL_ROT1;
  float level_rot2 = LEVEL_ROT2;
  
  vec3 co = state.co;
#if LEVEL_MODE == 0
  for (int i=0; i<LEVELS; i++) {
    co.xy = rot2d(co.xy, level_rot1);
    co.yz = rot2d(co.yz, level_rot2);

    RenderState state3 = state2;

    //state3.co += OFFSET/level_scale;
    state3.co = fract((co+OFFSET) * level_scale)*2.0 - 1.0;
    state3.co /= level_scale*2.0;
    state3.color = 1.0 - float(i) / float(LEVELS);
    
    //state3.co += LEVEL_SCALE/3.0;
    
    state3 = cube(state3, level_limit);    
    state2 = diff(state2, state3);
    
    level_scale *= LEVEL_SCALE;
    level_limit /= LEVEL_SCALE;
    
    level_rot1 += LEVEL_ROT1;
    level_rot2 += LEVEL_ROT2;
  }
#else
  RenderState state3 = state2;

  state2 = cube(state2, 0.1);
  state2.scale = 1.0;
  
  for (int i=0; i<LEVELS; i++) {
    co.z -= OFFSET;
    co *= LEVEL_SCALE;
    co += 0.5;
    
    //co = fract(co)*2.0 - 1.0;
    
    //co = abs(co);
    co.x = smoothabs(co.x, 0.5); //SMOOTH_FAC);
    co.y = smoothabs(co.y, 0.5); //SMOOTH_FAC);
    co.z = smoothabs(co.z, 0.5); //SMOOTH_FAC);

    //co = co*co*(3.0 - 2.0*co);
    co = co*2.0 - 1.0;
    co *= 0.5;
    
    co.xy = rot2d(co.xy, level_rot1);
    co.zy = rot2d(co.zy, level_rot2);
  
    state3.co = co;
    state3 = sphere(state3, LEVEL_LIMIT);
    //state3.f /= level_scale*LEVEL_SCALE;
    state3.f /= level_scale;
    
    //state3.scale = state2.scale*0.5;
    state3.color = 1.0 - float(i) / float(LEVELS);

    
    level_rot1 += LEVEL_ROT1;
    level_rot2 += LEVEL_ROT2;
    level_scale *= LEVEL_SCALE;
    
    state2 = sunion(state2, state3);
  }
#endif
  
  //state2.f /= state2.scale;
  //state2 = isect(state2, sphere(state, 0.5)); 
  
  state2.co = state.co;
  state = state2;
}

bool rtrace(inout RenderState state) {
  state.scale = 1.0;
  state.t = 0.0;
  
  for (int i=0; i<STEPS; i++) {
    field(state);
    
    if (abs(state.f) < RLIMIT) {
      return true;
    }
    
    float fac = state.scale;//2.0 - abs(dot(state.dir, state.no));
    
    state.co += state.dir * state.f * EPS*fac;
    state.t += state.f * EPS*fac;
  }
  
  return false;
}

uniform sampler2D blueMask;
uniform float blueMaskDimen;

vec3 hash3d(float seed) {
  vec2 uv = fract(vUv * iRes / blueMaskDimen);
  uv.x += hash(T); 
  uv.y += hash(T + 0.23432); 
  
  //float fx = vUv.x*iRes.x*sqrt(2.0); //10814 114207
  //float fy = vUv.y*iRes.x*0.114207; //*.104166;
  //float f = fract(fx + fy + T);
  
  float f = texture(blueMask, uv)[0];
  
  const float steps = 9.0;
  seed += floor(f*steps)/steps;
  
  return vec3(hash(seed), hash(seed*1.1424+3.23423), hash(seed*1.32342-0.23432))*2.0 - 1.0;
}

vec3 calcNormal(RenderState state) {
  float f1 = state.f;
  vec3 co = state.co;
  const float df = 0.0001;
  vec3 no;

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
  
  return no;
}

#define LIGHTING_SHADOW 1
#define LIGHTING_AO 2
#define LIGHTING_GI 4

float pattern(float ix, float iy) {
  float f;
  
  vec2 uv = vec2(ix, iy)*iInvRes;
  uv = uv*2.0 - 1.0;
  uv.x *= aspect;
  //uv *= 2.0;
  
  uv.x += SLIDERS[6];
  uv.y += SLIDERS[7];
  uv *= SLIDERS[5];
  
  RenderState state;
  vec3 rp = vec3(0.0, DIST, -0.2); //origin
  vec3 rt = vec3(0.0, 0.0, 0.0); //target
  vec3 rd;
  
  rp.yz = rot2d(rp.yz, PITCH);
  rp.xy = rot2d(rp.xy, ROLL);
  
  float pixsize = 0.2; //max(iInvRes.x, iInvRes.y);
  
  rd = normalize(rt - rp);
  
  vec3 side = normalize(cross(rd, vec3(0.0, 0.0, 1.0)));
  vec3 up = normalize(cross(side, rd));
  
  vec3 planeco = rp;
  
  planeco += side * uv.x + up*uv.y + rd*FOV;
  
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
  l = sqrt(l)*1.5;
  
  vec3 co = state.co;
  vec3 no;
  
  float f1 = state.f;
  
  no = calcNormal(state);
  l = max(dot(no, lightNo), 0.0)*l;
  
#if LIGHTING & LIGHTING_SHADOW
{
  RenderState state2 = state;

  state2.co -= state2.dir*0.003;
  state2.dir = normalize(lightNo + hash3d(0.12423+T)*0.5);
  if (rtrace(state2)) {
    l = 0.0;
  }
}
#endif

#if LIGHTING & (LIGHTING_AO|LIGHTING_GI)
{
  float sum = 0.0;
  const int steps = 3;

  for (int i=0; i<3; i++) {
    RenderState state2 = state;

    state2.co -= state2.dir*0.003;
    state2.dir = normalize(hash3d(0.532423+float(i)*0.3+T));
    
    if (dot(state2.dir, no) < 0.0) {
      no = -no;
    }

    bool hit = rtrace(state2);
    
#if LIGHTING & LIGHTING_AO
    if (!hit) {
      sum += 1.0;
    } else {
      sum += min(state2.t*0.5, 1.0);
    }
#endif
    
#if LIGHTING & LIGHTING_GI
    RenderState state3 = state;

    state3.co -= state3.dir*0.003;
    state3.dir = normalize(lightNo + hash3d(0.42423+T)*0.5);
    
    if (!rtrace(state3)) {
      vec3 no2 = calcNormal(state);
      
      float f = dot(lightNo, no2);
      sum += f;
    }
#endif
  }
  
  sum /= float(steps);
  
  l = sum;
}

#endif

  state.co = co + no*0.01;
  field(state);
  
  l = clamp(l, 0.0, 1.0);
  
  return l;
  //return l*l*(3.0 - 2.0*l);
}
`

let default_sliders = [70, 1.0086, 0.20860501848141141, 0.6836952474556159, 1, 1, 0, 0, 2.297188368736352,
                       3.9658733928804786, 1.2325426537437414, 0.49248862576479524, 1, 0.001, 1, 0.4501880372834175];
default_sliders = [152.37224431195685, 1.0086, 0.20860501848141141, 0.6836952474556159, 1, 1, 0, 0, 8.914427341384965,
                   18.003225416500808, 2.8441258045923496, 1.7600876549476536, 0.21775237010364984,
                   0.004018407461037092, 10, 1.7317459596674998, 0.17536971222644349, 0.28000184668988803, 0, 0,
                   0.47596035168546613, 0.46141607216409053];

export class TraceFractalPattern extends Pattern {
  constructor() {
    super();

    this.lighting_mode = 0;

    this.renderTiles = false;
    this.samplesPerTile = 5;
    this.pixel_size = 0.7;
    this.no_gradient = true;
    this.fast_mode = true;

    this.sharpness = 0.33; //use different default sharpness
  }

  static patternDef() {
    let i = 0;

    let sliderdef = [
      {
        name : "steps",
        type : "int",
        range: [5, 955],
        value: 100,
        speed: 7.0,
        exp  : 1.5,
      }, //0
      {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true},  //1
      {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //2
      {name: "colorscale", value: 5.9, noReset: true},//3
      {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset: true}, //4
      {name: "scale", value: 1.0, range: [0.001, 1000000.0]}, //5
      "x",  //6
      "y",  //7
      {name: "pitch", value: 0.0}, //8
      {name: "roll", value: 0.0}, //9
      {name: "fov", value: 0.1, speed: 0.1}, //10
      {name: "dist", value: 5.0, speed: 1.0}, //11
      {name: "eps", value: 0.675, speed: 0.0025}, //12
      {name: "rlimit", value: 0.001, speed: 0.00025, exp: 1.0, range: [0.00001, 0.1]},//13
      {name: "levels", value: 1, range: [1, 20]},//14
      {name: "lvlScale", value: 1.5, range: [0.1, 5.0]},//15
      {name: "lvlLimit", value: 0.5, range: [0.01, 2.0]},//16
      {name: "lvlRot1", value: 0.0, range: [-15, 15.0]},//17
      {name: "lvlRot2", value: 0.0, range: [-15, 15.0]},//18
      {name: "lvlMode", value: 0, range: [0, 5]}, //19
      {name: "smoothFac", value: 0.1, range: [-1.0, 10.0]}, //20
      {name: "offset", value: 0.1, range: [-1.0, 10.0]}, //21
    ];

    for (let i = 0; i < sliderdef.length; i++) {
      if (i >= default_sliders.length) {
        break;
      }

      let sdef = sliderdef[i];

      if (typeof sdef === "string") {
        sdef = {name: sdef};
      }

      sdef.value = default_sliders[i];

      sliderdef[i] = sdef;
    }

    return {
      typeName     : "fractal_trace",
      uiName       : "Fractal Trace",
      flag         : PatternFlags.NEED_BLUEMASK,
      description  : "",
      icon         : -1,
      offsetSliders: {
        scale: 5,
        x    : 6,
        y    : 7,
      },
      presets      : FractalTracePresets,
      sliderDef    : sliderdef,
      shader,
      shaderPre    : ''
    }
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    let onchange = function () {
      this.dataref.drawGen++;
      window.redraw_viewport();
    }

    let redraw = window.redraw_viewport;

    st.flags("lighting_mode", "lighting_mode", LightingModes, "Lighting")
      .on('change', onchange);

    return st;
  }

  setup(ctx, gl, uniforms, defines) {
    let skey = (name) => {
      let i = 0;
      for (let sdef of this.constructor.patternDef().sliderDef) {
        if (sdef === name || (typeof sdef === "object" && sdef.name === name)) {
          return `SLIDERS[${i}]`;
        }

        i++;
      }

      throw new Error("bad key " + name);
    }

    let lvec = new Vector3([5, 6, 7]);
    let ln = new Vector3(lvec);
    ln.negate().normalize();

    uniforms.lightCo = util.list(lvec);
    uniforms.lightNo = util.list(ln);

    defines.LIGHTING = this.lighting_mode;

    defines.OFFSET = skey("offset");
    defines.SMOOTH_FAC = skey("smoothFac");

    defines.LEVEL_SCALE = skey("lvlScale");
    defines.LEVEL_LIMIT = skey("lvlLimit");
    defines.LEVELS = ~~this.sliders.levels;

    defines.LEVEL_ROT1 = skey("lvlRot1");
    defines.LEVEL_ROT2 = skey("lvlRot2");
    defines.LEVEL_MODE = ~~this.sliders.lvlMode;

    defines.PITCH = skey("pitch");
    defines.ROLL = skey("roll");
    defines.DIST = skey("dist");
    defines.EPS = skey("eps");
    defines.RLIMIT = skey("rlimit");
    defines.FOV = skey("fov");

    //defines.VALUE_OFFSET = "SLIDERS[13]";
    defines.GAIN = skey("gain");
    defines.COLOR_SHIFT = skey("color");
    defines.COLOR_SCALE = skey("colorscale");
    defines.BRIGHTNESS = skey("brightness");
    defines.STEPS = ~~this.sliders.steps;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    con.useIcons(false);

    con.prop("samplesPerTile");
    con.prop("renderTiles");
    con.prop("lighting_mode");
  }

  savePresetText(opt = {}) {
    opt.sharpness = opt.sharpness ?? this.sharpness;
    opt.filter_width = opt.filter_width ?? this.filter_width;
    opt.max_samples = opt.max_samples ?? this.max_samples;
    opt.lighting_mode = opt.lighting_mode ?? this.lighting_mode;

    opt = JSON.stringify(opt);

    let sliders = JSON.stringify(util.list(this.sliders));

    return `
add_preset(${sliders}, ${opt});
    `.trim();
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    defines.STEPS = ~~this.sliders[0];

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b) {
    super.copyTo(b);

    b.lighting_mode = this.lighting_mode;
  }
}

TraceFractalPattern.STRUCT = nstructjs.inherit(TraceFractalPattern, Pattern) + `
  renderTiles   : bool;
  lighting_mode : int;
}`;

Pattern.register(TraceFractalPattern);
