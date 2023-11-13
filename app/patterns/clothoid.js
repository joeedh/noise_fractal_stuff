import {Pattern, PatternFlags} from '../pattern/pattern.js';
import {
  Vector2, Vector3, nstructjs, util, math, Matrix4, Quat, Vector4
} from '../path.ux/pathux.js';
import {savePreset} from '../pattern/preset.js';

export const ClothoidPresets = [];

let nameBase = 1;

export function add_preset(sliders, opt = {}) {
  let pat = new ClothoidPattern();

  for (let k in opt) {
    pat[k] = opt[k];
  }

  let ilen = Math.min(sliders.length, pat.sliders.length);
  for (let i = 0; i < ilen; i++) {
    pat.sliders[i] = sliders[i];
  }

  let name = "Builtin " + (nameBase++);

  let preset = savePreset(pat, name, "Builtin");
  ClothoidPresets.push(preset);
}

const shaderPre = `
`;

const shader = `

float pattern(float ix, float iy) {
  vec2 p = vec2(ix, iy)*iInvRes*2.0 - 1.0;
  p.x *= aspect;
  
  p.x += SLIDERS[6];
  p.y += SLIDERS[7];
  p *= SLIDERS[8];
  
  float k1 = p.x*SLIDERS[10];
  float k2 = p.y*SLIDERS[10];
  
  float th = 0.0;
  
  vec2 p2 = p;
  float ds = 1.0 / float(STEPS);
  float s = 0.0;
  float f2 = 0.0;
  vec2 lastp = p2;
  
  for (int i=0; i<STEPS; i++) {
    float k = k1 + (k2 - k1) * s;
    th += k*ds;
    
    float dx = cos(th)*SLIDERS[12];
    float dy = sin(th)*SLIDERS[12];
    
    float dk = (k2 - k1) * SLIDERS[12];
    
    p2.x += dx*ds - 0.5*dy*ds*ds*dk;
    p2.y += dy*ds + 0.5*dx*ds*ds*dk;
        
    lastp = p2;
    s += ds;  
  }
  
  return fract(length(p - p2)*SLIDERS[11]);
}
`;

export class ClothoidPattern extends Pattern {
  constructor() {
    super();
  }

  static patternDef() {
    return {
      typeName     : "clothoid",
      uiName       : "Clothoid",
      offsetSliders: {
        x    : 6,
        y    : 7,
        scale: 8
      },
      presets      : ClothoidPresets,
      sliderDef    : [
        {name: "steps", value: 15, range: [1, 575], type: "int"}, //0
        {name: "theta", value: -0.75, speed: 0.05, range: [-Math.PI, Math.PI]}, //1
        {name: "gain", value: 1.1, range: [0, 750]}, //2
        {name: "color", value: 0.65, range: [0, 10]}, //3
        {name: "colorscale", value: 1.02, range: [0, 1000]}, //4
        {name: "brightness", value: 1.0, range: [0, 1000]}, //5
        {name: "x"}, //6
        {name: "y"}, //7
        {name: "scale", value: 18.0}, //8
        {name: "value", value: 0.0}, //9
        {name: "offset1", value: 1.0}, //10
        {name: "offset2", value: 1.0}, //11
        {name: "offset3", value: 1.0}, //12
        {name: "offset4", value: 1.0}, //13
      ],
      shader,
      shaderPre,
    }
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    function onchange() {
      this.dataref.drawGen++;
      window.redraw_viewport();
    }

    return st;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);
  }

  savePresetText(opts = {}) {
    opts = JSON.stringify(opts);
    let sliders = JSON.stringify(util.list(this.sliders));

    return `
add_preset(${sliders}, ${opts});
    `.trim();
  }

  copyTo(b) {
    super.copyTo(b);
  }

  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    let f = isNaN(Math.pow(2.0, this.sliders.exp));
    this.enableAccum = !isNaN(f) && isFinite(f);

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  setup(ctx, gl, uniforms, defines) {
    if (this.square_f) {
      defines.SQUARE_F = null;
    }

    defines.VALUE_OFFSET = "SLIDERS[9]";

    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[4]";
    defines.BRIGHTNESS = "SLIDERS[5]";
    defines.STEPS = Math.floor(this.sliders.steps);
  }
}

ClothoidPattern.STRUCT = nstructjs.inherit(ClothoidPattern, Pattern) + `
}`;
Pattern.register(ClothoidPattern);
