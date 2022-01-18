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

export const MoireModes = {
  ZERO  : 0,
  ONE   : 1,
  TWO   : 2,
  THREE : 3,
  FOUR  : 4,
  FIVE  : 5,
  SIX   : 6,
  SEVEN : 7
};

let namegen = 1;

export function add_preset(func, mode, sliders, options={}) {
  let pat = new MoireNewtonPattern();
  
  for (let i=0; i<sliders.length; i++) {
    if (i >= pat.sliders.length) {
      break;
    }
    
    pat.sliders[i] = sliders[i];
  }
  
  pat.func = func;
  pat.newton_mode = mode;
  
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

fdist_dx := df(fdist, x);
fdist_dy := df(fdist, y);

on fort;
fdiff2_dx;
fdiff2_dy;

fdist_dx;
fdist_dy;
off fort;

*/
const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];


#define M_PI 3.141592654

float ctent(float f) {
  //return fract(f+0.5);
  return cos(f*M_PI*2.0)*0.5 + 0.5;
  //f = tent(f);
  //f = f*f*(3.0 - 2.0*f);
  
  return f;
  
  //return 1.0 / (cos(f*M_PI*2.0)*0.5 + 0.5 + 1.333333);
  //return 1.0 - abs(fract(f)-0.5)*2.0;
  //return fract(f);
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
  float f = sqrt(dx1*dx1 + dy1*dy1 + dx2*dx2 + dy2*dy2 + dx3*dx3 + dy3*dy3) / sqrt(6.0);
#elif PATTERN == 2
  float f = pow(dx1*dy1*dx2*dy2*dx3*dy3, 1.0/6.0);
#elif PATTERN == 3
  float f = abs((dx1-dx2) + (dy1-dy2) + (dx2-dx3)  + (dy2-dy3))/3.0;
#elif PATTERN == 4
  float f = abs(abs(dx1-dx2) + abs(dy1-dy2) + abs(dx2-dx3)  + abs(dy2-dy3))/6.0;
#endif
  
#ifdef SQUARE_F
  return f*f;
#else
  return f;
#endif
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

#if 1
#if PATTERN == 0
    float dx = -0.523598775598*(sin(6.28318530718*costh1*scale1*x+
       6.28318530718*scale1*sinth1*y)*costh1*scale1-sin(6.28318530718
       *costh1*scale1*y-6.28318530718*scale1*sinth1*x)*scale1*sinth1+
       sin(6.28318530718*costh2*scale1*scale2*x+6.28318530718*scale1*
       scale2*sinth2*y)*costh2*scale1*scale2-sin(6.28318530718*costh2
       *scale1*scale2*y-6.28318530718*scale1*scale2*sinth2*x)*scale1*
       scale2*sinth2+sin(6.28318530718*x));
     
    float dy = -0.523598775598*((sin(6.28318530718*(costh1*y-sinth1*x)*
       scale1)*costh1+sin(6.28318530718*(costh2*x+sinth2*y)*scale1*
       scale2)*scale2*sinth2+sin(6.28318530718*(costh1*x+sinth1*y)*
       scale1)*sinth1)*scale1+sin(6.28318530718*costh2*scale1*scale2*
       y-6.28318530718*scale1*scale2*sinth2*x)*costh2*scale1*scale2+
       sin(6.28318530718*y));
    
    return vec2(dx, dy);
    
#elif PATTERN == 1
    float dx =1.28254983016*(cos(6.28318530718*(costh2*y-sinth2*x)*scale1
    *scale2)+1.0)*sin(6.28318530718*(costh2*y-sinth2*x)*scale1*
    scale2)*scale1*scale2*sinth2-1.28254983016*(cos(6.28318530718*
    x)+1.0)*sin(6.28318530718*x)-1.28254983016*(cos(6.28318530718*(
    costh1*x+sinth1*y)*scale1)+1.0)*sin(6.28318530718*(costh1*x+
    sinth1*y)*scale1)*costh1*scale1+(1.28254983016*(cos(
    6.28318530718*(costh1*y-sinth1*x)*scale1)+1.0)*sin(6.28318530718
    *(costh1*y-sinth1*x)*scale1)*sinth1-1.28254983016*(cos(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2)+1.0)*sin(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2)*costh2*scale2
    )*scale1;
     
    float dy =-1.28254983016*((cos(6.28318530718*(costh2*y-sinth2*x)*
    scale1*scale2)+1.0)*sin(6.28318530718*(costh2*y-sinth2*x)*scale1
    *scale2)*costh2*scale1*scale2+(cos(6.28318530718*y)+1.0)*sin(
    6.28318530718*y)+(cos(6.28318530718*(costh1*x+sinth1*y)*scale1
    )+1.0)*sin(6.28318530718*(costh1*x+sinth1*y)*scale1)*scale1*
    sinth1+((cos(6.28318530718*(costh1*y-sinth1*x)*scale1)+1.0)*sin(
    6.28318530718*(costh1*y-sinth1*x)*scale1)*costh1+(cos(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2)+1.0)*sin(
    6.28318530718*(costh2*x+sinth2*y)*scale1*scale2)*scale2*sinth2
    )*scale1);
    
    return vec2(dx, dy);
#elif PATTERN == 4
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
      
#if MODE == 7
      //dp = normalize(dp);
      
      if (dot(dp, dp) < 0.1) {
      //if (dot(p, p) > 4.0) {
      //if (abs(f) < 0.13) {
        sum = float(i) * 0.01;
        //sum *= abs(p.x+p.y)*0.5;
        //sum = length(uv - p);
        break;
      }
      //sum = length(uv - p);
#endif

      vec2 perp = vec2(-dp.y, dp.x);
      
      dp = mix(dp, perp, SLIDERS[9]);
      
      if (dot(dp, dp) > 0.0) {
#if MODE == 1 || MODE == 2 || MODE == 3
#if MODE == 2
        if (dp.x > 0.0) {
          dp.x = f / dp.x;
        }
        if (dp.y > 0.0) {
          dp.y = f / dp.y;
        }
#endif        
        mat2 mat = mat2(vec2(dp.x*dp.x, dp.x*dp.y), vec2(dp.x*dp.y, dp.y*dp.y));
        
        //mat = inverse(mat);
        
        vec2 dp2 = dp;
        
        for (int j=0; j<10; j++) {
          dp2 = normalize(dp2);
          dp2 = mat * dp2;
        }
        
        float l = length(dp2);
        if (l > 0.0) {
          dp2 /= l;
        }
        
        dp2 *= f;
        //dp2.xy = -vec2(-dp2.y, dp2.x);
        
#if MODE == 3
      dp = dp2;
      
#else
        dp = mix(dp, dp2, 0.5);
        dp *= f / dot(dp, dp);
#endif
#endif

#if MODE == 4
    if (dot(dp, dp) > 0.0) {
      dp /= dot(dp, dp);
    }
#endif

#if MODE == 5
    if (dot(dp, dp) > 0.0) {
      dp /= dot(dp, dp);
      dp *= f;
    }
#endif

#if MODE == 6
    if (dot(dp, dp) > 0.0) {
      dp /= dot(dp, dp);
      dp *= f;
      
      vec2 dp2 = dp - lastdp;
      dp += dp2*0.5;
      dp *= 0.5;
    }
#endif

        dp.x = pow(abs(dp.x), 1.0 + SLIDERS[13])*sign(dp.x);
        dp.y = pow(abs(dp.y), 1.0 + SLIDERS[13])*sign(dp.y);
        
        p += -dp*SLIDERS[12];
      }

#if MODE != 7
      sum += length(dp)/(1000.0*SLIDERS[8]);
#endif

      lastdp = dp;
    }
    
    return sum;
}

`

export class MoireNewtonPattern extends Pattern {
  constructor() {
    super();

    this.newton_mode = MoireModes.ONE;
    this.square_f = true;
    this.func = MoireFuncs.DIST;
    this.sharpness = 0.33; //use different default sharpness
  }
  
  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);
    
    con.prop("func");
    con.prop("newton_mode");
    con.prop("square_f");
  }
  
  static apiDefine(api) {
    let st = super.apiDefine(api);
    
    let onchange = function() {
      this.ctx.pattern.drawGen++;
      window.redraw_viewport();
    }
    
    st.bool("square_f", "square_f", "Square F")
    .on('change', onchange);
    
    st.enum("func", "func", MoireFuncs, "Func")
    .on("change", onchange);
    
    st.enum("newton_mode", "newton_mode", MoireModes, "Mode")
    .on("change", onchange);

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
          value: 15,
          speed: 7.0,
          exp  : 1.5,
        }, //0
        {name: "gain", value: 4.695, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset: true},  //1
        {name: "color", value: 0.72, range: [-50, 50], speed: 0.25, exp: 1.0, noReset: true}, //2
        {name: "scale", value: 4.75, range: [0.001, 1000000.0]}, //3
        "x",  //4
        "y",  //5
        {name: "colorscale", value: 46.79, noReset: true},//6
        {name: "brightness", value: 1.04, range: [0.001, 10.0], noReset: true}, //7
        {name: "hoff", value: 2.738, range: [0.0001, 10.0], speed: 0.05, exp : 1.5}, //8
        {name: "poff", value: 1.642, range: [-8.0, 8.0], speed: 0.1, exp: 1.0}, //9
        {name: "offset1", value: 2.2809, range: [-5.0, 25.0], speed: 0.1}, //10
        {name: "offset2", value: 0.8471, range: [-5.0, 25.0], speed: 0.1}, //11
        {name: "offset3", value: 0.62189, range: [-5.0, 25.0], speed: 0.5}, //12
        {name: "offset4", value : 0.0, range : [-15.0, 15.0], speed : 0.1}, //13
        ],
      shader
    }
  }

  savePresetText() {
    let sliders = JSON.stringify(this.sliders);
    
    return `add_preset(${this.func}, ${this.newton_mode}, ${sliders}, {sharpness : ${this.sharpness}});`
  }
  
  setup(ctx, gl, uniforms, defines) {
    if (this.square_f) {
      defines.SQUARE_F = true;
    } else {
      delete defines.SQUARE_F;
    }
    
    defines.MODE = this.newton_mode;
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
    
    b.newton_mode = this.newton_mode;
    b.func = this.func;
    b.square_f = this.square_f;
  }
}

MoireNewtonPattern.STRUCT = nstructjs.inherit(MoireNewtonPattern, Pattern) + `
  func        : int;
  newton_mode : int;
  square_f    : bool;
}`;

Pattern.register(MoireNewtonPattern);
