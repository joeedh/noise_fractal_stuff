import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const MoireNewtonPresets = [];

export const MoireFuncs = {
  SUM : 0, DIST : 1, MUL1 : 2, DIFF1 : 3, DIFF2: 4 
};

let namegen = 1;

export function add_preset(func, sliders, options={}) {
  let pat = new MoireNewtonPattern();
  
  for (let i=0; i<sliders.length; i++) {
    if (i >= pat.sliders.length) {
      break;
    }
    
    pat.sliders[i] = sliders[i];
  }
  
  pat.func = func;
  
  for (let k in options) {
    pat[k] = options[k];
  }
  
  let name = "Builtin " + (namegen++);
  let preset = savePreset(pat, name, 'Builtin');
  MoireNewtonPresets.push(preset);
  return preset;
}

/*
on factor;
off period;
on rounded;

procedure ctent(f);
  cos(f*pi*2.0)*0.5 + 0.5;

let cos(th1) = costh1;
let sin(th1) = sinth1;
let cos(th2) = costh2;
let sin(th2) = sinth2;
let cos(th3) = costh3;
let sin(th3) = sinth3;

comment: avoid ** operator for glsl: scale2 := scale1;

dx1 := ctent(x);
dy1 := ctent(y);

dx2 := ctent(cos(th1)*x*scale1 + sin(th1)*y*scale1);
dy2 := ctent(cos(th1)*y*scale1 - sin(th1)*x*scale1);

dx3 := ctent(cos(th2)*x*scale1*scale2 + sin(th2)*y*scale2*scale1);
dy3 := ctent(cos(th2)*y*scale1*scale2 - sin(th2)*x*scale2*scale1);

fsum := (dx1+dy1+dx2+dy2+dx3+dy3)/6.0;

fdist := (dx1*dx1 + dy1*dy1 + dx2*dx2 + dy2*dy2 + dx3*dx3 + dy3*dy3) / sqrt(6.0);

fmul := pow(dx1*dy1*dx2*dy2*dx3*dy3, 1.0/6.0);

fdiff1 := abs((dx1-dx2) + (dy1-dy2) + (dx2-dx3)  + (dy2-dy3))/3.0;

fdiff2 := abs(abs(dx1-dx2) + abs(dy1-dy2) + abs(dx2-dx3) + abs(dy2-dy3))/6.0;

fdiff2_dx := df(fdiff2, x);
fdiff2_dy := df(fdiff2, y);

on fort;
fdiff2_dx;
fdiff2_dy;
off fort;

*/
const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];


#define M_PI 3.141592654

float ctent(float f) {
  return cos(f*M_PI*2.0)*0.5 + 0.5;
}

float fsample(vec2 p) {
  float th = SLIDERS[10];
  
  float dx1 = ctent(p.x);
  float dy1 = ctent(p.y);
  
  p *= SLIDERS[11];
  
  float dx2 = ctent(cos(th)*p.x + sin(th)*p.y);
  float dy2 = ctent(cos(th)*p.y - sin(th)*p.x);
  
  th *= 2.0;
  
  p *= SLIDERS[11];
  
  float dx3 = ctent(cos(th)*p.x + sin(th)*p.y);
  float dy3 = ctent(cos(th)*p.y - sin(th)*p.x);
  
  
#if PATTERN == 0
  float f = (dx1+dy1+dx2+dy2+dx3+dy3)/6.0;
#elif PATTERN == 1
  float f = (dx1*dx1 + dy1*dy1 + dx2*dx2 + dy2*dy2 + dx3*dx3 + dy3*dy3) / sqrt(6.0);
#elif PATTERN == 2
  float f = pow(dx1*dy1*dx2*dy2*dx3*dy3, 1.0/6.0);
#elif PATTERN == 3
  float f = abs((dx1-dx2) + (dy1-dy2) + (dx2-dx3)  + (dy2-dy3))/3.0;
#elif PATTERN == 4
  float f = abs(abs(dx1-dx2) + abs(dy1-dy2) + abs(dx2-dx3)  + abs(dy2-dy3))/6.0;
#endif
  

  return f*f;
}

const float df = 0.00001;
const float df_inv = 1.0 / df;

vec2 dv_sample(vec2 p) {
  float scale1 = SLIDERS[11];
  float scale2 = SLIDERS[11];
  float th = SLIDERS[10];
  
  float costh1 = cos(th);
  float sinth1 = sin(th);

  float costh2 = cos(th*2.0);
  float sinth2 = sin(th*2.0);
  
  float x = p.x, y = p.y;
  
  const float eps = 0.0000001;
  
#if PATTERN == 4
   float ans5=-6.28318530718*(cos(6.28318530718*costh1*scale1*y-
    6.28318530718*scale1*sinth1*x)-cos(6.28318530718*costh2*scale1
    *scale2*y-6.28318530718*scale1*scale2*sinth2*x))*(cos(
    6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*y)
    )*(sin(6.28318530718*(costh1*x+sinth1*y)*scale1)*costh1*scale1
    -sin(6.28318530718*x))*abs(0.5*(cos(6.28318530718*costh1*
    scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x)));
      float ans4=6.28318530718*((cos(6.28318530718*(costh1*y-sinth1*x)*
    scale1)-cos(6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*
    abs(0.5*(cos(6.28318530718*costh1*scale1*y-6.28318530718*
    scale1*sinth1*x)-cos(6.28318530718*y)))*sin(6.28318530718*(
    costh1*y-sinth1*x)*scale1)*sinth1+(cos(6.28318530718*(costh1*y
    -sinth1*x)*scale1)-cos(6.28318530718*y))*(sin(6.28318530718*(
    costh1*y-sinth1*x)*scale1)*sinth1-sin(6.28318530718*(costh2*y-
    sinth2*x)*scale1*scale2)*scale2*sinth2)*abs(0.5*(cos(
    6.28318530718*costh1*scale1*y-6.28318530718*scale1*sinth1*x)-
    cos(6.28318530718*costh2*scale1*scale2*y-6.28318530718*scale1*
    scale2*sinth2*x))))*(cos(6.28318530718*(costh1*x+sinth1*y)*
    scale1)-cos(6.28318530718*x))*scale1+ans5;
      float ans6=(cos(6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2));
      float ans3=ans4*ans6;
      float ans7=-6.28318530718*(cos(6.28318530718*costh1*scale1*x+
    6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x))*(cos(
    6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*(
    costh2*y-sinth2*x)*scale1*scale2))*(cos(6.28318530718*(costh1*
    y-sinth1*x)*scale1)-cos(6.28318530718*y))*(sin(6.28318530718*(
    costh1*x+sinth1*y)*scale1)*costh1-sin(6.28318530718*(costh2*x+
    sinth2*y)*scale1*scale2)*costh2*scale2)*abs(0.5*(cos(
    6.28318530718*costh1*scale1*x+6.28318530718*scale1*sinth1*y)-
    cos(6.28318530718*costh2*scale1*scale2*x+6.28318530718*scale1*
    scale2*sinth2*y)))*scale1;
      float ans2=ans3+ans7;
      float ans8=abs(abs(0.5*(cos(6.28318530718*costh1*scale1*y-
    6.28318530718*scale1*sinth1*x)-cos(6.28318530718*costh2*scale1
    *scale2*y-6.28318530718*scale1*scale2*sinth2*x)))+abs(0.5*(cos
    (6.28318530718*costh1*scale1*y-6.28318530718*scale1*sinth1*x)-
    cos(6.28318530718*y)))+abs(0.5*(cos(6.28318530718*costh1*
    scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x)))
    +abs(0.5*(cos(6.28318530718*costh1*scale1*x+6.28318530718*
    scale1*sinth1*y)-cos(6.28318530718*costh2*scale1*scale2*x+
    6.28318530718*scale1*scale2*sinth2*y))));
      float ans1=0.166666666667*ans2*ans8;
      float dx=ans1/(eps+(abs(0.5*(cos(6.28318530718*costh1*scale1*y-
    6.28318530718*scale1*sinth1*x)-cos(6.28318530718*costh2*scale1
    *scale2*y-6.28318530718*scale1*scale2*sinth2*x)))+abs(0.5*(cos
    (6.28318530718*costh1*scale1*y-6.28318530718*scale1*sinth1*x)-
    cos(6.28318530718*y)))+abs(0.5*(cos(6.28318530718*costh1*
    scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x)))
    +abs(0.5*(cos(6.28318530718*costh1*scale1*x+6.28318530718*
    scale1*sinth1*y)-cos(6.28318530718*costh2*scale1*scale2*x+
    6.28318530718*scale1*scale2*sinth2*y))))*(cos(6.28318530718*
    costh1*scale1*x+6.28318530718*scale1*sinth1*y)-cos(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2))*(cos(
    6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(6.28318530718*x)
    )*(cos(6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(
    6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*(cos(
    6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*y)
    ));
    
    
   ans6=(cos(6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(
  6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*(cos(
  6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*y)
  )*abs(0.5*(cos(6.28318530718*costh1*scale1*x+6.28318530718*
  scale1*sinth1*y)-cos(6.28318530718*x)))*sin(6.28318530718*(
  costh1*x+sinth1*y)*scale1)*scale1*sinth1;
    ans5=((cos(6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(
  6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*(sin(
  6.28318530718*(costh1*y-sinth1*x)*scale1)*costh1*scale1-sin(
  6.28318530718*y))*abs(0.5*(cos(6.28318530718*costh1*scale1*y-
  6.28318530718*scale1*sinth1*x)-cos(6.28318530718*y)))+(cos(
  6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*y)
  )*(sin(6.28318530718*(costh1*y-sinth1*x)*scale1)*costh1-sin(
  6.28318530718*(costh2*y-sinth2*x)*scale1*scale2)*costh2*scale2
  )*abs(0.5*(cos(6.28318530718*costh1*scale1*y-6.28318530718*
  scale1*sinth1*x)-cos(6.28318530718*costh2*scale1*scale2*y-
  6.28318530718*scale1*scale2*sinth2*x)))*scale1)*(cos(
  6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(6.28318530718*x)
  )+ans6;
    ans7=(cos(6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(
  6.28318530718*(costh2*x+sinth2*y)*scale1*scale2));
    ans4=ans5*ans7;
    ans8=(cos(6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(
  6.28318530718*x))*(cos(6.28318530718*(costh1*y-sinth1*x)*
  scale1)-cos(6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*
  (cos(6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(
  6.28318530718*y))*(sin(6.28318530718*(costh1*x+sinth1*y)*
  scale1)*sinth1-sin(6.28318530718*(costh2*x+sinth2*y)*scale1*
  scale2)*scale2*sinth2)*abs(0.5*(cos(6.28318530718*costh1*
  scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*
  costh2*scale1*scale2*x+6.28318530718*scale1*scale2*sinth2*y)))
  *scale1;
    ans3=ans4+ans8;
    float ans9=abs(abs(0.5*(cos(6.28318530718*costh1*scale1*y-
  6.28318530718*scale1*sinth1*x)-cos(6.28318530718*costh2*scale1
  *scale2*y-6.28318530718*scale1*scale2*sinth2*x)))+abs(0.5*(cos
  (6.28318530718*costh1*scale1*y-6.28318530718*scale1*sinth1*x)-
  cos(6.28318530718*y)))+abs(0.5*(cos(6.28318530718*costh1*
  scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x)))
  +abs(0.5*(cos(6.28318530718*costh1*scale1*x+6.28318530718*
  scale1*sinth1*y)-cos(6.28318530718*costh2*scale1*scale2*x+
  6.28318530718*scale1*scale2*sinth2*y))));
    ans2=1.0471975512*ans3*ans9;
    ans1=-ans2;
    float dy=ans1/(eps+(abs(0.5*(cos(6.28318530718*costh1*scale1*y-
  6.28318530718*scale1*sinth1*x)-cos(6.28318530718*costh2*scale1
  *scale2*y-6.28318530718*scale1*scale2*sinth2*x)))+abs(0.5*(cos
  (6.28318530718*costh1*scale1*y-6.28318530718*scale1*sinth1*x)-
  cos(6.28318530718*y)))+abs(0.5*(cos(6.28318530718*costh1*
  scale1*x+6.28318530718*scale1*sinth1*y)-cos(6.28318530718*x)))
  +abs(0.5*(cos(6.28318530718*costh1*scale1*x+6.28318530718*
  scale1*sinth1*y)-cos(6.28318530718*costh2*scale1*scale2*x+
  6.28318530718*scale1*scale2*sinth2*y))))*(cos(6.28318530718*
  costh1*scale1*x+6.28318530718*scale1*sinth1*y)-cos(
  6.28318530718*(costh2*x+sinth2*y)*scale1*scale2))*(cos(
  6.28318530718*(costh1*x+sinth1*y)*scale1)-cos(6.28318530718*x)
  )*(cos(6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(
  6.28318530718*(costh2*y-sinth2*x)*scale1*scale2))*(cos(
  6.28318530718*(costh1*y-sinth1*x)*scale1)-cos(6.28318530718*y)
  ));
    return vec2(dx, dy)*0.5; //hack, why do I have to scale by 0.5?
#else
      
      float f = fsample(p);
      float dx = fsample(p + vec2(df, 0.0));
      float dy = fsample(p + vec2(0.0, df));
      
      vec2 dp = vec2(f - dx, f - dy) * df_inv;
      
      return dp;
#endif
}
float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;
    
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[4];
    uv.y += SLIDERS[5];

    uv *= SLIDERS[3];

    //return fsample(uv);
    
    vec2 p = uv;
    float sum = 0.0;
    vec2 lastdp;
    
    for (int i=0; i<STEPS; i++) {
      float f = fsample(p);
      vec2 dp = dv_sample(p);
      
      vec2 perp = vec2(-dp.y, dp.x);
      
      dp = mix(dp, perp, SLIDERS[9]);
      
      p += -dp*0.1;
      sum += length(dp)/(1000.0*SLIDERS[8]);
      
      lastdp = dp;
    }
    
    return sum;
}

`

export class MoireNewtonPattern extends Pattern {
  constructor() {
    super();

    this.func = MoireFuncs.DIST;
    this.sharpness = 0.33; //use different default sharpness
  }
  
  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);
    
    con.prop("func");
  }
  
  static apiDefine(api) {
    let st = super.apiDefine(api);
    
    st.enum("func", "func", MoireFuncs, "Func")
    .on("change", function() {
      this.ctx.pattern.drawGen++;
      //window.redraw_viewport();
    });
    
    return st;
  }
  
  static patternDef() {
    return {
      typeName     : "moire_newton",
      uiName       : "Moire Newton",
      flag         : 0,
      description  : "modified newton fractal",
      icon         : -1,
      offsetSliders: {
        scale: 3,
        x    : 4,
        y    : 5,
      },
      presets      : MoireNewtonPresets,
      sliderDef    : [
        {
          name : "steps", integer: true,
          range: [5, 955],
          value: 100,
          speed: 7.0,
          exp  : 1.5,
        }, //0
        {name: "gain", value: 0.19, range: [0.001, 1000], speed: 4.0, exp: 2.0},  //1
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0}, //2
        {name: "scale", value: 4.75, range: [0.001, 1000000.0]}, //3
        "x",  //4
        "y",  //5
        {name: "colorscale", value: 1.0},//6
        {name: "brightness", value: 1.0, range: [0.001, 10.0]}, //7
        {name: "hoff", value: 0.1, range: [0.0001, 10.0]}, //8
        {name: "poff", value: 1.0, range: [-8.0, 8.0], speed: 0.1, exp: 1.0}, //9
        {name: "offset1", value: 0.54, range: [-5.0, 25.0], speed: 1.0}, //10
        {name: "offset2", value: 0.54, range: [-5.0, 25.0], speed: 1.0}, //11
        {name: "offset3", value: 0.54, range: [-5.0, 25.0], speed: 1.0}, //12
        ],
      shader
    }
  }

  setup(ctx, gl, uniforms, defines) {
    defines.GAIN = "SLIDERS[1]";
    defines.COLOR_SHIFT = "SLIDERS[2]";
    defines.PATTERN = this.func;
    defines.COLOR_SCALE = "SLIDERS[6]";
    defines.BRIGHTNESS = "SLIDERS[7]";
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    defines.STEPS = ~~this.sliders[0];

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b) {
    super.copyTo(b);
    
    b.func = this.func;
  }
}

MoireNewtonPattern.STRUCT = nstructjs.inherit(MoireNewtonPattern, Pattern) + `
  func : int;
}`;

Pattern.register(MoireNewtonPattern);
