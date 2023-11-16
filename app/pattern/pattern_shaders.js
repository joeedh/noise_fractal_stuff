import {Curve1D, nstructjs} from '../path.ux/scripts/pathux.js';
import {Curve} from '../path.ux/scripts/widgets/ui_curvewidget_old.js';
import {genBlueMask} from './bluemask.js';
import {Texture} from '../webgl/webgl.js';

export class CurveSet {
  v = null;
  r = null;
  g = null
  b = null;
  _regen = true;
  size = 0;
  tables = new Array(4);
  gltex = null;
  texDimen = 0;

  constructor() {
    this.v = new Curve1D();
    this.r = new Curve1D();
    this.g = new Curve1D();
    this.b = new Curve1D();

    this._regen = true;
    this.size = this.constructor.getDefaultSize();
    this.tables = new Array(4);
  }

  toJSON() {
    let {r, g, b, v} = this;

    return {
      r, g, b, v
    }
  }

  copyTo(b) {
    b.v.load(this.v);
    b.r.load(this.r);
    b.g.load(this.g);
    b.b.load(this.b);

    b._regen = true;
  }

  loadJSON(json) {
    this.v.loadJSON(json.v);
    this.r.loadJSON(json.r);
    this.g.loadJSON(json.g);
    this.b.loadJSON(json.b);

    this._regen = true;

    return this;
  }

  static getDefaultSize() {
    return 256;
  }

  static getShaderCode(name, size = this.getDefaultSize()) {
    let dimen = this.calcTexDimen(size);
    let fdimen = "" + dimen + ".0";
    let idimen = "" + (1.0/dimen);
    let texname = this.texName(name);

    let ch = (ch, nvar) => {
      return `
      {
      float fi = (cinput.${nvar})*${size}.0*0.99999;
      int i = int(fi);
      float s = (${ch*size}.0 + float(i) + 0.00) * ${idimen};
      
      ret.${nvar} = texture(${texname}, vec2(s, 0.0))[0];
      }
`;
    }

    return `
vec3 ${name}_evaluate(vec3 cinput) {
  cinput.r = clamp(cinput.r, 0.0, 1.0);
  cinput.g = clamp(cinput.g, 0.0, 1.0);
  cinput.b = clamp(cinput.b, 0.0, 1.0);
  
  vec3 ret = cinput;
  
  /* Note: the first (combined) curve is pre-applied to
   * the individual rgb channel curves.
   */
  ${ch(1, "r")};
  ${ch(2, "g")};
  ${ch(3, "b")};
  
  return ret;
}
    `;
  }


  static makeUniforms(name, size = this.getDefaultSize()) {
    return `      
      uniform sampler2D ${this.texName(name)};
    `;
  }

  static getName(name, ch) {
    let names = {
      'c': 'c', 'r': 'r', 'g': 'g', 'b': 'b',
      0  : 'c', 1: 'r', 2: 'g', 3: 'b'
    };

    return name + "_" + names[ch];
  }

  static getEvalCode(name, arg) {
    return `${name}_evaluate(${arg})`;
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    function onchange() {
      this.dataref._regen = true;
      window.redraw_viewport();
    }

    st.curve1d("v", "v", "Combined")
      .on('change', onchange);
    st.curve1d("r", "r", "r")
      .on('change', onchange);
    st.curve1d("g", "g", "g")
      .on('change', onchange);
    st.curve1d("b", "b", "b")
      .on('change', onchange);
  }

  checkTable() {
    if (!this._regen) {
      return;
    }

    if (this.gltex) {
      this.deleteTex(this.gltex.gl);
    }

    this._regen = false;

    const curves = [this.v, this.r, this.g, this.b];
    const tables = this.tables;

    for (let i = 0; i < tables.length; i++) {
      if (tables[i] === undefined || tables[i].length !== this.size) {
        tables[i] = new Float32Array(this.size);
      }

      let steps = this.size;
      let s = 0, ds = 1.0/(steps - 1);
      let curve = curves[i];
      let table = tables[i];

      curve.update();

      for (let j = 0; j < steps; j++, s += ds) {
        let t = s;

        /* Fold combined curve into rgb curves. */

        if (i > 0) {
          t = curves[0].evaluate(t);
        }

        //t = curve.evaluate(t);

        table[j] = t;
      }
    }
  }

  makeTex(gl) {
    this.checkTable();

    if (this.gltex) {
      gl.deleteTexture(this.gltex.texture);
    }

    /* Nearest power of 2. */
    let dimen = CurveSet.calcTexDimen(this.size);

    let tex = new Float32Array(dimen*4);
    let i = 0;
    for (let table of this.tables) {
      for (let f of table) {
        tex[i++] = f;
        i += 3;
      }
    }

    this.gltex = new Texture(gl.createTexture(), gl);
    this.gltex.load(gl, dimen, 1, tex, gl.RGBA);

    gl.bindTexture(gl.TEXTURE_2D, this.gltex.texture);
    this.gltex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.gltex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    this.gltex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    this.gltex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.texDimen = dimen;
  }

  static calcTexDimen(size) {
    return Math.pow(2.0, Math.ceil(Math.log(size*4.0)/Math.log(2.0)));
  }

  getTex(gl) {
    if (!this.gltex) {
      this.makeTex(gl);
    }

    return this.gltex;
  }

  deleteTex(gl) {
    gl.deleteTexture(this.gltex.texture);
    this.gltex = null;
  }

  static texName(name) {
    return name + "_tex";
  }

  setUniforms(gl, name, uniforms) {
    this.checkTable();

    let tables = this.tables, size = this.size;

    uniforms[CurveSet.texName(name)] = this.getTex(gl);
  }
}

CurveSet.STRUCT = `
CurveSet {
  v : Curve1D;
  r : Curve1D;
  g : Curve1D;
  b : Curve1D;
}
`;
nstructjs.register(CurveSet);

window.CurveSet = CurveSet;

export var shaderHeaders = {
  webgl1: {
    base    :
      `#extension GL_EXT_draw_buffers : require
  precision highp float;
#define texture texture2D

int min(int a, int b) {
  return a < b ? a : b;
}

bool isnan(float f) {
  return (f == f) == (f != f);
}

bool isinf(float f) {
  return abs(f) > 10000000.0;
}

float determinant(mat2 m) {
  return m[0][0]*m[1][1] - m[0][1] * m[1][0];
}

mat2 inverse(mat2 m) {
  float det = m[0][0]*m[1][1] - m[0][1] * m[1][0];
  
  return mat2(vec2(m[1][1], -m[0][1]), vec2(-m[1][0], m[0][0])) / det;
}

mat2 transpose(mat2 m) {
  return mat2(vec2(m[0][0], m[1][0]), vec2(m[0][1], m[1][1]));
}

vec2 rot2d(vec2 a, float th) {
  return vec2(cos(th)*a.x + sin(th)*a.y, cos(th)*a.y - sin(th)*a.x);
}

`.trim() + "\n",
    vertex  : ``,
    fragment: `
#define fragColor gl_FragData[0]
#define fragVar gl_FragData[1]
    `,
  },
  webgl2: {
    base    : `#version 300 es
precision highp float;
vec2 rot2d(vec2 a, float th) {
  return vec2(cos(th)*a.x + sin(th)*a.y, cos(th)*a.y - sin(th)*a.x);
}
`,
    vertex  : `
#define attribute in
#define varying out 
    `,
    fragment: `
#define varying in

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragVar;
`,
  }
}

export const ColorizeShaderCode = {
  pre: `
        #ifndef OLD_GRADIENT
        uniform float rgrad[GRAD_STEPS];
        uniform float ggrad[GRAD_STEPS];
        uniform float bgrad[GRAD_STEPS];
        uniform float agrad[GRAD_STEPS];
        #endif
        
        #ifndef GAIN
        #define GAIN 1.0
        #endif
        
        #ifndef COLOR_SCALE
        #define COLOR_SCALE 1.0
        #endif
        
        #ifndef BRIGHTNESS
        #define BRIGHTNESS 1.0
        #endif
        
        #ifndef COLOR_SHIFT
        #define COLOR_SHIFT 1.5
        #endif
        
        #ifndef OLD_GRADIENT
        float evalgrad(float t, float grad[GRAD_STEPS]) {
          float t1 = floor(t*float(GRAD_STEPS));
          float t2 = ceil(t*float(GRAD_STEPS));
          float s = fract(t*float(GRAD_STEPS));

          int i1 = int(t1);
          int i2 = int(t2);

          i2 = max(0, min(i2, GRAD_STEPS-1));

          return mix(grad[i1], grad[i2], s);
        }
        #endif
        
        vec3 colorize(float value) {
          vec3 color;
          
  #ifndef OLD_GRADIENT
          float f = value;

          color.r = evalgrad(f, rgrad);
          color.g = evalgrad(f, ggrad);
          color.b = evalgrad(f, bgrad);
          color.a = 1.0;
  #else
          float f = value + VALUE_OFFSET;
          
          f = mix(f*1.5, pow(f, 1.0 / GAIN), 0.5);
          f = tent(f*COLOR_SCALE+0.5);
          
          float off = COLOR_SHIFT;
          float f2 = f*pow(off*0.05, 0.25) + off + 0.45;
          
          color.r = tent(f2);
          color.g = tent(f2*2.0+0.234);
          color.b = tent(f2*3.0+0.7324);
          
          color.rgb = normalize(color.rgb);
          //color.b *= 0.1;
          color.rgb *= f*1.5*BRIGHTNESS;
          //color.rgb = vec3(f, f, f)*BRIGHTNESS*1.5;
           
  #endif
          return color;
        }
  `,
}

export function buildShader(shader, webgl2) {
  shader = Object.assign({}, shader);

  let header = webgl2 ? shaderHeaders.webgl2 : shaderHeaders.webgl1;

  if (webgl2) {
    shader.vertex = `
${header.base}
${header.vertex}
#define HAVE_WEBGL2
${shader.vertex}
`.trim();

    shader.fragment = `
${header.base}
${header.fragment}
#define HAVE_WEBGL2
${shader.fragment}
`.trim();
  } else {
    shader.vertex = `
${header.base}
${header.vertex}
${shader.vertex}
    `.trim();
    shader.fragment = `
${header.base}
${header.fragment}
${shader.fragment}
    `.trim();

  }

  return shader;
}

const fragmentBase = {
  vertex     : `
      attribute vec2 co;
      attribute vec2 uv;
      
      varying vec2 vCo;
      varying vec2 vUv;
      
      void main() {
        gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
        
        vUv = uv;
        vCo = co;
      }`.trim(),
  uniforms   : {},
  attributes : ["co", "uv"],
  fragmentPre: `
uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float aspect;
uniform float SLIDERS[MAX_SLIDERS];
uniform float T;
uniform float enableAccum;
uniform float filterWidth;
uniform float sharpness;
uniform float uSample;

uniform sampler2D rgba;
uniform sampler2D rgba2;

uniform float blueMaskDimen;
uniform sampler2D blueMask;

varying vec2 vCo;//drawing rectangle coordinates
varying vec2 vUv;//possibly mapped coordinates

#define M_PI 3.14159265358

float Seed = 0.0;

vec2 cmul(vec2 a, vec2 b) {
    return vec2(
        a[0]*b[0] - a[1]*b[1],
        a[0]*b[1] + b[0]*a[1]
    );
}

float ctent(float f) {
    return cos(f*M_PI*2.0)*0.5 + 0.5;
}

#if 0
float smin(float a, float b, float t) {
    if (t == 0.0)
        return a < b ? a : b;
        
    if (a < b-t*0.5) {
        return a;
    } else if (a < b+t*0.5) {
        float f = (a-b+t*0.5) / t;
    
        f = f*f*(3.0 - 2.0*f);
        
        return a + (b - a)*f;
    }

    return b;
}
#else
float smin(float a, float b, float t) {
  float a1 = min(a, b), a2 = min(a, b);
  
  if (a >= b - t && a <= b + t) {
    float s = (a - b) / (2.0 * t);
    
    s = s*s*(3.0 - 2.0*s);
    
    a1 = a + (b - a) * s;
  }
  
  if (b >= a - t && b <= a + t) {
    float s = (b - a) / (2.0 * t);
    
    s = s*s*(3.0 - 2.0*s);
    
    a2 = b + (a - b) * s;
  }
  
  //return a1;
  return (a1 + a2)*0.5;
}
#endif

float tent(float f) {
    return 1.0 - abs(fract(f)-0.5)*2.0;
}

vec2 tent(vec2 p) {
    return vec2(tent(p.x), tent(p.y));
}

${ColorizeShaderCode.pre}

float hash(float seed) {
    float f = fract(sin(seed*13.0) + seed*8.9);
    //float f = fract(seed);
    return fract(1.0 / (f*0.0001 + 0.0000001));
}

float hash2(vec2 p) {
    p *= 1.0;
    float a = 0.445325234;// + 0.01*fract(Seed*0.001);
    
    p += tent(p*4.1234)*2.0 - 1.0;
    
    float f = p[0]*a + p[1]/a;
    
    f += Seed;
    
    return hash(f);
    return fract(f);
}

float bluenoise(vec2 p) {
#if defined(HAVE_BLUE_NOISE) && defined(PER_PIXEL_RANDOM)
  float f;
  
  vec2 uv = vCo*iRes.xy/blueMaskDimen;
  //uv.x += hash2(p)-0.5;
  //uv.y += hash2(p.yx+vec2(0.223, 0.823))-0.5;
  
  uv = fract(uv);
  
  vec4 c = texture(blueMask, uv);
  f = c[0];
  
  return f;
#else
  float f;
  vec2 op = p;

  p.x += tent(hash(fract(Seed*12.53423)*10.32432))*1500.0;
  p.y += tent(hash(fract(Seed*12.3234)*20.9234+10.4234))*1500.0;
  
  float a = 0.24976; //0.55947; //1.42083; //1.2569;
  float b;
  
  //a = 4.73493;
  
  //a = SLIDERS[1]*0.1;
  //b = SLIDERS[2]*0.1;
  
  b = a*sqrt(5.0);
  
  float c = 0.5918;
  float d;
  
  //p = floor(p*0.25);
  
  //c = SLIDERS[4]*0.1;
  //d = SLIDERS[5]*0.1;
  
  d = 0.5*c;
  
  vec2 p2 = floor(p);
  p2.x *= 0.7;
  p2.x += mod(floor(p2.y*0.5), 2.0) >= 1.0 ? 0.5 : 0.0;
  f = fract(-p2.x*c + p2.y*d);
  
  float dx = fract(p.x*a + p.y*b);
  float dy = fract(p.y*a - p.x*b);
  
  f = (f+dx+dy)*0.33333333;
  
#if 0
    if (f > sqrt((op.x*iInvRes.x)*(op.y*iInvRes.y))*SLIDERS[3]) {
      f = 0.0;
    } else {
      f = 1.0;
    }
    
    f = 1.0 - f;
#else
    //f = f*f*(3.0 - 2.0*f);
#endif
    
    
  return f;
#endif
}

float uhash2(vec2 p) {
    float f;

#if 1 //blue noise-ish distribution
    f = bluenoise(p);
    
    const float steps = 17.0;
    
    f = floor(f*steps)/steps;
    
#ifdef PER_PIXEL_RANDOM
    float f2 = sin(p.x*3.23423 + p.y*234.23432);
    f2 = floor(f2*steps)/steps;
    
    f += f2;
#endif
    
    f = fract(f*100.0 + sin(Seed*100.234) + Seed);
    
    f = hash(f+Seed);
    f += hash(f+Seed+0.32432);
    f += hash(f+Seed+1.23423);
    f *= 0.333333;
    
    return f*2.0 - 1.0;
#else
    f = hash2(p);
    
    f += hash2(p + vec2(2.234, 0.63));
    f += hash2(p + vec2(-10.8, 0.95));
    
    f /= 3.0;
    
    return f*2.0 - 1.0;
#endif
}

float uhash2b_blue(vec2 p, float seed) {
    float f = bluenoise(p);
    
    const float steps = 13.0;
    //f = fract(f+Seed);
    
    float f2 = hash2(p);
    
    f = floor(f*steps)/steps;
    f2 = floor(f2*steps)/steps;
    
    f = hash(f+Seed+seed);
    f += hash(f+Seed+0.32432+seed);
    f += hash(f+Seed+1.23423+seed);
    f *= 0.333333;
    
    return f*2.0 - 1.0;
}

float uhash2b(vec2 p, float seed) {
    float f = hash2(p);
    
    f = hash(f+Seed+seed);
    f += hash(f+Seed+0.32432+seed);
    f += hash(f+Seed+1.23423+seed);
    f *= 0.333333;
    
    return f*2.0 - 1.0;
}

vec2 uhash2v(vec2 p) {
  float dx = hash2(p)*2.0 - 1.0;
  float dy = hash2(vec2(p.y+2.23432, p.x+0.35234))*2.0 - 1.0;
  
  return vec2(dx, dy);
}

  `.trim(),
  fragment   : `
  
uniform float varianceBlur;
uniform float varianceColorFac;
uniform float varianceDecay;

#ifndef CUSTOM_MAIN
float mainImage( vec2 uv, out float w) {
#if 0
    w = 1.0;
    return uhash2(uv)*0.5 + 0.5;
    //return bluenoise(uv);
#endif

#ifdef PER_PIXEL_RANDOM
  #ifdef PER_PIXEL_BLUE
    float dx = uhash2b_blue(uv, 0.0);
    float dy = uhash2b_blue(-uv.yx, 2.53223);
  #else
    float dx = uhash2b(uv, 0.0);
    float dy = uhash2b(-uv.yx, 2.53223);
  #endif
#else
    float dx = uhash2(vec2(0.,0.));
    float dy = uhash2(-vec2(0.,0.) + 2.53223);
    
    //dx = fract(uSample)*2.0 - 1.0;
    //dy = fract(uSample+0.45)*2.0 - 1.0;
#endif    
    
    //apply some sharpening in the monte carlo distribution,
    //converges slowly.  sharpening also happens in final accumulation
    //step.
#ifdef USE_SHARPNESS
    float filterw = filterWidth*2.0;
    
    w = max(1.0 - (length(vec2(dx, dy)) / sqrt(2.0)), 0.0);
    //w = w*w*(3.0 - 2.0*w);
    
    float eps = 0.3 + sharpness*0.2;
    w = w*w*(1.0 + eps) - eps*1.5;
#else    
    float filterw = filterWidth;
    
  #ifdef USE_WEIGHTED_FILTER
    w = 1.0 - length(vec2(dx, dy)) / 1.414213;
    
    // Sinc
    //w = 1.0 - w;
    w = w == 0.0 ? 1.0 : 1.0 - sin(w*M_PI)/(w*M_PI);
    
    // Smoothstep
    //w = w*w*(3.0 - 2.0*w);
  #else
    w = 1.0;
  #endif
#endif

    if (enableAccum == 0.0) {
      filterw = 0.0;
    }
    
    uv += filterw*vec2(dx, dy);

    float f = pattern(uv[0], uv[1]);
    f = clamp(f, 0.0, 1.0);
    
    // Output to screen
    vec4 color = vec4(f, f, f, 1.0);
    
    if (isnan(f) || f+f != 2.0*f) {
      f = 0.5; 
    }
    
    return f;
}

void main() {
  Seed = uSample + T;
    
  vec2 uv = vCo;
  vec4 color;


#ifndef COLOR_VARIANCE
  float varDecay = varianceDecay;
#else
  const float varDecay = 1.0;
#endif

  const float minVarProb = 0.1;
  
  float w;
  
  vec4 old = texture(rgba, uv);
  vec4 oldvar = texture(rgba2, uv);
  
  vec2 iUv = vUv*iRes;
  
  float f = mainImage(iUv, w);
  #ifdef COLOR_VARIANCE
    if (enableAccum*oldvar.w != 0.0) {
      //f += (oldvar.r / oldvar.w)*enableAccum*varianceColorFac;
    }
  #endif
  color += vec4(f, f, f, 1.0) * w;
  
  #ifdef USE_VARIANCE
  if (oldvar.w*enableAccum > 0.0) {
    vec3 var1 = oldvar.rgb / oldvar.w;
    float f1 = hash2(uv);
    float var = max(max(var1[0], var1[1]), var1[2]);
    
    if (f1 < var && f1 > minVarProb) {
      /* Blur extremely high variance pixels a bit. */
      if (var < 1.0) {
        var = pow(var, 5.0);
      }
      iUv += uhash2v(iUv)*min(var*varianceBlur, varianceBlur)*filterWidth*5.0; 

      Seed += -0.124223;
      float f = mainImage(iUv, w);
      color += vec4(f, f, f, 1.0) * w;
      color *= 0.5;      
    }
  }
#endif
  
  vec4 var;
  if (old.w*enableAccum != 0.0) {
    float fa = old.r / old.w;
    float fb = (old.r + color.r) / (old.w + color.w);
    vec3 a = colorize(fa);
    vec3 b = colorize(fb);
    
    /* We have to calc final shader
     * value to get proper variance. 
     */

    var = vec4(abs(a - b)*10.0, 1.0);
         
    const float exp = 1.0;
    var.r = pow(var.r, exp);
    var.g = pow(var.g, exp);
    var.b = pow(var.b, exp);
  }
  
  /* Decay variance. */
  oldvar.w *= varDecay;
  oldvar.rgb *= varDecay*varDecay;
  
  fragColor = color + old*enableAccum;
  fragVar = var + oldvar*enableAccum;
}
#endif

`.trim()
};
const finalShader = {
  vertex    : `
      attribute vec2 co;
      varying vec2 vCo;
      
      void main() {
        gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
        vCo = co;
      }`.trim(),
  uniforms  : {},
  attributes: ["co"],
  fragment  : `
        uniform sampler2D rgba;
        uniform sampler2D rgba2;
        
        uniform vec2 iRes;
        uniform float sharpness;
        uniform float SLIDERS[MAX_SLIDERS];
        uniform float T;
        uniform float varianceColorFac;
        
        float Seed;

        ${CurveSet.makeUniforms("CURVE")}
        ${CurveSet.getShaderCode("CURVE")}
        
        varying vec2 vCo;
        

      float tent(float f) {
        return 1.0 - abs(fract(f)-0.5)*2.0;
      }
      
      vec2 tent(vec2 p) {
        return vec2(tent(p.x), tent(p.y));
      }

      //needs tent
      ${ColorizeShaderCode.pre} 

      float hash(float seed) {
          float f = fract(sin(seed*13.0) + seed*8.9);
          //float f = fract(seed);
          return fract(1.0 / (f*0.0001 + 0.0000001));
      }

      float hash2(vec2 p) {
          p *= 1.0;
          float a = 0.445325234;// + 0.01*fract(Seed*0.1);
          
          p += tent(p*4.1234)*2.0 - 1.0;
          
          float f = p[0]*a + p[1]/a;
          
          f += Seed*100.0;
          
          return hash(f);
          return fract(f);
      }
        
      vec3 rgb_to_hsv(float r, float g, float b) {
        float computedH = 0.0;
        float computedS = 0.0;
        float computedV = 0.0;

        float minRGB = min(r, min(g, b));
        float maxRGB = max(r, max(g, b));

        // Black-gray-white
        if (minRGB == maxRGB) {
          return vec3(0, 0, minRGB); 
        }

        // Colors other than black-gray-white:
        float d = (r == minRGB) ? g - b : ((b == minRGB) ? r - g : b - r);
        float h = (r == minRGB) ? 3.0 : ((b == minRGB) ? 1.0 : 5.0);

        computedH = (60.0*(h - d/(maxRGB - minRGB)))/360.0;
        computedS = (maxRGB - minRGB)/maxRGB;
        computedV = maxRGB;

        return vec3(computedH, computedS, computedV);
      }
      
      vec3 hsv_to_rgb(float h, float s, float v) {
        float c = 0.0, m = 0.0, x = 0.0;

        h *= 360.0;

        c = v*s;
        x = c*(1.0 - abs(mod((h/60.0), 2.0) - 1.0));
        m = v - c;

        if (h >= 0.0 && h < 60.0) {
          return vec3(c + m, x + m, m);
        } else if (h >= 60.0 && h < 120.0) {
          return vec3(x + m, c + m, m);
        } else if (h >= 120.0 && h < 180.0) {
          return vec3(m, c + m, x + m);
        } else if (h >= 180.0 && h < 240.0) {
          return vec3(m, x + m, c + m);
        } else if (h >= 240.0 && h < 300.0) {
          return vec3(x + m, m, c + m);
        } else if (h >= 300.0 && h < 360.0) {
          return vec3(c + m, m, x + m);
        } else {
          return vec3(m, m, m);
        }

        return vec3(0.0, 0.0, 0.0);
      }
      
      
#ifndef NO_GRADIENT
        vec3 tsample(vec2 uv) {
          vec4 color = texture(rgba, uv);
          
          color.rgb /= color.a;
          color.a = 1.0;
          
          return color.rgb;
        }
        
        vec4 fsample(vec2 uv) {
          vec4 color;
          
#ifdef USE_SHARPNESS
          float du = 1.0 / iRes.x;
          float dv = 1.0 / iRes.y;
          
          float w1 = 2.0, w2, w3, w4, w5;
          
          w2 = w3 = w4 = w5 = -sharpness*0.5;
          
          color.a = 1.0;
          color.rgb = tsample(vCo)*w1
                    + tsample(vCo + vec2(-du, -dv))*w2
                    + tsample(vCo + vec2(-du, dv))*w3
                    + tsample(vCo + vec2(du, dv))*w3
                    + tsample(vCo + vec2(du, -dv))*w5;
                    
          color /= w1+w2+w3+w4+w5;
#else

          color = texture(rgba, uv);
          color.rgb /= color.a;
#endif
          
#ifdef CUSTOM_SHADER
          return color;
#endif 

          float value = color.r;
          
#ifdef COLOR_VARIANCE
        {
          vec4 var = texture(rgba2, vCo);
          if (var.w != 0.0) {
            value += varianceColorFac*(var.r+var.g+var.b)/(var.w*3.0);
          }
        } 
#endif

          color.rgb = colorize(value);
          color.a = 1.0;

#ifdef MULTIPLY_ORIG
          color.rgb *= pow(1.0-min(value, 1.0), MULTIPLY_ORIG_EXP);
#endif
          
#ifdef USE_CURVES
          color.rgb = ${CurveSet.getEvalCode("CURVE", "color.rgb")};
#endif
          color.rgb += (vec3(hash2(uv), hash2(uv+0.23423), hash2(uv+0.432))-0.5) / 255.0;
          return color;
        }
#else
        vec4 fsample(vec2 uv) {
          vec4 color = texture(rgba, uv).rgba;
          float f = color.r / color.a;

#ifndef USE_CURVES          
          f += (hash2(uv)-0.5)/255.0;
#endif

          color = vec4(f, f, f, 1.0);
          
#ifdef USE_CURVES
          color.rgb = ${CurveSet.getEvalCode("CURVE", "color.rgb")};
          color.rgb += (vec3(hash2(uv), hash2(uv+0.23423), hash2(uv+0.432))-0.5) / 255.0;
#endif
          
          return color;
        }
#endif        
        void main() {
#if 0 //def USE_SHARPNESS          
          float du = 1.0 / iRes.x;
          float dv = 1.0 / iRes.y;
          
          float w1 = 2.0, w2, w3, w4, w5;
          
          w2 = w3 = w4 = w5 = -sharpness*0.5;
          
          fragColor = fsample(vCo)*w1
                    + fsample(vCo + vec2(-du, -dv))*w2
                    + fsample(vCo + vec2(-du, dv))*w3
                    + fsample(vCo + vec2(du, dv))*w3
                    + fsample(vCo + vec2(du, -dv))*w5;
                    
          fragColor /= w1+w2+w3+w4+w5;
#else
          fragColor = fsample(vCo);
#endif        
  
  #ifdef PRINT_TEST
          vec3 hsv = rgb_to_hsv(fragColor.r, fragColor.g, fragColor.b);
          
          float cutoff = hsv[1]*0.5 + 0.5;
          cutoff = pow(cutoff, 0.5);
          
          
          float value = min(hsv[2], cutoff);
          float delta = abs(value - hsv[2]);
          
          hsv[2] = value;
          hsv[1] = max(hsv[1] - delta*0.5, 0.0);
          
          fragColor.rgb = hsv_to_rgb(hsv.r, hsv.g, hsv.b);
          
          //float f = abs(1.5-hsv[1]);
          //fragColor.rgb = vec3(f, f, f);
  #endif
           vec3 dither = (vec3(hash2(vCo), hash2(vCo+0.23423), hash2(vCo+0.432))-0.5) / 255.0;
           fragColor.rgb += dither;
        
  #ifdef SHOW_VARIANCE
      float eps = 0.0001; /* Offset slightly to avoid making 1.0 into 0.0. */
      
      vec4 col = texture(rgba2, vCo);
      col.rgb /= col.a;
      col.rgb = vec3(fract(col.r+eps), fract(col.g+eps), fract(col.b+eps));      
      fragColor = vec4(col.rgb, 1.0);
  #endif   
        }`.trim()
}

export const Shaders = {
  finalShader, fragmentBase
};
