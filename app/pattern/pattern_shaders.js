export var shaderHeaders = {
  webgl1 : `precision highp float;
#define texture texture2D

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

`.trim() + "\n",
  webgl2 : `#version 300 es
precision highp float;

#define varying VARYING
#define attribute ATTRIBUTE

out vec4 fragColor;
#define gl_FragColor fragColor
`
}

export function buildShader(shader, webgl2) {
  shader = Object.assign({}, shader);

  let header = webgl2 ? shaderHeaders.webgl2 : shaderHeaders.webgl1;

  if (webgl2) {
    shader.vertex = `
${header}
#define HAVE_WEBGL2
#define ATTRIBUTE in
#define VARYING out
${shader.vertex}
`.trim();

    shader.fragment = `
${header}
#define HAVE_WEBGL2
#define VARYING in
${shader.fragment}
`.trim();
  } else {
    shader.vertex = (header + "\n" + shader.vertex).trim();
    shader.fragment = (header + "\n" + shader.fragment).trim();
  }

  return shader;
}

const fragmentBase = {
  vertex    : `
      attribute vec2 co;
      attribute vec2 uv;
      
      varying vec2 vCo;
      varying vec2 vUv;
      
      void main() {
        gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
        
        vUv = uv;
        vCo = co;
      }`.trim(),
  uniforms  : {},
  attributes: ["co", "uv"],
  fragmentPre : `
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

varying vec2 vCo;//drawing rectangle coordinates
varying vec2 vUv;//possibly mapped coordinates

#define M_PI 3.141592654

float tent(float f) {
    return 1.0 - abs(fract(f)-0.5)*2.0;
}

vec2 tent(vec2 p) {
    return vec2(tent(p.x), tent(p.y));
}

float hash(float seed) {
    float f = fract(sin(seed*13.0) + seed*8.9);
    //float f = fract(seed);
    return fract(1.0 / (f*0.0001 + 0.0000001));
}

float hash2(vec2 p) {
    p *= 1.0;
    float a = 0.445325234;// + 0.01*fract(uSample*0.001);
    
    p += tent(p*4.1234)*2.0 - 1.0;
    
    float f = p[0]*a + p[1]/a;
    
    f += uSample;
    
    return hash(f);
    return fract(f);
}

float uhash2(vec2 p) {
    float f;
    
    f = hash2(p);
    //return f;
    f += hash2(p + vec2(2.234, 0.63));
    f += hash2(p + vec2(-10.8, 0.95));
    
    //f = pow(f, 1.0/3.0);
    f /= 3.0;
    
    //f *= f*f*f*f;
    
    return f*2.0 - 1.0;
}

  `.trim(),
  fragment  : `
float mainImage( vec2 uv, out float w) {    
#ifdef PER_PIXEL_RANDOM
    float dx = uhash2(uv);
    float dy = uhash2(-uv + 2.43223);
#else
    float dx = uhash2(vec2(0.,0.));
    float dy = uhash2(-vec2(0.,0.) + 2.432);
    
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
    //w = max(1.0 - length(vec2(dx, dy)) / sqrt(2.0), 0.0) + 0.25;
    //w = w*w*(3.0 - 2.0*w);
    //w = w*w;
    w = 1.0;
#endif

    uv += filterw*vec2(dx, dy);

    float f = pattern(uv[0], uv[1]);

    // Output to screen
    vec4 color = vec4(f, f, f, 1.0);
    
    if (isnan(f) || f+f != 2.0*f) {
      f = 0.5; 
    }
    
    return f;
}

void main() {
  float w;
  
  float f = mainImage(vUv*iRes, w);
  
  vec2 uv = vCo;
  vec4 color;
  
  color = vec4(f, f, f, 1.0) * w;
  
  vec4 old = texture(rgba, uv);
  gl_FragColor = color + old*enableAccum;
}

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
  fragment  :`
        uniform sampler2D rgba;
        uniform vec2 iRes;
        uniform float sharpness;
        uniform float SLIDERS[MAX_SLIDERS];
        uniform float T;
        
        varying vec2 vCo;

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

      float tent(float f) {
        return 1.0 - abs(fract(f)-0.5)*2.0;
      }
      
      vec2 tent(vec2 p) {
        return vec2(tent(p.x), tent(p.y));
      }

      float hash(float seed) {
          float f = fract(sin(seed*13.0) + seed*8.9);
          //float f = fract(seed);
          return fract(1.0 / (f*0.0001 + 0.0000001));
      }

      float hash2(vec2 p) {
          p *= 1.0;
          float a = 0.445325234;// + 0.01*fract(T*0.1);
          
          p += tent(p*4.1234)*2.0 - 1.0;
          
          float f = p[0]*a + p[1]/a;
          
          f += T*100.0;
          
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
          
#ifndef OLD_GRADIENT
          float f = color.r;

          color.r = evalgrad(f, rgrad);
          color.g = evalgrad(f, ggrad);
          color.b = evalgrad(f, bgrad);
          color.a = 1.0;
#else
          float f = color.r + VALUE_OFFSET;
          
          f = mix(f*1.5, pow(f, 1.0 / GAIN), 0.5);
          f = tent(f*COLOR_SCALE+0.5);
          
          float off = COLOR_SHIFT;
          float f2 = f*pow(off*0.05, 0.25) + off + 0.45;
          
          color.r = tent(f2);
          color.g = tent(f2*2.0+0.234);
          color.b = tent(f2*3.0+0.7324);
          color.a = 1.0;
          
          color.rgb = normalize(color.rgb);
          //color.b *= 0.1;
          color.rgb *= f*1.5*BRIGHTNESS;
          //color.rgb = vec3(f, f, f)*BRIGHTNESS*1.5;
         
#endif

#ifdef MULTIPLY_ORIG
          color.rgb *= pow(1.0-min(value, 1.0), MULTIPLY_ORIG_EXP);
#endif          
          color.rgb += (vec3(hash2(uv), hash2(uv+0.23423), hash2(uv+0.432))-0.5) / 255.0;
          return color;
        }
#else
        vec4 fsample(vec2 uv) {
          vec4 color = texture(rgba, uv).rgba;
          float f = color.r / color.a;
          f *= 3.0;
          f += (hash2(uv)-0.5)/255.0;
          
          return vec4(f, f, f, 1.0);
        }
#endif        
        void main() {
#if 0 //def USE_SHARPNESS          
          float du = 1.0 / iRes.x;
          float dv = 1.0 / iRes.y;
          
          float w1 = 2.0, w2, w3, w4, w5;
          
          w2 = w3 = w4 = w5 = -sharpness*0.5;
          
          gl_FragColor = fsample(vCo)*w1
                    + fsample(vCo + vec2(-du, -dv))*w2
                    + fsample(vCo + vec2(-du, dv))*w3
                    + fsample(vCo + vec2(du, dv))*w3
                    + fsample(vCo + vec2(du, -dv))*w5;
                    
          gl_FragColor /= w1+w2+w3+w4+w5;
#else
          gl_FragColor = fsample(vCo);
#endif        
  
  #ifdef PRINT_TEST
          vec3 hsv = rgb_to_hsv(gl_FragColor.r, gl_FragColor.g, gl_FragColor.b);
          
          float cutoff = hsv[1]*0.5 + 0.5;
          cutoff = pow(cutoff, 0.5);
          
          
          float value = min(hsv[2], cutoff);
          float delta = abs(value - hsv[2]);
          
          hsv[2] = value;
          hsv[1] = max(hsv[1] - delta*0.5, 0.0);
          
          gl_FragColor.rgb = hsv_to_rgb(hsv.r, hsv.g, hsv.b);
          
          //float f = abs(1.5-hsv[1]);
          //gl_FragColor.rgb = vec3(f, f, f);
  #endif
           vec3 dither = (vec3(hash2(vCo), hash2(vCo+0.23423), hash2(vCo+0.432))-0.5) / 255.0;
           gl_FragColor.rgb += dither;
           
        }`.trim()
}

export const Shaders = {
  finalShader, fragmentBase
};
