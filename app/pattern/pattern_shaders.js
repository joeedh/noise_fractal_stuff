const fragmentBase = {
  vertex    : `
      #version 300 es
      precision highp float;
      in vec2 co;
      out vec2 vCo;
      
      void main() {
        gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
        vCo = co;
      }`.trim(),
  uniforms  : {},
  attributes: ["co"],
  fragment  : `#version 300 es
      precision highp float;
uniform vec2 iRes;
uniform vec2 iInvRes;
uniform float aspect;
uniform float SLIDERS[MAX_SLIDERS];
uniform float T;
uniform float enableAccum;
uniform float filterWidth;
uniform float sharpness;

uniform sampler2D rgba;

in vec2 vCo;

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
    float a = 0.445325234;// + 0.01*fract(T*0.1);
    
    p += tent(p*4.1234)*2.0 - 1.0;
    
    float f = p[0]*a + p[1]/a;
    
    f += T*100.0;
    
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

$PATTERN_HERE

float mainImage( vec2 uv, out float w) {    
#ifdef PER_PIXEL_RANDOM
    float dx = uhash2(uv);
    float dy = uhash2(-uv + 2.43223);
#else
    float dx = uhash2(vec2(0.,0.));
    float dy = uhash2(-vec2(0.,0.) + 2.432);
    
    //dx = fract(T*100.0)*2.0 - 1.0;
    //dy = fract(T*100.0+0.45)*2.0 - 1.0;
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
    
    return f;
}

out vec4 fragColor;

void main() {
  float w;
  
  float f = mainImage(vCo*iRes, w);
  
  vec2 uv = vCo;
  vec4 color;
  
  color = vec4(f, f, f, 1.0) * w;
  
  vec4 old = texture(rgba, uv);
  fragColor = color + old*enableAccum;
}

`.trim()
};
const finalShader = {
  vertex    : `
      #version 300 es
      precision highp float;
      in vec2 co;
      out vec2 vCo;
      
      void main() {
        gl_Position = vec4((co-0.5)*2.0, 0.0, 1.0);
        vCo = co;
      }`.trim(),
  uniforms  : {},
  attributes: ["co"],
  fragment  :
    `#version 300 es
        precision highp float;
        
        uniform sampler2D rgba;
        uniform vec2 iRes;
        uniform float sharpness;
        uniform float SLIDERS[11];
        uniform float T;
        
        in vec2 vCo;
        out vec4 fragColor;

        #ifndef OLD_GRADIENT
        uniform float rgrad[GRAD_STEPS];
        uniform float ggrad[GRAD_STEPS];
        uniform float bgrad[GRAD_STEPS];
        uniform float agrad[GRAD_STEPS];
        #endif
        
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

        vec4 fsample(vec2 uv) {
          vec4 color = texture(rgba, uv).rgba;
          
          color.rgb /= color.a;

#ifndef OLD_GRADIENT
          float f = color.r;

          color.r = evalgrad(f, rgrad);
          color.g = evalgrad(f, ggrad);
          color.b = evalgrad(f, bgrad);
          color.a = 1.0;
#else
          float f = color.r;
          
          f = mix(f*1.5, pow(f, 1.0 / SLIDERS[2]), 0.5);
          f = tent(f*SLIDERS[7]+0.5);
          
          float off = SLIDERS[3];
          float f2 = f*pow(off*0.05, 0.25) + off + 0.45;
          
          color.r = tent(f2);
          color.g = tent(f2*2.0+0.234);
          color.b = tent(f2*3.0+0.7324);
          color.a = 1.0;
          
          color.rgb = normalize(color.rgb);
          //color.b *= 0.1;
          color.rgb *= f*1.5*SLIDERS[8];
          //color.rgb = vec3(f, f, f)*SLIDERS[8]*1.5;
         
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
#ifdef USE_SHARPNESS          
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
        }`.trim()
}

export const Shaders = {
  finalShader, fragmentBase
};
