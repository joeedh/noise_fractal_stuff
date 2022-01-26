import {Pattern, PatternFlags} from '../pattern/pattern.js';
import {
  Vector2, Vector3, nstructjs, util, math, Matrix4, Quat, Vector4
} from '../path.ux/pathux.js';
import {savePreset} from '../pattern/preset.js';

export const MoirePresets = [];

let nameBase = 1;

export function add_preset(sliders, opt={}) {
  let pat = new MoirePattern();

  for (let k in opt) {
    pat[k] = opt[k];
  }

  let ilen = Math.min(sliders.length, pat.sliders.length);
  for (let i=0; i<ilen; i++) {
    pat.sliders[i] = sliders[i];
  }

  let name = "Builtin " + (nameBase++);

  let preset = savePreset(pat, name, "Builtin");
  MoirePresets.push(preset);
}

export const MoireFuncs = {
  SUM : 0,
  DIST: 1,
  MUL : 2,
  MIN : 3,
  MAX : 4,
};

export const BandModes = {
  NONE   : 0,
  SIMPLE : 1,
  OVERLAY: 2
};

export const SmoothFuncs = {
  LINEAR    : 0,
  SQUARE    : 1,
  SMOOTHSTEP: 2,
  GUASSIAN  : 3
};

const shaderPre = `
float cosfunc(float f) {
  //return tent(f/2.0/M_PI)*2.0-1.0;
  return cos(f);
}

float sinfunc(float f) {
  return cos(f - M_PI*0.5);
  //return sin(f);
}


float band(vec2 p, float th) {
  float f = cosfunc(th)*p.x + sinfunc(th)*p.y;
  
  f = tent(f); 

  return f;
}

float band_sqr(vec2 p, float th) {
  float f = cosfunc(th)*p.x + sinfunc(th)*p.y;
  
  f = tent(f); 

  return f*f;
}

float band_smooth(vec2 p, float th) {
  float f = cosfunc(th)*p.x + sinfunc(th)*p.y;
  
  f = tent(f); 

  return f*f*(3.0 - 2.0*f);
}

float band_exp(vec2 p, float th) {
  float f = cosfunc(th)*p.x + sinfunc(th)*p.y;
  
  f = tent(f); 

  return 1.0 - exp(-f*f*3.0);
}

`;

const shader = `

float pattern(float ix, float iy) {
  vec2 p = vec2(ix, iy)*iInvRes*2.0 - 1.0;
  p.x *= aspect;
  
  p.x += SLIDERS[6];
  p.y += SLIDERS[7];
  p *= SLIDERS[8];
  
  float th = SLIDERS[1]*M_PI;//floor(SLIDERS[0]);
  float thscale = th*SLIDERS[9];//float(STEPS);
  
  float f;
  float fsum = 0.0; 

#if FUNC == 2 || FUNC == 3
  f = 1.0;
#endif
  
  th = 0.0;
  
  for (int i=0; i<=STEPS; i++) {
#if SMOOTHFUNC == 1
    float f2 = band_sqr(p, th);
#elif SMOOTHFUNC == 2
    float f2 = band_smooth(p, th);
#elif SMOOTHFUNC == 3
    float f2 = band_exp(p, th);
#else
    float f2 = band(p, th);
#endif
    th += thscale;
    
    p = p*SLIDERS[10];
    
    float w = 1.0;

#if FUNC == 0    
    f += pow(f2, SLIDERS[12])*w;
#elif FUNC == 1
    f += f2*f2*w;
#elif FUNC == 2
    f *= f2;
#elif FUNC == 3
    f = min(f, f2);
#elif FUNC == 4
    f = max(f, f2);
#endif

    fsum += w;
  }

#if FUNC == 0
  f /= fsum;
#elif FUNC == 1
  f = sqrt(f) / sqrt(fsum);
#elif FUNC == 2
  f = pow(f, 1.0/fsum);
#elif FUNC == 3 || FUNC == 4
#endif

#if BAND_MODE == 1 || BAND_MODE == 2
  float f3;
  f3 = floor(0.5 + f*floor(SLIDERS[11]))/floor(SLIDERS[11]);

#if BAND_MODE == 2
  f = sqrt(f*f3);
#else
  f = f3;
#endif
#endif

  return f;// + SLIDERS[3];
}
`;

export class MoirePattern extends Pattern {
  constructor() {
    super();

    this.moire_func = MoireFuncs.SUM;
    this.band_mode = BandModes.NONE;
    this.smooth_func = SmoothFuncs.SMOOTHSTEP;

    this.filter_width = 0.0; //from parent class
  }

  static patternDef() {
    return {
      typeName     : "moire",
      uiName       : "Moire",
      offsetSliders: {
        x    : 6,
        y    : 7,
        scale: 8
      },
      presets      : MoirePresets,
      sliderDef    : [
        {name: "steps", value: 3.0001, range: [1, 75]}, //0
        {name: "theta", value: -0.75, speed: 0.05, range: [-Math.PI, Math.PI]}, //1
        {name: "gain", value: 1.1, range: [0, 750]}, //2
        {name: "color", value: 0.65, range: [0, 10]}, //3
        {name: "colorscale", value: 1.02, range: [0, 1000]}, //4
        {name: "brightness", value: 1.0, range: [0, 1000]}, //5
        {name: "x"}, //6
        {name: "y"}, //7
        {name: "scale", value: 18.0}, //8
        {name: "offset1", value: 1.0}, //9
        {name: "offset2", value: 1.0}, //10
        {name: "bands", value: 5.0, range: [1.0, 100.0], speed: 1.5}, //11
        {name: "exp", value: 1.0, desription: "exponent for SUM mode", range: [-2.0, 100.0], speed: 0.5}, //12
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

    st.enum("moire_func", "moire_func", MoireFuncs, "Func")
      .on('change', onchange);
    st.enum("band_mode", "band_mode", BandModes, "Band Mode")
      .on('change', onchange);
    st.enum("smooth_func", "smooth_func", SmoothFuncs, "Smooth Func")
      .on('change', onchange);

    return st;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    con.prop("moire_func");
    con.prop("smooth_func");
    con.prop("band_mode");
  }

  savePresetText(opts = {}) {
    opts.moire_func = opts.moire_func ?? this.moire_func;
    opts.square_f = opts.square_f ?? this.square_f;
    opts.band_mode = opts.band_mode ?? this.band_mode;

    opts = JSON.stringify(opts);
    let sliders = JSON.stringify(util.list(this.sliders));

    return `
add_preset(${sliders}, ${opts});
    `.trim();
  }

  copyTo(b) {
    super.copyTo(b);

    b.moire_func = this.moire_func;
    b.square_f = this.square_f;
    b.band_mode = this.band_mode;
    b.smooth_func = this.smooth_func;
  }

  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    let f = isNaN(Math.pow(2.0, this.sliders.exp));
    this.enableAccum = !isNaN(f) && isFinite(f);

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  setup(ctx, gl, uniforms, defines) {
    defines.FUNC = this.moire_func;

    if (this.square_f) {
      defines.SQUARE_F = null;
    }

    defines.BAND_MODE = this.band_mode;
    defines.SMOOTHFUNC = this.smooth_func;

    defines.GAIN = "SLIDERS[2]";
    defines.COLOR_SHIFT = "SLIDERS[3]";
    defines.COLOR_SCALE = "SLIDERS[4]";
    defines.BRIGHTNESS = "SLIDERS[5]";
    defines.STEPS = Math.floor(this.sliders.steps);
  }
}

MoirePattern.STRUCT = nstructjs.inherit(MoirePattern, Pattern) + `
  moire_func     : int;
  square_f       : bool;
  band_mode      : int;
  smooth_func    : int;
}`;
Pattern.register(MoirePattern);
