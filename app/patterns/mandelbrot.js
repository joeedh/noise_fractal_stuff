import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern, PatternFlags} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';
import {ShaderProgram} from '../webgl/webgl.js';
import {taskManager} from '../core/task.js';
import {buildShader, Shaders} from '../pattern/pattern_shaders.js';

let nameBase = 1;

export const MandelbrotPresets = [];

export function add_preset(orbit_mode, orbit_seed, sliders, options = {}, name = undefined) {
  let pat = new MandelbrotPattern();

  pat.orbit_seed = orbit_seed;
  pat.orbit_mode = orbit_mode;
  pat.orbit_time_step = 1;

  for (let k in options) {
    pat[k] = options[k];
  }

  for (let i = 0; i < sliders.length; i++) {
    if (i >= pat.sliders.length) {
      break;
    }

    pat.sliders[i] = sliders[i];
  }

  if (!name) {
    name = "Builtin " + nameBase;
    nameBase++;
  }

  let preset = savePreset(pat, name, "Builtin");

  MandelbrotPresets.push(preset);
}

let presetCountBase = 1;

/*

on factor;
off period;

procedure bez(a, b);
  a + (b - a)*s;
  
lin := bez(k1, k2);
quad := bez(lin, sub(k2=k3, k1=k2, lin));
cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));
quart := bez(quad, sub(k4=k5, k3=k4, k2=k3, k1=k2, cubic));
quint := bez(quad, sub(k5=k6, k4=k5, k3=k4, k2=k3, k1=k2, quart));

ax4 := 0.0;
ay4 := 0.0;
bx1 := 0.0;
by1 := 0.0;

px := sub(k1=x1, k2=x2, k3=x3, k4=x4, cubic);
py := sub(k1=y1, k2=y2, k3=y3, k4=y4, cubic);

dx1 := df(px, s);
dy1 := df(py, s);
dx2 := df(px, s, 2);
dy2 := df(py, s, 2);

fk := (dx1*dy2 - dy1*dx2) / ((dx1*dx1 + dy1*dy1)**(3.0/2.0));

fk1 := sub(x1=ax1, x2=ax2, x3=ax3, x4=ax4, 
           y1=ay1, y2=ay2, y3=ay3, y4=ay4, fk);
fk2 := sub(x1=bx1, x2=bx2, x3=bx3, x4=bx4, 
           y1=by1, y2=by2, y3=by3, y4=by4, fk);

adx1 := sub(x1=ax1, x2=ax2, x3=ax3, x4=ax4, 
           y1=ay1, y2=ay2, y3=ay3, y4=ay4, dx1);
ady1 := sub(x1=ax1, x2=ax2, x3=ax3, x4=ax4, 
           y1=ay1, y2=ay2, y3=ay3, y4=ay4, dy1);
bdx1 := sub(x1=bx1, x2=bx2, x3=bx3, x4=bx4, 
           y1=by1, y2=by2, y3=by3, y4=by4, dx1);
bdy1 := sub(x1=bx1, x2=bx2, x3=bx3, x4=bx4, 
           y1=by1, y2=by2, y3=by3, y4=by4, dy1);

f1 := sub(s=1.0, fk1) - sub(s=0.0, fk2);
f2 := sub(s=1.0, df(fk1, s)) - sub(s=0.0, df(fk2, s));
f3 := sub(s=1.0, df(fk1, s, 2)) - sub(s=0.0, df(fk2, s, 2));
f4 := ady1/adx1 - bdy1/bdx1;

comment: solve({f1, f2, f3, f4}, {ax3, ay3, bx2, by2});

fk  := k1 + (k2 - k1)*s;
fth := int(fk, s);

f1 := ady1/adx1 - bdy1/bdx1;

x2 := x1 + dvx1*t1;
y2 := y1 + dvy1*t1;

x3 := x4 - dvx2*t2;
y3 := y4 - dvy2*t2;

f1 := sub(s=0, (dx2*dx2 + dy2*dy2)**1.0) - goal1;
f2 := sub(s=1, (dx2*dx2 + dy2*dy2)**1.0) - goal2;

jacob := mat(
  (df(f1, t1), df(f1, t2)),
  (df(f2, t1), df(f2, t2))
);

ff := solve({f1, f2}, {t1, t2});

comment: ff := solve(f2, t2); 

on fort;
part(ff, 1);
part(ff, 2);
off fort;
*/

/*

on factor;
off period;

procedure bez(a, b);
  a + (b - a)*s;
  
lin := bez(k1, k2);
quad := bez(lin, sub(k2=k3, k1=k2, lin));
cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));
quart := bez(quad, sub(k4=k5, k3=k4, k2=k3, k1=k2, cubic));
quint := bez(quad, sub(k5=k6, k4=k5, k3=k4, k2=k3, k1=k2, quart));


f1 := sub(s=0, quint) - x1;
f2 := sub(s=1, quint) - x4;
f3 := sub(s=0, df(quint, s)) - dx1;
f4 := sub(s=1, df(quint, s)) - dx4;
f5 := sub(s=0, df(quint, s, 2)) - d2x1;
f6 := sub(s=1, df(quint, s, 2)) - d2x4;

ff := solve({f1, f2, f3, f4, f5, f6}, {k1, k2, k3, k4, k5, k6});

fa := part(ff, 1, 1);
fb := part(ff, 1, 2);
fc := part(ff, 1, 3);
fd := part(ff, 1, 4);
fe := part(ff, 1, 5);
ff := part(ff, 1, 6);

*/
export const OrbitFinalShader = {
  vertex    : `
uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float aspect;
uniform float ORBIT_T;
uniform float filterWidth;

attribute vec2 co;
varying vec2 vCo;

void main() {
  vCo = co;
  gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
}
`,
  fragment  : `#

uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float aspect;
uniform float ORBIT_T;
uniform float filterWidth;
uniform sampler2D rgba;
uniform sampler2D inRgba;
uniform float enableAccum;
uniform float noDecay;

varying vec2 vCo;

void main() {
  vec4 c1 = texture(rgba, vCo);
  vec4 c2 = texture(inRgba, vCo);
  
  if (enableAccum != 0.0) {
    if (noDecay == 0.0) {

    float decay = SLIDERS[18];
      decay = 1.0 - decay*decay*decay;
          
      c1 *= decay;
      c1.rgb *= decay;
    }

    c1.rgb += c2.rgb;
    c1.a += 1.0;
    
    gl_FragColor = c1;
  } else {
    gl_FragColor = vec4(c2.rgb, 1.0);
  } 
}
`,
  attributes: ["co"],
  uniforms  : {}
};

export const OrbitShader = {
  vertex    : `
uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float aspect;
uniform float ORBIT_T;
uniform float filterWidth;
uniform float expandFrame;

attribute vec3 co;

varying vec2 vCo;
varying vec2 vUv;
varying float vTime;

float hash(float f) {
  //f = fract(f*43.342342 + (fract(T)-0.5)*5.0) + abs(f);
  f = fract(1.0 / (0.0001 + f*0.0001) + T);
  
  return f;
}

float hash2(vec2 p) {
  p += vec2(T, T)*100.0;
  float f = fract(p.x*sqrt(3.0)) + fract(p.y*sqrt(5.0));
  
  return hash(f);
}

vec2 hash2_p(vec2 p) {
  return vec2(hash2(p)-0.5, hash2(p+vec2(fract(T), fract(T))));
}


vec2 cmul(vec2 a, vec2 b) {
    return vec2(
        a[0]*b[0] - a[1]*b[1],
        a[0]*b[1] + b[0]*a[1]
    );
}

vec2 calcdv(vec2 p, vec2 uv) {
  return cmul(p, vec2(2.0, 2.0));
  return vec2(
    -2.0*p.y,
    2.0*p.x
  );
}



vec2 solve(float fsteps, vec2 uv2, out vec2 dv) {
  vec2 p = uv2;
  
  dv = vec2(0.0, 0.0);
  vec2 lastdv = calcdv(uv2, uv2);
  vec2 lastdv2 = lastdv;
  
  for (int i=0; i<STEPS; i++) {
    if (float(i) > fsteps+0.0001) {
      break;
    }
    
    //p = cmul(p, p) + uv2;
    vec2 p2;
    
    /*
    procedure xmul(x, y);
      x*x - y*y + u;
    procedure ymul(x, y);
      2.0*x*y + v;
    
    dx := xmul(x, y);
    dy := ymul(x, y);
    
    dx2 := xmul(dx, dy);
    dy2 := ymul(dx, dy);
    
    dvx := df(dx2, y);
    dvy := df(dx2, x);
    
    */
    //p2.x = p.x*p.x - p.y*p.y + uv2.x;
    //p2.y = 2.0*p.x*p.y + uv2.y;
    
    p2 = cmul(p, p) + uv2;

    //dv = calcdv(p, uv2) * lastdv;
    dv = cmul(lastdv, calcdv(p, uv2));
    
    p = p2;        
    lastdv2 = lastdv;
    lastdv = dv;
  }
  
  vec2 p2 = p;
  
  for (int i=0;i<OFFSET2; i++) {
    p2 = cmul(p2, p2) + uv2;    
    dv = cmul(calcdv(p2, uv2), lastdv);
    lastdv2 = lastdv;
    lastdv = dv;
  }
  
  dv = lastdv2;
  //dv = vec2(-dv.y, dv.x);
  dv *= 0.25;
  //dv = normalize(dv)*0.05;
  
  return p;
}

float cubic(float a, float b, float c, float d, float s) {
  float q1 = a + (b - a) * s;
  float q2 = b + (c - b) * s;
  float q3 = c + (d - c) * s;
  
  float f1 = q1 + (q2 - q1) * s;
  float f2 = q2 + (q3 - q2) * s;
  
  return f1 + (f2 - f1) * s; 
}

void main() {
  gl_PointSize = SLIDERS[13]; // max(iRes.x, iRes.y);
  
  float time = co[2]*SLIDERS[17]*0.01 + ORBIT_T;
  vTime = time;
  
  float fsteps = time;
  float s = fract(fsteps);
  fsteps = floor(fsteps);
  
  vec2 uv2 = co.xy;
  uv2 = uv2*2.0 - 1.0;
  uv2.x *= aspect;
  
  uv2 *= expandFrame;
  
  uv2 = (uv2 + vec2(SLIDERS[7], SLIDERS[8])) * SLIDERS[6];
  vUv = uv2;
  
  vec2 dv1, dv2, dv3, none;
  
  vec2 pn1 = solve(fsteps-2.0, uv2, none);

  vec2 p1 = solve(fsteps-1.0, uv2, none);
  vec2 p0 = solve(fsteps, uv2, dv1);
  
  vec2 p3 = solve(fsteps+1.0, uv2, dv2);
  vec2 p2 = solve(fsteps+2.0, uv2, dv3);
  
  vec2 p4 = solve(fsteps+3.0, uv2, none);
  
  float ln1 = length(p1 - pn1);
  float l4 = length(p4 - p2);
  
  vec2 d1 = -(p1 - pn1);
  vec2 d2 = (p4 - p2);
  
  p1 = (p0 - p1) + (p3 - p0);
  p2 = (p3 - p2) + (p0 - p3);
  
  p1 *= 0.5;
  p2 *= 0.5;
  
  /*
  p1 += d1*0.25;
  p2 += d2*0.25;
  p1 /= 2.25;
  p2 /= 2.25;
  //*/
  
  float l1 = length(p1), l3 = length(p2);
  float l2 = length(p0 - p3);
  
  l1 = l1*0.5 + ln1*0.5;
  l3 = l3*0.5 + l4*0.5;
  
  //l1 += (l2 - l1)*0.5;
  //l3 += (l2 - l3)*0.5;
  
  //p1 += normalize(p0)*l1;
  //p2 += normalize(p3)*l3;
#if 0
  p1 = normalize(p1)*l1;
  p2 = normalize(p2)*l3;
  
  //dv1 = dv2;
  //dv2 = dv3;
  
  p1 = dv1;
  p2 = -dv2;
  
  dv1 = normalize(dv1);
  dv2 = normalize(dv2);
  vec2 addp = normalize(dv1 + (dv2 - dv1)*s);
#endif 
 
  p1 = p0 + p1 / 3.0;
  p2 = p3 + p2 / 3.0;
  
  vec2 p = p0 + (p3 - p0)*s;
  
  //p1 = p0;
  //p2 = p3;
#ifdef CUBIC  
  p.x = cubic(p0.x, p1.x, p2.x, p3.x, s);
  p.y = cubic(p0.y, p1.y, p2.y, p3.y, s);
#endif 

  //p += addp*0.2*SLIDERS[1]*(sin(s*55.0)*0.5+0.5);//*(sin(T*100.0)*0.5+0.5);
  
  p /= SLIDERS[6];
  p.x -= SLIDERS[7];
  p.y -= SLIDERS[8];
  p.x /= aspect;
  
  vec2 dp = (hash2_p(co.xy) - 0.5) * iInvRes.xy * filterWidth;
  p += dp;
  
  gl_Position = vec4(p, 0.0, 1.0);
  vCo = p.xy;
}
`,
  fragment  : `

uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float alpha;

varying vec2 vCo;
varying vec2 vUv;
varying float vTime;

float tent(float f) {
  return 1.0 - abs(fract(f)-0.5)*2.0;
}

void main() {
  float f = 1.0 - SLIDERS[15];
  
  vec2 p = gl_FragCoord.xy*iInvRes.xy;
  p = p*2.0 - 1.0;
  
  vec2 vec = abs(p - vCo) * iRes.xy / SLIDERS[13];
  float t = 1.0 - length(vec);
  
  if (t < 0.0) {
    discard;
  }
  
  //t = t > 0.1 ? 1.0 : t/0.1;
#if 0
  float decay = SLIDERS[18];
  f = tent(f + vTime*10.0*decay);
#endif

  gl_FragColor = vec4(f, f, f, alpha);
}
`,
  attributes: ['co'],
  uniforms  : {}
};

const shader = `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;
//uniform float SLIDERS[MAX_SLIDERS];

vec2 cmul(vec2 a, vec2 b) {
    return vec2(
        a[0]*b[0] - a[1]*b[1],
        a[0]*b[1] + b[0]*a[1]
    );
}

#if 0
#ifdef SHOW_DV
float pattern(float ix, float iy, out vec2 dv) {
#else
float pattern(float ix, float iy) {
#endif
    vec2 uv = vec2(ix, iy)/iRes;
    
#ifndef SHOW_DV
    vec2 dv;
#endif

#ifdef BLANK
    return SLIDERS[15];
#endif

    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[7];
    uv.y += SLIDERS[8];

    uv *= SLIDERS[6];
    
    vec2 p = uv;
    float f = 0.0;
    
    dv = cmul(p, vec2(2.0, 0.0));
    
    for (int i=0; i<STEPS; i++) {
      vec2 dp = p;
      
      p = cmul(p, p) + uv;
            
      dv = cmul(p, vec2(2.0, 0.0)) * dv;

      dp = p - dp;
      
      //p += vec2(-1.0/dp.y, 1.0/dp.x)*SLIDERS[11]*0.0001;
      p += vec2(-dp.y, dp.x)*SLIDERS[11]*length(dp)*0.01;
      
      if (dot(p, p) > 1000.0) {
        //f = log(dot(p, p))*150.0;
        vec2 dp2 = (cmul(p, p) + uv) - p;
        
#if 1
        float scale = 5.0*200.0; 
        const float powfac = 0.18;
        float step = SLIDERS[10]*0.02;
        const float postscale = 0.18;
        
#else
        float scale = SLIDERS[1]*200.0;
        float powfac = SLIDERS[9];
        float step = SLIDERS[10]*0.02;
        float postscale = SLIDERS[11];
#endif
        
        float f2 = scale * abs(length(dp2) / length(dp));
        f2 = pow(f2, powfac);
        f2 = float(i)*step - f2*step*postscale;
        f2 = abs(f2);
        
        if (f2 != 0.0) {
          //f2 = pow(f2, 0.25);
          f2 = 1.0-exp(-(f2 + 1.0));
        }
        
        return tent(f2);
        break;
      }
      
      f += length(dp)*0.005;
    }
    
    f = fract(f);
    return f;
}
#endif

#ifndef M_PI
#define M_PI 3.14159265453
#endif

vec2 cexpn(vec2 z) {
  if (z.y == 0.0) {
    return vec2(exp(z.x), 0.0);
  }
  
  float f = exp(z.x);
  return f * vec2(cos(z.y+SLIDERS[22]), sin(z.y+SLIDERS[22]));
}

vec2 cexp(vec2 x, vec2 b) {
  //log
  vec2 ln = vec2(
    log(length(x)),
    atan(x.y, x.x)
  );
  
  //ln = ln.x * vec2(cos(ln.y), sin(ln.y));
  
  return cexpn(cmul(b, ln));
  
  vec2 exp = cmul(b, ln);
  exp = vec2(
    length(exp),
    atan(exp.y, exp.x)
  );
  
  return vec2(exp.x*cos(exp.y), exp.x*sin(exp.y));
}
 


#ifdef SHOW_DV
float pattern(float ix, float iy, out vec2 dv) {
#else
float pattern(float ix, float iy) {
#endif
    vec2 uv = vec2(ix, iy)/iRes;
    
#ifndef SHOW_DV
    vec2 dv;
#endif
    
    float limit = 46.34;
    
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[7];
    uv.y += SLIDERS[8];

    uv *= SLIDERS[6];
    
    vec2 p = uv;
    dv = cmul(p, vec2(2.0, 0.0));

//#define TREE
#ifdef TREE
    dv = cmul(vec2(-p.y, p.x), vec2(2.0, 0.0));
#endif
    
    for (int i=0; i<STEPS; i++) {
#ifdef TREE
      dv = cmul(vec2(-p.y, p.x), vec2(2.0, 0.0))*dv;
#else
      dv = cmul(cmul(p, vec2(2.0, 0.0)), dv);
#endif

      //uv += vec2(SLIDERS[10], SLIDERS[10])*0.1;
      //uv += vec2(-dv.y, dv.x)*SLIDERS[9]*1.0;
      //uv += dv*SLIDERS[11]*0.05;
      
      //p *= SLIDERS[9] + 1.0;
      
      //p = cmul(p, p) + uv;
      
      p = cexp(p, vec2(SLIDERS[21], 0.0)) + uv;

      //p += -dv*SLIDERS[10]*0.05;
      
      //uv = mix(uv, uv*uv*uv*(3.0 - 2.0*uv), SLIDERS[9]);
      //uv = mix(uv, p, SLIDERS[9]);
      
      //p = mix(p, cmul(p, vec2(-dv.y, dv.x)), SLIDERS[9]);
            
      if (dot(p, p) > limit) {
        dv /= float((i+1)*(i+1));
        
        float wid = 0.1*SLIDERS[4];
        
        //calc distance between steps
        float f = float(i);
        float f2 = length(p) / limit;
        
        float a = 3.5;
        float b = 1.7;
        
        //linearize
        f2 = exp(-f2*a)*b;
         
        //add fractional to step
        f += f2;
        
        //take log for nicer results
        //f = pow(f, 1.0/30.0);
        //f = log(max(0.1 + f, 1.0));
        //f *= 5.0;
        //float fa = log(1.0 + f) / log(2.0);
        //float fb = SLIDERS[1] / (f + 1.0);
        
        //f = fb*0.5 + fa*0.5;
        f = pow(1.0 + f, -(1.0/3.0))*2.5;
        //f = fb;
        
        return f;
      }
    }
    
    dv /= float(STEPS*STEPS);
    
    return 0.0;
}

#ifdef SHOW_DV
void main() {
  vec2 p = vCo*iRes;
  vec2 dv;
  
  float df = 0.001;
  
  float fx = pattern(p.x+df, p.y, dv);
  float fy = pattern(p.x, p.y+df, dv);
  float f = pattern(p.x, p.y, dv);

  vec2 dv1 = vec2(pattern(p.x+df, p.y, dv),
                  pattern(p.x, p.y+df, dv));
                  
  vec2 dv2 = vec2(pattern(p.x+df*2.0, p.y, dv),
                  pattern(p.x, p.y+df*2.0, dv));
  vec2 dv3 = vec2(pattern(p.x+df*3.0, p.y, dv),
                  pattern(p.x, p.y+df*3.0, dv));
  
  dv3 = (dv3 - dv2) / df;
  dv2 = (dv2 - dv1) / df;
  dv1 = (dv1 - vec2(f, f)) / df;
  
  float th = atan(dv1.y, dv1.x); // M_PI;
  //th = th*0.5 + 0.5;
  
  //f = dot(normalize(dv), normalize(vec2(0.2, 0.5)))*0.5 + 0.5;
  f = vCo.x*cos(th) + vCo.y*sin(th);
  f = fract(f*10.0);
  
  f = fract(length(dv*0.001));
  dv = normalize(dv)*0.5 + 0.5;
  //dv = dv*0.5 + 0.5;
  
  dv = normalize(dv1)*0.5 + 0.5;
  gl_FragColor = vec4(dv.x, dv.y, 0.0, 1.0);
  
  gl_FragColor.r += (uhash2(vCo)-0.5)/255.0;
  gl_FragColor.g += (uhash2(vCo+0.1)-0.5)/255.0;
  gl_FragColor.b += (uhash2(vCo+0.2)-0.5)/255.0;
}
#endif

`


export class MandelbrotPattern extends Pattern {
  constructor() {
    super();

    this._digest = new util.HashDigest();

    this.expandFrame = 4.0;
    this.showDv = false;

    this.cubicInterp = true;
    this._last_drawgen_pointbuf = undefined;

    //this.enableAccum = false;

    this.filter_width = 1.1;
    this.max_samples = 512;//use different max_samples
    this.sharpness = 0.33; //use different default sharpness

    this.fboCount = 2;
    this.regenPointBuf = true;

    this._orbit_mode = false;
    this.orbit_seed = 1;
    this.orbit_time_step = 1; //for anti-aliasing
    this.orbit_t = 0.0;
    this.orbit_t_counter = 0;

    this.totpoint = 0;

    this._orbit_update_key = undefined;

    this.orbit_accum_shader = undefined;
    this.pointbuf_shader = undefined;
    this.pointbuf = undefined;
  }

  get orbit_mode() {
    return this._orbit_mode;
  }

  set orbit_mode(v) {
    this.fboCount = v ? 3 : 2;
    this._orbit_mode = v;
  }

  get showDv() {
    return this._showDv;
  }

  set showDv(v) {
    if (v) {
      this.flag |= PatternFlags.CUSTOM_SHADER;
    } else {
      this.flag &= ~PatternFlags.CUSTOM_SHADER;
    }

    if (!!v !== this._showDv) {
      this.shader = undefined; //recompile shader
    }

    this._showDv = !!v;
  }

  static patternDef() {
    return {
      typeName     : "mandelbrot",
      uiName       : "Mandelbrot",
      flag         : 0,
      description  : "Mandelbrot fractal",
      icon         : -1,
      offsetSliders: {
        scale: 6,
        x    : 7,
        y    : 8,
      },
      presets      : MandelbrotPresets,
      sliderDef    : [
        {
          name : "steps", integer: true,
          range: [5, 955],
          value: 800,
          speed: 7.0,
          exp  : 1.5,
        },//0
        {name: "offset", value: 0.0, range: [0.0, 15.5]}, //1
        {name: "gain", value: 0.5, range: [0.001, 1000], speed: 0.4, exp: 1.5, noReset: true},  //2
        {name: "color", value: 0.692, range: [-50, 50], speed: 0.25, exp: 1.0}, //3
        {name: "colorscale", value: 2.1, speed: 0.01, noReset: true},//4
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset: true}, //5
        {name: "scale", value: 1.75, range: [0.001, 1000000.0]}, //6
        {name: "x", value: -0.42},  //7
        {name: "y"},  //8
        {name: "offset2"}, //9
        {name: "offset3", value: 0.85}, //10
        {name: "offset4"}, //11
        {
          name       : "orbpoints", value: 1000, range: [1, 20000], speed: 10.0, exp: 2.5,
          description: "orbit trail points (in thousands)"
        }, //12
        {name: "psize", value: 2.5, range: [0.1, 15], speed: 0.2, description: "orbit trail point size"}, //13
        {name: "orbalpha", value: 0.5, speed: 0.1, range: [0.0, 1.0], description: "orbit trail alpha"}, //14
        {name: "orbshift", value: 0.94, speed: 0.1, range: [0.0, 1.0], description: "color shift orbit trail"}, //15
        {name: "orbtrail", value: 15, range: [1, 500], speed: 0.5, description: "steps in orbit rail"},//16
        {name: "orbtdist", value: 1.0, range: [0.001, 275], speed: 0.07, description: "length of orbit rail"},//17
        {name: "orbdecay", value: 0.0, speed: 0.01, range: [0.0, 1.0]}, //18
        {name: "orbspeed", value: 0.1, speed: 0.01, range: [0.0001, 2.0]}, //19
        {name: "orbthresh", value: 4, speed: 1, range: [-1, 500]}, //20
        {name: "exp", value : 2.0, range : [-5.0, 10000.0], speed : 0.25}, //21
        {name: "th", value : 0.0, range : [-6.0, 6.0], speed : 0.0875}, //22
      ],
      shader
    }
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    let onchange = function () {
      this.dataref.regenPointBuf = true;
      this.dataref.drawGen++;
    }

    st.bool("showDv", "showDv", "ShowDv")
      .on('change', onchange);


    st.float("expandFrame", "expandFrame", "Expand Frame")
      .noUnits()
      .range(1, 16.0)
      .on('change', onchange);

    st.int("orbit_seed", "orbit_seed", "Orbit Seed")
      .noUnits()
      .range(-10000, 10000)
      .on('change', onchange);

    st.int("orbit_time_step", "orbit_time_step", "Quality Steps")
      .range(1, 10)
      .noUnits();

    st.bool("orbit_mode", "orbit_mode", "Orbit Mode")
      .on('change', onchange);

    st.bool("cubicInterp", "cubicInterp", "Curved Paths")
      .on('change', onchange);
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    con.prop("showDv");

    con.prop("orbit_mode");
    con.prop("orbit_seed");
    con.prop("orbit_time_step");
    con.prop("expandFrame");
    con.prop("cubicInterp");
  }

  savePresetText(opts = {}, name = undefined) {
    opts.sharpness = opts.sharpness ?? this.sharpness;
    opts.max_samples = opts.max_samples ?? this.max_samples;

    let sliders = JSON.stringify(this.sliders);
    opts = JSON.stringify(opts);

    name = name ? `, "${name}"` : "";

    return `
add_preset(${this.orbit_mode}, ${this.orbit_seed}, ${sliders}, ${opts}${name});
    `.trim();
  }

  setup(ctx, gl, uniforms, defines) {
    defines.OFFSET2 = ~~this.sliders.offset2;

    if (this.showDv) {
      defines.SHOW_DV = null;
    }

    if (this.cubicInterp) {
      defines.CUBIC = null;
    } else {
      delete defines.CUBIC;
    }

    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[4]";
    defines.BRIGHTNESS = "SLIDERS[5]";

    if (this.orbit_mode) {
      defines.ORBIT_MODE = true;
    }
  }

  makePointBuf(gl, aspect) {
    this.regenPointBuf = false;

    if (!this.pointbuf) {
      this.pointbuf = this.vbo.get("pointbuf");
    }

    this.totpoint = 0;

    let cos = [];
    let totpoint = ~~(this.sliders.orbpoints*1000);

    let rand = new util.MersenneRandom(this.orbit_seed);
    let steps = Math.ceil(this.sliders.orbtrail);

    let offx = this.sliders.x;
    let offy = this.sliders.y;
    let scale = this.sliders.scale;

    const threshold = this.sliders.orbthresh;

    let ilen = totpoint*100000;
    const expandFrame = this.expandFrame;

    if (isNaN(totpoint)) {
      return;
    }

    let start_time = util.time_ms();
    let last_totpoint;

    let seed = this.orbit_seed;

    function random() {
      return rand.random();
    }

    while (this.totpoint < totpoint) {
      if (util.time_ms() - start_time > 1500 && this.totpoint === last_totpoint) {
        console.error("Could not make any orbit points", last_totpoint, this.totpoint, totpoint);
        break;
      }

      last_totpoint = this.totpoint;

      let u = random();
      let v = random();

      let u2 = (u*2.0 - 1.0)*aspect*expandFrame;
      let v2 = (v*2.0 - 1.0)*expandFrame;

      u2 = (u2 + offx)*scale;
      v2 = (v2 + offy)*scale;

      let x = u2, y = v2;
      let bad = true;

      /*
      on factor
      off period;

      procedure f(p);
        p*p + uv;

        2*p + lastdv;
      */
      for (let j = 0; j < 800; j++) {
        let x2 = x*x - y*y + u2;
        let y2 = 2.0*x*y + v2;

        if (x2*x2 + y2*y2 > 100000.0) {
          if (j > threshold) {
            bad = false;
          }

          break;
        }

        x = x2;
        y = y2;
      }

      if (bad) {
        continue;
      }
      //a[0]*b[0] - a[1]*b[1],
      //a[0]*b[1] + b[0]*a[1]

      let t = 0, dt = 1.0/(steps - 1);
      for (let j = 0; j < steps; j++, t += dt) {
        cos.push(u);
        cos.push(v);
        cos.push(t);
        this.totpoint++;
      }
    }

    this.pointbuf.upload(gl, {
      type    : gl.FLOAT,
      elemSize: 3,
      target  : gl.ARRAY_BUFFER
    }, cos);
  }

  orbitModeDraw(ctx, gl, uniforms, defines) {
    uniforms.alpha = this.sliders.orbalpha;

    if (uniforms.T === 0.0) {
      this.orbit_t = 0.0;
    }

    let speed = /*this.sliders.orbtdist * */ this.sliders.orbspeed*0.1*this.sliders.scale;
    let noDecay = 1.0;

    /*XXX doesn't work*/
    if (0) {
      if (this.orbit_t_counter >= this.orbit_time_step) {
        this.orbit_t_counter = 0;
        this.orbit_t += speed;
        this.T += 0.001;
        uniforms.T = this.T;
        noDecay = 0.0;
      }
      uniforms.noDecay = noDecay;
    } else {
      this.T += 0.001;
      this.orbit_t += speed;
    }

    this.orbit_t_counter++;
    //this.orbit_t += speed;

    //console.log(uniforms.T, this.orbit_t.toFixed(5), this.orbit_t_counter);
    uniforms.ORBIT_T = this.orbit_t;

    if (!this.orbit_accum_shader) {
      this.orbit_accum_shader = ShaderProgram.fromDef(gl, buildShader(OrbitFinalShader, gl.haveWebGL2));
    }

    if (!this.pointbuf_shader || this.pointbuf_shader.gl !== gl) {
      this.pointbuf_shader = ShaderProgram.fromDef(gl, buildShader(OrbitShader, gl.haveWebGL2));
    }

    let totpoint = this.totpoint;


    let digest = this._digest.reset();
    digest.add(this.sliders.orbpoints);
    digest.add(this.sliders.orbtrail);
    digest.add(this.sliders.orbthresh);

    if (!taskManager.has("zoom")) {
      let key = digest.get();

      if (this.regenPointBuf || !this.pointbuf || key !== this._orbit_update_key) {
        this._orbit_update_key = key;

        if (!this.regenPointBuf) {
          this.drawGen++;
        }

        let glSize = ctx.canvas.glSize;
        let aspect = glSize[0]/glSize[1];
        this.makePointBuf(gl, aspect);
      }
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.pointbuf_shader.bind(gl, uniforms, defines);

    this.pointbuf.bind(gl, 0);
    gl.drawArrays(gl.POINTS, 0, totpoint);

    gl.disable(gl.BLEND);
  }

  compileShader(gl) {
    if (!this.showDv) {
      return super.compileShader(gl);
    }

    let fragment = this.constructor.patternDef().shader;
    let vertex = Shaders.fragmentBase.vertex;

    fragment = Shaders.fragmentBase.fragmentPre + "\n" + fragment;

    let sdef = buildShader({
      fragment, vertex, attributes: ["co"], uniforms: {}
    }, gl.haveWebGL2);

    this.shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

    sdef = Shaders.finalShader;
    this.finalShader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    if (!this.vbuf) {
      this.regenMesh(gl);
    }

    if (this.drawGen !== this._last_drawgen_pointbuf) {
      this._last_drawgen_pointbuf = this.drawGen;
      this.regenPointBuf = true;
    }

    uniforms.expandFrame = this.expandFrame;

    defines.STEPS = ~~this.sliders[0];
    this.fboCount = this.orbit_mode ? 3 : 2;

    if (this.orbit_mode) {
      this.DT = 0.0;

      //ctx.canvas.fbos is setup in Pattern parent class, see _doViewPortDraw method
      let fbos = ctx.canvas.fbos;

      //first two fbos are a double buffer, use third one
      let fbo = fbos[2];
      fbo.bind(gl);

      let f = this.sliders.orbshift;
      gl.clearColor(f, f, f, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (this.orbit_mode) {
        defines.BLANK = null;
      } else if ("BLANK" in defines) {
        delete defines.BLANK;
      }

      //super.viewportDraw(ctx, gl, uniforms, defines);
      this.orbitModeDraw(ctx, gl, uniforms, defines);

      fbo.unbind(gl);
      fbos[0].bind(gl);

      let uniforms2 = Object.assign({}, uniforms, {
        inRgba: fbo.texColor
      });

      this.orbit_accum_shader.bind(gl, uniforms2, defines);
      this.vbuf.co.bind(gl, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      //super.viewportDraw(ctx, gl, uniforms, defines);
    } else {
      this.DT = 0.001;
      super.viewportDraw(ctx, gl, uniforms, defines);
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.showDv = this.showDv;
    b.orbit_mode = this.orbit_mode;
    b.orbit_seed = this.orbit_seed;
    b.orbit_time_step = this.orbit_time_step;
    b.expandFrame = this.expandFrame;
    b.cubicInterp = this.cubicInterp;
  }
}

MandelbrotPattern.STRUCT = nstructjs.inherit(MandelbrotPattern, Pattern) + `
  orbit_mode      : bool;
  orbit_seed      : int;
  orbit_time_step : double;
  expandFrame     : double;
  cubicInterp     : bool;
  showDv          : bool;
}`;

Pattern.register(MandelbrotPattern);
