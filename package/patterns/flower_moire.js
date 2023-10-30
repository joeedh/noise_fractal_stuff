import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';

const shaderPre = `
//#define cos(x) (tent((x)/(2.0*M_PI))*2.0-1.0)
//#define sin(x) (tent(0.5+(x)/(2.0*M_PI))*2.0-1.0)

float flower_pattern$(float x, float y) {
    float f;
    
    f = length(vec2(x, y));
    if (f > 1.414) 
        return 0.0;
        
    f *= f;
    f += atan(y, x)/M_PI/8.0;
    
    return fract(f*12.0);
}


float flower_samplef$(float x, float y, float k, float seed1) {
    float seed2 = seed1*2.0;

    float a1 = ctent(x);
    float a2 = ctent(y);
    float a3 = ctent(cos(seed1)*x + sin(seed1)*y);
    float a4 = ctent(cos(seed1)*y - sin(seed1)*x);
    float a5 = ctent(cos(seed2)*x + sin(seed2)*y);
    float a6 = ctent(cos(seed2)*y - sin(seed2)*x);
    
    
    return (a1+a2+a3+a4+a5+a6)/6.0;
    
    float dx = ctent(x*cos(seed1) + y*sin(seed1));
    float dy = ctent(y*cos(seed1) - x*sin(seed1));
    float gx = ctent(x), gy = ctent(y);
    
    //return smin(dx*gx, dy*gy, 10.0);
    //return (dx*dx+dy*dy+gx*gx+gy*gy)/4.0;
    return (dx*gx + dy*gy)*0.5;
    //return (dx+dy+gx+gy)*0.25;
    
    float x2 = x + 0.2, y2 = y - 0.5;
    
    float a = cos((x*x + y*y)*k);
    float b = cos((x2*x2 + y2*y2)*k);
    return (a+b)*0.25+0.5;
}

`
const shader = `

float pattern(float ix, float iy) {
  int i;

  vec2 uv = vec2(ix, iy)/iRes;
  
  uv = uv*2.0 - 1.0;
  uv.x *= aspect;
  
  float scale = SLIDERS[6];
  
  const float scale2 = 6.0;
  
  uv.x += SLIDERS[7];
  uv.y += SLIDERS[8];

  uv *= scale*scale2;
  
  vec2 startuv = uv;
  
  float k = SLIDERS[9], df = 0.0005;
  float ff = flower_samplef$(uv.x, uv.y, k, SLIDERS[1]);
  float dx = (flower_samplef$(uv.x+df, uv.y, k, SLIDERS[1]) - ff) / df;
  float dy = (flower_samplef$(uv.x, uv.y+df, k, SLIDERS[1]) - ff) / df;
  
  //return fract(ff*k);
  float x2 = fract(ff*k);
  float y2 = fract(k*atan(dy, dx)/M_PI);
  
  return flower_pattern$((x2-0.5)*0.5, (y2-0.5)*0.5);
  //return startuv[1] < -0.1 ? x2 : y2;
}


`


export class FlowerMoire extends Pattern {
  constructor() {
    super();

    this.sharpness = 0.45; //use different default sharpness
  }

  static patternDef() {
    return {
      typeName     : "flower_moire",
      uiName       : "Flower Moire",
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
          name : "steps",
          type : "int",
          range: [5, 955],
          value: 15,
          speed: 7.0,
          exp  : 1.5,
        },//0
        {name: "offset", value: 5.5, range: [-5.5, 15.5]}, //1
        {name: "gain", value: 2.0, range: [0.001, 1000], speed: 4.0, exp: 2.0},  //2
        {name: "color", value: 0.7, range: [-50, 50], speed: 0.25, exp: 1.0}, //3
        {name: "colorscale", value: 0.5},//4
        {name: "brightness", value: 1.0, range: [0.001, 10.0]}, //5
        {name: "scale", value: 0.7, range: [0.001, 1000000.0]}, //6
        {name: "x", value: -0.42},  //7
        {name: "y"},  //8
        {name: "offset2", value: 2.85}, //9
        {name: "offset3", value: 0.85}, //10
        {name: "offset4"}, //11
      ],
      shader,
      shaderPre,
    }
  }

  setup(ctx, gl, uniforms, defines) {
    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[4]";
    defines.BRIGHTNESS = "SLIDERS[5]";
    defines.STEPS = ~~this.sliders[0];
  }

  viewportDraw(ctx, gl, uniforms, defines) {
    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  copyTo(b) {
    super.copyTo(b);
  }
}

FlowerMoire.STRUCT = nstructjs.inherit(FlowerMoire, Pattern) + `
}`;

Pattern.register(FlowerMoire);
