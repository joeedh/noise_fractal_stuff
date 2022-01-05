import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';
import {ShaderProgram} from '../webgl/webgl.js';

let nameBase = 1;

export const MandelbrotPresets = [];
export function add_preset(orbit_mode, orbit_seed, sliders, options={}, name=undefined) {
  let pat = new MandelbrotPattern();

  pat.orbit_seed = orbit_seed;
  pat.orbit_mode = orbit_mode;
  pat.orbit_time_step = 4;

  for (let k in options) {
    pat[k] = options[k];
  }

  for (let i=0; i<sliders.length; i++) {
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

export const OrbitFinalShader = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float aspect;
uniform float ORBIT_T;
uniform float filterWidth;

in vec2 co;
out vec2 vCo;

void main() {
  vCo = co;
  gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
}
`,
  fragment  : `#version 300 es
precision highp float;

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

in vec2 vCo;
out vec4 fragColor;

void main() {
  vec4 c1 = texture(rgba, vCo);
  vec4 c2 = texture(inRgba, vCo);
  
  if (enableAccum != 0.0) {
#if 1
    float decay = SLIDERS[18];
    decay = 1.0 - decay*decay*decay;
        
    c1 *= decay;
    c1.rgb *= decay;
#endif

    c1.rgb += c2.rgb;
    c1.a += 1.0;
    
    fragColor = c1;
  } else {
    fragColor = vec4(c2.rgb, 1.0);
  } 
}
`,
  attributes: ["co"],
  uniforms  : {}
};

export const OrbitShader = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float aspect;
uniform float ORBIT_T;
uniform float filterWidth;
uniform float expandFrame;

in vec3 co;

out vec2 vCo;
out vec2 vUv;
out float vTime;

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

vec2 solve(float fsteps, vec2 uv2) {
  vec2 p = uv2;
  
  for (int i=0; i<STEPS; i++) {
    if (float(i) > fsteps) {
      break;
    }
    
    p = cmul(p, p) + uv2;
  }
  
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
  
  vec2 p0 = solve(fsteps, uv2);

  vec2 p1 = solve(fsteps-1.0, uv2);
  vec2 p2 = solve(fsteps+2.0, uv2);

  vec2 p3 = solve(fsteps+1.0, uv2);
  
  p1 = (p0 - p1)*0.5 + (p3 - p0)*0.5;
  p2 = (p3 - p2)*0.5 + (p0 - p3)*0.5;
 
  float l1 = length(p1), l3 = length(p2);
  float l2 = length(p0 - p3);
  
  //l1 += (l2 - l1)*0.5;
  //l3 += (l2 - l3)*0.5;
  
  //p1 += normalize(p0)*l1;
  //p2 += normalize(p3)*l3;
  
  //p1 = normalize(p1)*l1;
  //p2 = normalize(p2)*l3;
  
  p1 = p0 + p1 / 3.0;
  p2 = p3 + p2 / 3.0;
  
  vec2 p = p1 + (p2 - p1)*s;
  
  //p1 = p0;
  //p2 = p3;
  
  p.x = cubic(p0.x, p1.x, p2.x, p3.x, s);
  p.y = cubic(p0.y, p1.y, p2.y, p3.y, s);
  
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
  fragment  : `#version 300 es
precision highp float;

uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float T;
uniform float SLIDERS[MAX_SLIDERS];
uniform float alpha;

in vec2 vCo;
in vec2 vUv;
in float vTime;

out vec4 fragColor;

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

  fragColor = vec4(f, f, f, alpha);
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

#define M_PI 3.141592654

vec2 cmul(vec2 a, vec2 b) {
    return vec2(
        a[0]*b[0] - a[1]*b[1],
        a[0]*b[1] + b[0]*a[1]
    );
}

float pattern(float ix, float iy) {
    vec2 uv = vec2(ix, iy)/iRes;
    
#ifdef BLANK
    return SLIDERS[15];
#endif

    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[7];
    uv.y += SLIDERS[8];

    uv *= SLIDERS[6];
    
    vec2 p = vec2(0.0, 0.0);
    float f = 0.0;
    
    for (int i=0; i<STEPS; i++) {
      vec2 dp = p;
      
      p = cmul(p, p) + uv;
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

`


export class MandelbrotPattern extends Pattern {
  constructor() {
    super();

    this._digest = new util.HashDigest();

    this.expandFrame = 4.0;

    this._last_drawgen_pointbuf = undefined;

    //this.enableAccum = false;

    this.max_samples = 512;//use different max_samples
    this.sharpness = 0.33; //use different default sharpness

    this.fboCount = 2;
    this.regenPointBuf = true;

    this._orbit_mode = false;
    this.orbit_seed = 1;
    this.orbit_time_step = 4; //for anti-aliasing
    this.orbit_t = 0.0;
    this.orbit_t_counter = 0;

    this.totpoint = 0;

    this._orbit_update_key = undefined;

    this.orbit_accum_shader = undefined;
    this.pointbuf_shader = undefined;
    this.pointbuf = undefined;
  }

  set orbit_mode(v) {
    this.fboCount = v ? 3 : 2;
    this._orbit_mode = v;
  }

  get orbit_mode() {
    return this._orbit_mode;
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
        {name: "offset", value: 0.0, range: [-5.5, 15.5]}, //1
        {name: "gain", value: 2.43, range: [0.001, 1000], speed: 4.0, exp: 2.0, noReset:true},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0}, //3
        {name: "colorscale", value: 1.54, speed : 0.1, noReset:true},//4
        {name: "brightness", value: 1.0, range: [0.001, 10.0], noReset:true}, //5
        {name: "scale", value: 1.75, range: [0.001, 1000000.0]}, //6
        {name: "x", value: -0.42},  //7
        {name: "y"},  //8
        {name: "offset2"}, //9
        {name: "offset3", value: 0.85}, //10
        {name: "offset4"}, //11
        {name        : "orbpoints", value: 1000, range: [1, 20000], speed: 10.0, exp: 2.5,
          description: "orbit trail points (in thousands)"
        }, //12
        {name: "psize", value: 2.5, range: [0.1, 500], speed: 0.4, description: "orbit trail point size"}, //13
        {name: "orbalpha", value: 0.5, speed : 0.1, range: [0.0, 1.0], description: "orbit trail alpha"}, //14
        {name: "orbshift", value: 0.94, speed: 0.1, range: [0.0, 1.0], description: "color shift orbit trail"}, //15
        {name: "orbtrail", value: 15, range: [1, 500], speed: 2.5, description: "steps in orbit rail"},//16
        {name: "orbtdist", value: 1.0, range: [0.001, 15], speed: 0.07, description: "length of orbit rail"},//17
        {name: "orbdecay", value : 0.0, speed : 0.01, range: [0.0, 1.0]}, //18
        {name: "orbspeed", value : 0.1, speed : 0.01, range: [0.0001, 2.0]}, //19
        {name: "orbthresh", value : 4, speed : 1, range: [-1, 100]}, //20
      ],
      shader
    }
  }

  savePresetText(opts={}, name=undefined) {
    opts.sharpness = opts.sharpness ?? this.sharpness;
    opts.max_samples = opts.max_samples ?? this.max_samples;

    let sliders = JSON.stringify(this.sliders);
    opts = JSON.stringify(opts);

    name = name ? `, "${name}"` : "";

    return `
add_preset(${this.orbit_mode}, ${this.orbit_seed}, ${sliders}, ${opts}${name});
    `.trim();
  }
  static apiDefine(api) {
    let st = super.apiDefine(api);

    let onchange = function () {
      this.dataref.regenPointBuf = true;
      this.dataref.drawGen++;
    }

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
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    con.prop("orbit_mode");
    con.prop("orbit_seed");
    con.prop("orbit_time_step");
    con.prop("expandFrame");
  }

  setup(ctx, gl, uniforms, defines) {
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

    while (this.totpoint < totpoint) {
      if (util.time_ms()-start_time > 500 && this.totpoint === last_totpoint) {
        console.error("Could not make any orbit points", last_totpoint, this.totpoint, totpoint);
        break;
      }

      last_totpoint = this.totpoint;

      let u = rand.random();
      let v = rand.random();

      let u2 = (u*2.0 - 1.0) * aspect * expandFrame;
      let v2 = (v*2.0 - 1.0) * expandFrame;

      u2 = (u2 + offx) * scale;
      v2 = (v2 + offy) * scale;

      let x = u2, y = v2;
      let bad = true;

      for (let j=0; j<800; j++) {
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

    let speed = this.sliders.orbtdist * this.sliders.orbspeed * 0.1 * this.sliders.scale;

    if (this.orbit_time_step > 0 && this.orbit_t_counter >= this.orbit_time_step) {
      this.orbit_t_counter = 0;
      this.orbit_t += speed;
    } else {
      this.orbit_t += speed;
    }

    this.orbit_t_counter++;

    //console.log(uniforms.T, this.orbit_t.toFixed(5), this.orbit_t_counter);
    uniforms.ORBIT_T = this.orbit_t;

    if (!this.orbit_accum_shader) {
      this.orbit_accum_shader = ShaderProgram.fromDef(gl, OrbitFinalShader);
    }

    if (!this.pointbuf_shader || this.pointbuf_shader.gl !== gl) {
      this.pointbuf_shader = ShaderProgram.fromDef(gl, OrbitShader);
    }

    let totpoint = this.totpoint;


    let digest = this._digest.reset();
    digest.add(this.sliders.orbpoints);
    digest.add(this.sliders.orbtrail);
    digest.add(this.sliders.orbthresh);

    let key = digest.get();

    if (this.regenPointBuf || !this.pointbuf || key !== this._orbit_update_key) {
      this._orbit_update_key = key;

      if (!this.regenPointBuf) {
        this.drawGen++;
      }

      let glSize = ctx.canvas.glSize;
      let aspect = glSize[0] / glSize[1];
      this.makePointBuf(gl, aspect);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.pointbuf_shader.bind(gl, uniforms, defines);

    this.pointbuf.bind(gl, 0);
    gl.drawArrays(gl.POINTS, 0, totpoint);

    gl.disable(gl.BLEND);
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
        inRgba : fbo.texColor
      });

      this.orbit_accum_shader.bind(gl, uniforms2, defines);
      this.vbuf.bind(gl, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      //super.viewportDraw(ctx, gl, uniforms, defines);
    } else {
      super.viewportDraw(ctx, gl, uniforms, defines);
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.orbit_mode = this.orbit_mode;
    b.orbit_seed = this.orbit_seed;
    b.orbit_time_step = this.orbit_time_step;
    b.expandFrame = this.expandFrame;
  }
}

MandelbrotPattern.STRUCT = nstructjs.inherit(MandelbrotPattern, Pattern) + `
  orbit_mode      : bool;
  orbit_seed      : int;
  orbit_time_step : double;
  expandFrame     : double;
}`;

Pattern.register(MandelbrotPattern);
