import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';

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
    
    vec2 tv = vec2(tent(uv.x), tent(uv.y));
    //uv += tv*SLIDERS[9];
    
    const int steps = STEPS*20;
    int x = int(uv.x*float(steps));
    int y = int(uv.y*float(steps));
    
    x = x ^ y;
    
    float f = float(x) / float(steps);
    return tent(f*SLIDERS[1]);
}

`


export class MultNoise extends Pattern {
  constructor() {
    super();

    this.sharpness = 0.33; //use different default sharpness
  }

  static patternDef() {
    return {
      typeName     : "xor",
      uiName       : "XOR",
      flag         : 0,
      description  : "",
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
          value: 300,
          speed: 7.0,
          exp  : 1.5,
        },//0
        {name: "offset", value : 4.02, range : [-5.5, 15.5]}, //1
        {name: "gain", value: 6.0, range: [0.001, 1000], speed: 4.0, exp: 2.0},  //2
        {name: "color", value: 0.91, range: [-50, 50], speed: 0.25, exp: 1.0}, //3
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

MultNoise.STRUCT = nstructjs.inherit(MultNoise, Pattern) + `
}`;

Pattern.register(MultNoise);
