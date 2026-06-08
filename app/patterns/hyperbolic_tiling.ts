import {Pattern, PatternDef, PresetText, DefineMap} from '../pattern/pattern.js';
import {
  nstructjs, util, DataAPI, DataStruct, Container
} from '../path.ux/scripts/pathux.js';
import {savePreset, Preset} from '../pattern/preset.js';
import {UniformMap} from '../pattern/pattern_shaders.js';
import type {ToolContext} from '../core/context.js';

export const HyperbolicTilingPresets: Preset[] = [];

let nameBase = 1;

export function add_preset(sliders: number[], opt: Record<string, number | boolean> = {}): void {
  let pat = new HyperbolicTilingPattern();

  for (let k in opt) {
    let v = opt[k]
    if (k === "tiling_type" || k === "modulation_mode") {
      if (typeof v === "number") pat[k] = v
    }
  }

  let ilen = Math.min(sliders.length, pat.sliders.length);
  for (let i = 0; i < ilen; i++) {
    pat.sliders[i] = sliders[i];
  }

  let name = "Builtin " + (nameBase++);

  let preset = savePreset(pat, name, "Builtin");
  HyperbolicTilingPresets.push(preset);
}

export const TilingTypes = {
  HEPTAGON: 0,  // {7,3} - 7-fold symmetry
  OCTAGON: 1,   // {8,3} - 8-fold symmetry
  DODECAGON: 2, // {12,3} - 12-fold symmetry
};

export const ModulationModes = {
  NONE: 0,
  SPIRAL: 1,
  WAVE: 2,
  ROTATE: 3,
};

const shaderPre = `
// Poincaré disk operations
float poincare_dist(vec2 p1, vec2 p2) {
  float r1 = length(p1);
  float r2 = length(p2);
  float dr = length(p1 - p2);

  if (dr < 0.0001) return 0.0;

  return acosh(1.0 + 2.0 * dr * dr / ((1.0 - r1*r1) * (1.0 - r2*r2)));
}

// Angle in hyperbolic space at origin
float poincare_angle(vec2 p) {
  return atan(p.y, p.x);
}

// Radial distance in hyperbolic space
float poincare_radius(vec2 p) {
  float r = length(p);
  if (r >= 1.0) return 1e10;
  return atanh(r);
}

// Distance from point to nearest line in tiling
float dist_to_tile_edge(vec2 p, float angle, float symmetry) {
  float a = poincare_angle(p);
  float sector_angle = 2.0 * M_PI / symmetry;
  float a_mod = mod(a + sector_angle * 0.5, sector_angle) - sector_angle * 0.5;
  return abs(a_mod) - 0.001;
}

// Smooth step with variable smoothness
float smoothstep_smooth(float edge0, float edge1, float x, float softness) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t) + softness * 0.1;
}
`;

const shader = `
float pattern(float ix, float iy) {
  vec2 p = vec2(ix, iy) * iInvRes * 2.0 - 1.0;
  p.x *= aspect;

  // Apply zoom and pan
  p.x += SLIDERS[4];
  p.y += SLIDERS[5];
  p *= SLIDERS[6];

  // Clamp to Poincaré disk
  float r = length(p);
  if (r > 0.99) {
    return 0.0;
  }

  // Get hyperbolic angle and radius
  float h_angle = poincare_angle(p);
  float h_radius = poincare_radius(p);

  float symmetry = SLIDERS[0]; // 7, 8, or 12 fold
  float sector_angle = 2.0 * M_PI / symmetry;

  // Get tile index from angle
  float angle_normalized = mod(h_angle + M_PI, 2.0 * M_PI);
  float tile_idx = floor(angle_normalized / sector_angle);

  // Quasiperiodic modulation
  float phase = 0.0;
#if MODULATION == 1
  // Spiral
  phase = h_radius * SLIDERS[7] + h_angle * SLIDERS[8];
#elif MODULATION == 2
  // Wave
  phase = sin(h_radius * SLIDERS[7]) * cos(h_angle * SLIDERS[8]);
#elif MODULATION == 3
  // Rotation
  phase = sin(h_radius * SLIDERS[7] + h_angle * SLIDERS[8]);
#endif

  // Tile coloring based on sector
  float base_color = (tile_idx + sin(phase) * SLIDERS[9]) / symmetry;

  // Add some fractal detail based on radial distance
  float detail = fract(h_radius * SLIDERS[1] + phase);
  detail = detail * detail * (3.0 - 2.0 * detail);

  // Distance to nearest sector boundary for edge effects
  float a_mod = mod(h_angle + sector_angle * 0.5, sector_angle) - sector_angle * 0.5;
  float edge_dist = abs(a_mod) / (sector_angle * 0.5);
  edge_dist = smoothstep(SLIDERS[2], SLIDERS[3], edge_dist);

  float f = mix(detail, base_color, SLIDERS[10]);
  f = mix(f, edge_dist, 1.0 - SLIDERS[10]);

  return f;
}
`;

export class HyperbolicTilingPattern extends Pattern {
  tiling_type: number
  modulation_mode: number

  constructor() {
    super();

    this.tiling_type = TilingTypes.HEPTAGON;
    this.modulation_mode = ModulationModes.SPIRAL;

    this.filter_width = 0.0;
  }

  static patternDef(): PatternDef {
    return {
      typeName     : "hyperbolic_tiling",
      uiName       : "Hyperbolic Tiling",
      offsetSliders: {
        x    : 4,
        y    : 5,
        scale: 6
      },
      presets      : HyperbolicTilingPresets,
      sliderDef    : [
        {name: "symmetry", value: 7.0, range: [3, 12], type: "int"}, //0
        {name: "detail", value: 3.0, range: [0.1, 20], speed: 0.5}, //1
        {name: "edge_thresh_lo", value: 0.1, range: [0, 1], speed: 0.02}, //2
        {name: "edge_thresh_hi", value: 0.4, range: [0, 1], speed: 0.02}, //3
        {name: "x"}, //4
        {name: "y"}, //5
        {name: "scale", value: 2.0, range: [0.1, 10]}, //6
        {name: "spiral_radius", value: 2.0, range: [0, 10]}, //7
        {name: "spiral_angle", value: 1.5, range: [0, 10]}, //8
        {name: "phase_mix", value: 0.5, range: [0, 1]}, //9
        {name: "color_mix", value: 0.6, range: [0, 1]}, //10
        {name: "valoffset", value: 0.0, noReset: true}, //11
      ],
      shader,
      shaderPre,
    }
  }

  static apiDefine(api: DataAPI): DataStruct | undefined {
    let st = super.apiDefine(api);

    if (!st) {
      return st;
    }

    function onchange(this: {dataref: Pattern}) {
      this.dataref.drawGen++;
      window.redraw_viewport();
    }

    st.enum("tiling_type", "tiling_type", TilingTypes, "Tiling Type")
      .on('change', onchange);
    st.enum("modulation_mode", "modulation_mode", ModulationModes, "Modulation Mode")
      .on('change', onchange);

    return st;
  }

  static buildSidebar(ctx: ToolContext, con: Container): void {
    super.buildSidebar(ctx, con);

    con.prop("tiling_type");
    con.prop("modulation_mode");
  }

  savePresetText(opt: PresetText = {}): string {
    opt.tiling_type = opt.tiling_type ?? this.tiling_type;
    opt.modulation_mode = opt.modulation_mode ?? this.modulation_mode;

    let optStr = JSON.stringify(opt);
    let sliders = JSON.stringify(util.list(this.sliders));

    return `
add_preset(${sliders}, ${optStr});
    `.trim();
  }

  copyTo(b: Pattern): void {
    super.copyTo(b);

    if (b instanceof HyperbolicTilingPattern) {
      b.tiling_type = this.tiling_type;
      b.modulation_mode = this.modulation_mode;
    }
  }

  setup(_ctx: ToolContext, _gl: AppGL, _uniforms: UniformMap, defines: DefineMap): void {
    defines.MODULATION = this.modulation_mode;
    defines.VALUE_OFFSET = "SLIDERS[11]";
    defines.GAIN = "1.0";
    defines.COLOR_SHIFT = "SLIDERS[10]";
    defines.COLOR_SCALE = "1.0";
    defines.BRIGHTNESS = "1.0";
  }
}

HyperbolicTilingPattern.STRUCT = nstructjs.inherit(HyperbolicTilingPattern, Pattern) + `
  tiling_type      : int;
  modulation_mode  : int;
}`;
Pattern.register(HyperbolicTilingPattern);
