import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';
import {savePreset} from '../pattern/preset.js';

export const NewtonPresets = [];

let presetCountBase = 1;

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
    
    uv = uv*2.0 - 1.0;
    uv.x *= aspect;
    
    uv.x += SLIDERS[7];
    uv.y += SLIDERS[8];//+0.5*SLIDERS[6];

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

    this.sharpness = 0.33; //use different default sharpness
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
      presets      : [],
      sliderDef    : [
        {
          name : "steps", integer: true,
          range: [5, 955],
          value: 800,
          speed: 7.0,
          exp  : 1.5,
        },//0
        {name: "offset", value : 0.0, range : [-5.5, 15.5]}, //1
        {name: "gain", value: 6.0, range: [0.001, 1000], speed: 4.0, exp: 2.0},  //2
        {name: "color", value: 0.75, range: [-50, 50], speed: 0.25, exp: 1.0}, //3
        {name: "colorscale", value: 1.4},//4
        {name: "brightness", value: 1.0, range: [0.001, 10.0]}, //5
        {name: "scale", value: 1.75, range: [0.001, 1000000.0]}, //6
        {name: "x", value : -0.42},  //7
        {name: "y"},  //8
        {name: "offset2"}, //9
        {name: "offset3", value : 0.85}, //10
        {name: "offset4"}, //11
      ],
      shader
    }
  }

  setup(ctx, gl, uniforms, defines) {
    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[4]";
    defines.BRIGHTNESS = "SLIDERS[5]";
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    defines.STEPS = ~~this.sliders[0];

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b) {
    super.copyTo(b);
  }
}

MandelbrotPattern.STRUCT = nstructjs.inherit(MandelbrotPattern, Pattern) + `
}`;

Pattern.register(MandelbrotPattern);
