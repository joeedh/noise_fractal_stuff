import {EnumProperty, util, nstructjs, Curve1D, PackFlags} from '../path.ux/pathux.js';
import {renderPattern} from './pattern_draw.js';
import {ShaderProgram, RenderBuffer} from '../webgl/webgl.js';
import {buildShader, Shaders, CurveSet} from './pattern_shaders.js';
import {loadPreset, presetManager, savePreset} from './preset.js';

export {CurveSet} from './pattern_shaders.js';

import {PatternClasses} from './pattern_base.js';
import {getBlueMaskTex, blueMaskValid} from './bluemask.js';
import {SliderParam, Sliders, SliderTypeMap, SliderTypes} from './pattern_types.js';

export {PatternClasses} from './pattern_base.js';

let CachedPatternTok = Symbol("cached-pattern");
let SliderDefTok = Symbol("slider-def");

export const PatternFlags = {
  CUSTOM_SHADER: 1,
  NEED_BLUEMASK: 2
};

export class Pattern {
  constructor() {
    let def = this.constructor.patternDef();

    if (!def.typeName) {
      throw new Error("patternDef is missing typeName!");
    }

    this.pollShaderForUpdates = def.pollShaderForUpdates ?? false;
    this._lastShaderHash = undefined;

    this.use_curves = false;
    this.curveset = new CurveSet();

    //id if pattern is inside an MLGraph
    this.id = -1;

    for (let i = 0; i < 4; i++) {

    }
    this.mul_with_orig = false;
    this.mul_with_orig_exp = 0.333;

    this.enableAccum = true;

    this.vbuf = undefined;
    this.vbo = undefined;
    this.fboCount = 2;

    this.activePreset = 'My Preset';

    this.max_samples = 145;

    this.fast_mode = false;
    this.filter_width = 1.4;
    this.no_gradient = false;
    this.old_gradient = true;
    this.use_monty_sharpness = false;
    this.print_test = false;
    this.show_variance = false;
    this.use_variance = false;
    this.variance_color_direct = false;
    this.variance_decay = 0.975;
    this.variance_color_fac = 1.0;
    this.color_variance = false;
    this.variance_blur = 1.5;
    this.variance_bleed = 0.0;
    this.use_sharpness = true;
    this.sharpness = 0.5;
    this.per_pixel_random = true;
    this.per_pixel_blue = false;
    this.use_weighted_filter = true;

    this.DT = 0.001;
    this.T = 0.0;

    this.drawGen = 0;
    this.drawSample = 0;
    this._lastDrawGen = 0;
    this._lastDrawGens = new Map();

    this.typeName = def.typeName;
    this.uiName = def.uiName;
    this.flag = def.flag !== undefined ? def.flag : 0;

    this.sliders = new Sliders();
    this.pixel_size = 1.0;

    this.shader = undefined;
    this.finalShader = undefined;

    this.sliders.merge(this.constructor.getSliderDef());

    for (let param of this.sliders.params) {
      param.owner = this;
    }
  }

  get haveInputs() {
    for (let param of this.sliders.params) {
      for (let link of param.links) {
        if (link.dst === this) {
          return true;
        }
      }
    }

    return false;
  }

  get haveOutputs() {
    for (let param of this.sliders.params) {
      for (let link of param.links) {
        if (link.src === this) {
          return true;
        }
      }
    }

    return false;
  }

  get scale() {
    let def = this.constructor.getPatternDef();
    return this.sliders[def.offsetSliders.scale];
  }

  set scale(v) {
    let def = this.constructor.getPatternDef();
    this.sliders[def.offsetSliders.scale] = v;

    this.drawGen++;
    //window.redraw_viewport();
  }

  get offsetx() {
    let def = this.constructor.getPatternDef();
    return this.sliders[def.offsetSliders.x];
  }

  set offsetx(v) {
    let def = this.constructor.getPatternDef();
    this.sliders[def.offsetSliders.x] = v;

    this.drawGen++;
    //window.redraw_viewport();
  }

  get offsety() {
    let def = this.constructor.getPatternDef();
    return this.sliders[def.offsetSliders.y];
  }

  set offsety(v) {
    let def = this.constructor.getPatternDef();
    this.sliders[def.offsetSliders.y] = v;

    this.drawGen++;
    window.redraw_viewport();
  }

  get isDrawing() {
    return this.drawSample <= this.max_samples || this.drawGen !== this._lastDrawGen;
  }

  static getSliderDef() {
    if (Object.hasOwnProperty(this, SliderDefTok)) {
      return this[SliderDefTok];
    }

    let sdefs = util.list(this.patternDef().sliderDef);
    let visit = new Set();

    for (let i = 0; i < sdefs.length; i++) {
      let sdef = sdefs[i];

      if (typeof sdef === "string") {
        sdef = {name: sdef, type: "float"};
      }

      sdef.type = sdef.type ?? "float";

      if (!sdef.name) {
        sdef.name = "unnamed" + i;
        console.error("Expected a name", sdef);
      }

      if (visit.has(sdef.name)) {
        console.error("name collision in sliders");
        let base = sdef.name;
        let j = 2;

        while (visit.has(sdef.name)) {
          sdef.name = base + (j++);
        }
      }

      visit.add(sdef.name);
      sdefs[i] = sdef;
    }

    Object.seal(sdefs);
    this[SliderDefTok] = sdefs;

    return sdefs;
  }

  static getPatternDef() {
    if (!Object.hasOwnProperty(this, CachedPatternTok)) {
      let def = this.patternDef();
      Object.seal(def);

      this[CachedPatternTok] = def;
    }

    return this[CachedPatternTok];
  }

  static patternDef() {
    throw new Error("implement me!");
    return {
      typeName     : "",
      uiName       : "",
      flag         : 0,
      description  : "",
      icon         : -1,
      presets      : [], //preset as generated by ./preset.js:savePreset
      offsetSliders: {
        x    : 1, //index of x in sliders
        y    : 2, //index of y in sliders
        scale: 3, //index of scale in sliders
      },
      sliderDef    : [
        {
          name : "steps",
          range: [1, 2],
          value: 1.0
        },
        "x", "y", "scale"
      ],
      //Poll shader code regularly for updates, useful for live debugging in chrome
      pollShaderForUpdates: false,
      shaderPre           : ``,
      shader              : `
//uniform vec2 iRes;
//uniform vec2 iInvRes;
//uniform float T;

float pattern(float ix, float iy) {
  vec2 uv = vec2(ix, iy) * iInvRes;
}
      `
    }
  }

  static buildSidebar(ctx, con) {
    if (Pattern._no_base_sidebar) {
      return;
    }

    con.prop("fast_mode");
    con.slider("filter_width", {
      packflag: PackFlags.FORCE_ROLLER_SLIDER
    });
    con.prop("pixel_size");
    con.prop("max_samples");

    let panel = con.panel("Pixel Settings");
    panel.prop("mul_with_orig");
    panel.prop("no_gradient");
    panel.prop("use_sharpness");
    panel.prop("use_monty_sharpness");
    panel.prop("sharpness");
    panel.prop("per_pixel_random");
    panel.prop("per_pixel_blue");
    panel.prop("use_weighted_filter");
    panel.prop("print_test");
    panel.prop("show_variance");
    panel.prop("use_variance");

    panel = con.panel("Variance");
    panel.prop("variance_decay")
    panel.prop("variance_blur");
    panel.prop("variance_bleed");

    panel = panel.panel("Variance Feedback")
    panel.prop("color_variance");
    panel.prop("variance_color_direct");
    panel.prop("variance_color_fac")

    //con.prop("old_gradient");
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    let onchange = function () {
      this.dataref.drawGen++;
      window.redraw_viewport();
      window._appstate.autoSave();
    };

    st.struct("curveset", "curveset", "CurveSet", api.mapStruct(CurveSet));

    let redraw = window.redraw_viewport;

    st.bool("use_curves", "use_curves", "Use Curves")
      .on('change', redraw);

    st.bool("renderTiles", "renderTiles", "Use Tiles")
      .on('change', onchange);

    st.float("samplesPerTile", "samplesPerTile", "Samples Per Tile")
      .noUnits()
      .range(1, 20)
      .on('change', onchange);

    st.bool("mul_with_orig", "mul_with_orig", "Multiply");

    st.int("max_samples", "max_samples", "Samples", "Maximum number of samples to take")
      .noUnits()
      .range(1, 1024)
      .expRate(1.5)
      .step(1)
      .rollerSlider();

    st.bool("fast_mode", "fast_mode", "Fast Mode",
      "Render at lower resolution\n Multiplies pixel_size by 0.5")
      .on('change', onchange);

    st.bool("no_gradient", "no_gradient", "B/W mode")
      .on('change', redraw);
    st.bool("old_gradient", "old_gradient", "Old Gradient")
      .on('change', redraw);
    st.bool("use_monty_sharpness", "use_monty_sharpness", "Monty Sharpness", "Monte Carlo based sharpening")
      .on('change', onchange);

    st.bool("print_test", "print_test", "Printer Test")
      .on('change', redraw);

    function var_color_onchange() {
      console.log(this);
      if (this.dataref.variance_color_direct) {
        onchange.call(this, ...arguments);
      } else {
        redraw.call(this, ...arguments);
      }
    }

    st.bool("show_variance", "show_variance", "Show Variance")
      .description("Sample high variance areas more\nand enable variance blur.")
      .on('change', redraw);
    st.bool("color_variance", "color_variance", "Enabled")
      .description("Feed variance back into coloring.")
      .on('change', var_color_onchange)
    st.bool("use_variance", "use_variance", "Use Variance")
      .on('change', onchange)
      .description("Do more work on high-variance pixels.");
    st.float("variance_decay", "variance_decay", "Variance Decay")
      .description("Decay rate (only if Variance Color is off)")
      .range(0.0, 1.0)
      .step(0.01)
      .noUnits()
      .rollerSlider()
      .decimalPlaces(4)
      .on('change', onchange);
    st.float("variance_color_fac", "variance_color_fac", "Color Fac")
      .range(-5000.0, 5000.0)
      .step(0.15)
      .decimalPlaces(3)
      .noUnits()
      .expRate(1.5)
      .on('change', var_color_onchange)
      .description("Variance feedback color factor")
      .rollerSlider()
    st.bool("variance_color_direct", "variance_color_direct", "Direct")
      .on('change', onchange)
      .description("Apply variance color feedback in\nmain shader instead of final display\shader");

    st.float("variance_blur", "variance_blur", "Variance Blur")
      .range(0, 1000000.0)
      .step(0.1)
      .decimalPlaces(2)
      .noUnits()
      .on('change', onchange)
      .description("Increase filter width for  high-variance pixels\n(do not confuse with Variance Bleed).")
      .rollerSlider()
    st.float("variance_bleed", "variance_bleed", "Variance Bleed")
      .range(0.0, 1.0)
      .step(0.1)
      .decimalPlaces(4)
      .sliderDisplayExp(0.25)
      .noUnits()
      .description("How much to blur variance pixels\n(do not confuse with Variance Blur)")
      .on('change', onchange)

    st.bool("use_sharpness", "use_sharpness", "Use Sharpness")
      .on('change', redraw);
    st.bool("per_pixel_random", "per_pixel_random", "Pixel Random")
      .on('change', onchange);
    st.bool("per_pixel_blue", "per_pixel_blue", "Pixel Blue")
      .on('change', onchange);
    st.bool("use_weighted_filter", "use_weighted_filter", "Weighted Filter")
      .on('change', onchange);

    st.float("sharpness", "sharpness", "Sharpness")
      .range(0.0, 1.0)
      .noUnits()
      .on('change', function () {
        if (this.dataref.use_monty_sharpness) {
          onchange.call(this, ...arguments);
        } else {
          redraw.call(this, ...arguments);
        }
      });

    st.float("filter_width", "filter_width", "Filter Width")
      .noUnits()
      .range(0.0, 375.0)
      .on('change', onchange);

    st.float("pixel_size", "pixel_size", "Pixel Size")
      .range(0.05, 1.0)
      .on('change', onchange)
      .noUnits();

    st.list("sliders.params", "paramDef", [
      function getStruct(api, list, key) {
        let obj = key !== undefined ? list[key] : undefined;

        return !obj ? api.mapStruct(SliderParam, false) : obj.getStruct(api);
      },

      function get(api, list, key) {
        return list[key];
      },

      function getKey(api, list, obj) {
        return list.indexOf(obj);
      },

      function getIter(api, list) {
        return list[Symbol.iterator]();
      },

      function getLength(api, list) {
        return list.length;
      }
    ]);

    function getIndex(path) {
      //grab index from datapath

      let i = path.search(/\[/);
      path = path.slice(i + 1, path.search(/\]/));
      path = parseInt(path);

      console.log("PATH", path);
    }

    const wrapSymbol = Symbol("sliders-wrap");

    function getSlidersWrap(sliders) {
      if (!sliders[wrapSymbol]) {
        let wrap = [];

        function define(obj, i) {
          Object.defineProperty(obj, "value", {
            get() {
              return sliders[i];
            },
            set(v) {
              sliders[i] = v;
              window.redraw_viewport();
            }
          });
        }

        for (let i = 0; i < sliders.length; i++) {
          let item = {index: i};
          define(item, i);
          wrap[i] = item;
        }

        sliders[wrapSymbol] = wrap;
      }

      return sliders[wrapSymbol];
    }

    class FloatDummyClass {
    }

    class IntDummyClass {
    }

    let floatst = api.mapStruct(FloatDummyClass, true);
    let intst = api.mapStruct(IntDummyClass, true);

    let sdef = this !== Pattern ? this.getSliderDef() : [];

    floatst.float("value", "value", "Value")
      .noUnits().rollerSlider();
    intst.int("value", "value", "Value")
      .noUnits().rollerSlider().step(1);

    st.string("typeName", "type", "").readOnly();
    st.list("sliders", "sliders", [
      function getStruct(api, list, key) {
        let st = sdef[key].type === "int" ? intst : floatst;
        st.pathmap.value.data.uiname = sdef[key].name;
        return st;
      },

      function get(api, list, key) {
        return getSlidersWrap(list)[key];
      },

      function getKey(api, list, obj) {
        return obj.index;
      },

      function getIter(api, list) {
        return getSlidersWrap(list);
      },

      function getLength(api, list) {
        return list.length;
      }
    ]);

    //can't access this.patternDef inside of base class
    if (this === Pattern) {
      return;
    }


    let makeParamGetSet = (def, key, i) => {
      def.customGetSet(function get() {
        return this.dataref.sliders.params[i].value;
      }, function set(v) {
        this.dataref.sliders.params[i].setValue(v);
      });
    }

    let pst = st.struct("", "params", "Params");
    let i = 0;

    for (let pdef of this.getSliderDef()) {
      let type = SliderTypeMap[pdef.type];
      let def;

      let path = pdef.name;

      switch (type) {
        case SliderTypes.FLOAT:
          def = pst.float(path, pdef.name, ToolProperty.makeUIName(pdef.name)).rollerSlider();
          break;
        case SliderTypes.INT:
          def = pst.int(path, pdef.name, ToolProperty.makeUIName(pdef.name)).rollerSlider();
          break;
        case SliderTypes.VECTOR2:
          def = pst.vec2(path, pdef.name, ToolProperty.makeUIName(pdef.name)).rollerSlider();
          break;
        case SliderTypes.VECTOR3:
          def = pst.vec3(path, pdef.name, ToolProperty.makeUIName(pdef.name)).rollerSlider();
          break;
        case SliderTypes.VECTOR4:
          def = pst.vec4(path, pdef.name, ToolProperty.makeUIName(pdef.name)).rollerSlider();
          break;
        case SliderTypes.ENUM:
          def = pst.enum(path, pdef.name, pdef.enumDef, ToolProperty.makeUIName(pdef.name));
          break;
        case SliderTypes.FLAGS:
          def = pst.flags(path, pdef.name, pdef.enumDef, ToolProperty.makeUIName(pdef.name));
          break;
      }

      if (type & (SliderTypes.FLOAT|SliderTypes.INT|SliderTypes.VECTOR2|SliderTypes.VECTOR3|SliderTypes.VECTOR4)) {
        def.range(pdef.min ?? -100000, pdef.max ?? 100000);
        if (type !== SliderTypes.INT) {
          def.decimalPlaces(pdef.decimalPlaces ?? 3);
        }
        def.slideSpeed(pdef.slideSpeed ?? 3);
        def.baseUnit(pdef.unit ?? "none");
        def.displayUnit(pdef.unit ?? "none");
        def.expRate(pdef.expRate ?? 1.35);
        def.step(pdef.step ?? 0.1);
      }

      def.description(pdef.description ?? "");

      if (!pdef.noReset) {
        def.on('change', onchange);
      } else {
        def.on('change', window.redraw_viewport);
      }

      makeParamGetSet(def, pdef.name, i);
      i++;
    }

    return st;
  }

  static register(cls) {
    if (!cls.STRUCT || cls.STRUCT === Pattern.STRUCT) {
      throw new Error("you forgot to add a struct script");
    }

    PatternClasses.push(cls);
    nstructjs.register(cls);
  }

  savePresetText(opt = {}) {
    opt.sharpness = opt.sharpness ?? this.sharpness;
    opt.filter_width = opt.filter_width ?? this.filter_width;
    //opt.max_samples = opt.max_samples ?? this.max_samples;

    if (this.use_curves) {
      opt.use_curves = true;
      opt.curveset = JSON.parse(JSON.stringify(this.curveset));
    }

    opt.no_gradient ??= this.no_gradient;
    opt.color_variance ??= this.color_variance;
    opt.use_variance ??= this.use_variance;
    opt.variance_color_direct ??= this.variance_color_direct;
    opt.variance_decay ??= this.variance_decay;
    opt.variance_blur ??= this.variance_blur;
    opt.variance_color_fac ??= this.variance_color_fac;
    opt.variance_bleed ??= this.variance_bleed;

    opt.sliders = util.list(this.sliders);

    return opt;
  }

  savePreset() {
    return savePreset(this);
  }

  getActivePreset() {
    return presetManager.getPreset(this.typeName, this.activePreset);
  }

  loadPreset(preset) {
    let pat = loadPreset(preset);

    let pixel_size = this.pixel_size;

    pat.copyTo(this);

    this.pixel_size = pixel_size;
    this.activePreset = preset.name;
    this.drawGen++;

    return this;
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  copyTo(b) {
    this.curveset.copyTo(b.curveset);

    b.use_curves = this.use_curves;
    b.mul_with_orig = this.mul_with_orig;
    b.pixel_size = this.pixel_size;
    b.activePreset = this.activePreset;
    b.filter_width = this.filter_width;
    b.no_gradient = this.no_gradient;
    b.old_gradient = this.old_gradient;
    b.use_monty_sharpness = this.use_monty_sharpness;
    b.print_test = this.print_test;
    b.show_variance = this.show_variance;
    b.use_variance = this.use_variance;
    b.variance_color_direct = this.variance_color_direct;
    b.variance_decay = this.variance_decay;
    b.variance_color_fac = this.variance_color_fac;
    b.color_variance = this.color_variance;
    b.variance_blur = this.variance_blur;
    b.variance_bleed = this.variance_bleed;
    b.use_sharpness = this.use_sharpness;
    b.sharpness = this.sharpness;
    b.per_pixel_random = this.per_pixel_random;
    b.per_pixel_blue = this.per_pixel_blue;
    b.use_weighted_filter = this.use_weighted_filter;

    b.max_samples = this.max_samples;

    for (let i = 0; i < this.sliders.length; i++) {
      b.sliders[i] = this.sliders[i];
    }

    b.drawGen++;
  }

  genShader() {
    let vertex = `
    `;
  }

  getFragmentCode(addShaderPre = true) {
    let def = this.constructor.getPatternDef();

    let code;

    if (addShaderPre) {
      code = "\n" + def.shaderPre.trim() + "\n" + def.shader.trim() + "\n";
    } else {
      code = "\n" + def.shader.trim() + "\n";
    }

    let idsubst = this.id >= 0 ? "g" + this.id : "";

    code = code.replace(/\$/g, idsubst);

    let i = 0;
    for (let slider of def.sliderDef) {
      let k = typeof slider === "string" ? slider : slider.name;

      if (typeof k === "symbol") {
        continue;
      }


      let re = new RegExp(`_%${k}\\b`, "g");
      code = code.replace(re, `SLIDERS[${i}]`);
      i++;
    }

    return code;
  }

  compileShader(gl) {
    let fragment = this.getFragmentCode();
    let fragmentBase = Shaders.fragmentBase;

    let vertex = fragmentBase.vertex;

    let main = fragmentBase.fragment;
    fragment = fragmentBase.fragmentPre + fragment + main;

    let sdef = buildShader({
      fragment, vertex, attributes: fragmentBase.attributes, uniforms: {}
    }, gl.haveWebGL2);


    this.shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

    sdef = buildShader(Shaders.finalShader, gl.haveWebGL2);
    this.finalShader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);
  }

  getPixelSize() {
    if (this.fast_mode) {
      return this.pixel_size*0.5;
    }

    return this.pixel_size;
  }

  shaderNeedsCompile() {
    if (!this.shader) {
      return true;
    }

    if (!this.pollShaderForUpdates) {
      return false;
    }

    let def = this.constructor.patternDef();
    let hash = def.shader + ":" + def.shaderPre;

    if (hash !== this._lastShaderHash) {
      this._lastShaderHash = hash;
      this.drawGen++;
      return true;
    }

    return false;
  }

  _doViewportDraw(ctx, canvas, gl, enableAccum,
                  finalOnly = false, finalFbo = undefined,
                  customUVs                   = undefined,
                  customSize                  = undefined) {
    enableAccum = enableAccum && this.enableAccum;

    if (this.shaderNeedsCompile()) {
      this.compileShader(gl);
    }

    for (let i = 0; i < this.sliders.length; i++) {
      let f = this.sliders[i];
      if (isNaN(f) || !isFinite(f)) {
        console.warn("NaN! SLIDERS[" + i + "]");
        this.sliders[i] = 0.1;
      }
    }

    let editor = ctx.canvas;
    let fbosUpdated = editor.ensureFbos(gl, this.fboCount, this.getPixelSize(), 2);
    let fbos = editor.fbos;

    let w = fbos[0].size[0];
    let h = fbos[1].size[1];

    if (customSize) {
      w = customSize[0];
      h = customSize[1];
    }

    let tilesize, tilew, tileh, tottile, ri;

    /* gl.scissor based tiling, not used by ../core/render.js */
    if (this.renderTiles) {
      tilesize = 128;
      tilew = Math.ceil(w/tilesize);
      tileh = Math.ceil(h/tilesize);
      tottile = tilew*tileh;

      let rand = new util.MersenneRandom(~~(this.drawSample/this.samplesPerTile))
      ri = ~~(Math.random()*tottile*0.99999);
    }

    //let ri = ~~(this.drawSample / this.samplesPerTile);
    ri = ri%tottile;
    ri = tottile - 1 - ri;

    let lastDrawGen;
    if (this.renderTiles) {
      lastDrawGen = this._lastDrawGens.get(ri);
    } else {
      lastDrawGen = this._lastDrawGen;
    }

    if (fbosUpdated || this.drawGen !== lastDrawGen) {
      this.drawSample = 0;
      this.T = 0.0;

      fbos[0].bind(gl);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);

      if (this.renderTiles) {
        enableAccum = false;
        this._lastDrawGens.set(ri, this.drawGen);
      } else {
        this._lastDrawGen = this.drawGen;
      }
    }

    let defines = {};
    let uniforms = {};

    if (1 || this.constructor.getPatternDef().flag & PatternFlags.NEED_BLUEMASK) {
      uniforms.blueMaskDimen = 128;
      uniforms.blueMask = getBlueMaskTex(gl, uniforms.blueMaskDimen);

      defines.HAVE_BLUE_NOISE = blueMaskValid(uniforms.blueMaskDimen);
    }

    if (this.use_curves) {
      defines.USE_CURVES = true;
      this.curveset.setUniforms(gl, "CURVE", uniforms);
    }

    if (this.no_gradient) {
      defines.NO_GRADIENT = true;
    }

    //XXX get new gradient system ported over to path.ux
    if (true || this.old_gradient) {
      defines.OLD_GRADIENT = null;
    } else {
      defines.GRAD_STEPS = config.GRADIENT.tableSteps;
    }

    if (this.use_monty_sharpness) {
      defines.USE_SHARPNESS = null;
    }

    if (this.print_test) {
      defines.PRINT_TEST = null;
    }

    if (this.show_variance) {
      defines.SHOW_VARIANCE = null;
    }

    if (this.variance_bleed > 0.0) {
      defines.USE_VARIANCE_BLEED = null;
      uniforms.varianceBleed = this.variance_bleed;
    }

    if (this.use_variance) {
      uniforms.varianceBlur = this.variance_blur;
      defines.USE_VARIANCE = null;
      uniforms.varianceDecay = this.variance_decay;
    }

    if (this.color_variance) {
      if (this.variance_color_direct) {
        defines.VARIANCE_COLOR_DIRECT = null;
      }

      uniforms.varianceColorFac = this.variance_color_fac*0.025;
      defines.COLOR_VARIANCE = null;
    }

    if (this.per_pixel_random) {
      defines.PER_PIXEL_RANDOM = null;
    }

    if (this.per_pixel_blue) {
      defines.PER_PIXEL_BLUE = null;
    }

    if (this.use_weighted_filter) {
      defines.USE_WEIGHTED_FILTER = null;
    }

    if (this.flag & PatternFlags.CUSTOM_SHADER) {
      defines.CUSTOM_SHADER = null;
    }

    if (this.mul_with_orig) {
      defines.MULTIPLY_ORIG = null;
      defines.MULTIPLY_ORIG_EXP = this.mul_with_orig_exp;
    }

    defines.MAX_SLIDERS = this.sliders.length;

    for (let i = 0; i < this.sliders.length; i++) {
      uniforms[`SLIDERS[${i}]`] = this.sliders[i];
    }

    let setViewport = () => {
      if (this.renderTiles) {
        let ix = ri%tilew;
        let iy = ~~(ri/tilew);

        let x = ix*tilesize;
        let y = iy*tilesize;

        gl.scissor(x, y, tilesize, tilesize);
        gl.enable(gl.SCISSOR_TEST);
      }
    }

    uniforms.sharpness = this.sharpness;
    uniforms.iRes = [w, h];
    uniforms.iInvRes = [1.0/w, 1.0/h];
    uniforms.aspect = w/h;
    uniforms.filterWidth = this.filter_width;
    uniforms.rgba = fbos[1].texColor;
    uniforms.rgba2 = fbos[1].texBuffers[0];
    uniforms.enableAccum = enableAccum && this.drawSample > 0 ? 1.0 : 0.0;
    uniforms.uSample = this.drawSample;
    uniforms.T = this.T;

    gl.disable(gl.SCISSOR_TEST);

    this.updateInfo(ctx);

    const do_main_draw = this.drawSample <= this.max_samples && !finalOnly;

    defines.VALUE_OFFSET = "0.0";

    this.setup(ctx, gl, uniforms, defines);

    let id = this.id >= 0 ? this.id : '';

    for (let map of [uniforms, defines]) {
      for (let k in map) {
        let k2 = k.replace(/\$/g, "" + id);

        if (k2 !== k) {
          map[k2] = map[k];
          delete map[k];
        }
      }
    }

    if (!this.vbuf) {
      this.regenMesh(gl);
    }

    let vbuf;

    if (customUVs) {
      vbuf = this.genMesh(gl, "customCo", customUVs);
    } else {
      vbuf = this.vbuf;
    }

    vbuf.co.bind(gl, 0);
    vbuf.uvs.bind(gl, 1);

    setViewport();

    if (do_main_draw) {
      let fbo = fbos[0];
      fbo.bind(gl);
      setViewport();

      this.viewportDraw(ctx, gl, uniforms, defines);

      fbo.unbind(gl);
    }

    gl.disableVertexAttribArray(1);

    if (finalFbo !== null) {
      if (!this.use_sharpness || this.use_monty_sharpness) {
        delete defines.USE_SHARPNESS;
      } else if (this.use_sharpness) {
        defines.USE_SHARPNESS = null;
      }

      uniforms.rgba = fbos[0].texColor;
      uniforms.rgba2 = fbos[0].texBuffers[0];
      this.finalShader.bind(gl, uniforms, defines);

      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(editor.glPos[0], editor.glPos[1], editor.glSize[0], editor.glSize[1]);

      gl.clearColor(0.0, 0.5, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);

      vbuf.co.bind(gl, 0);
      vbuf.uvs.bind(gl, 1);

      if (finalFbo) {
        finalFbo.bind(gl);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (finalFbo) {
        finalFbo.unbind(gl);
      }
    }

    if (do_main_draw) {
      this.swap(fbos);
    }

    if (do_main_draw) {
      this.drawSample++;
      this.T += this.DT;
    }
  }

  swap(fbos) {
    let tmp = fbos[0];

    fbos[0] = fbos[1];
    fbos[1] = tmp;
  }

  updateInfo(ctx) {
    if (ctx && ctx.menubar && ctx.menubar.infoSpan) {
      let span = ctx.menubar.infoSpan;

      let text = `sample ${this.drawSample + 1} of ${this.max_samples}`;
      span.innerHTML = text;
    }
  }

  setup(ctx, gl, uniforms, defines) {
    /*
    defines.GAIN = "SLIDERS[X]";
    defines.COLOR_SHIFT = "SLIDERS[X]";
    defines.COLOR_SCALE = "SLIDERS[X]";
    defines.BRIGHTNESS = "SLIDERS[X]";
    */
  }

  loadSTRUCT(reader) {
    reader(this);

    if (!(this.sliders instanceof Sliders)) {
      let sliders = new Sliders();
      sliders.merge(this.constructor.getSliderDef());

      for (let i = 0; i < sliders.length; i++) {
        sliders[i] = this.sliders[i];
      }

      sliders.bindProperties();
      this.sliders = sliders;
    } else {
      this.sliders.merge(this.constructor.getSliderDef());
      this.sliders.unbindProperties();
      this.sliders.bindProperties();
    }

    for (let param of this.sliders.params) {
      param.owner = this;
    }
  }

  regenMesh(gl) {
    this.vbuf = this.genMesh(gl, "co", [[0, 0], [1, 1]]);
    this.regen = 0;
  }

  genMesh(gl, key, customUvs) {
    if (!this.vbo) {
      this.vbo = new RenderBuffer();
    }

    let vbuf = this.vbo.get(gl, key);

    let [min, max] = customUvs;

    let mesh = new Float32Array([
      0, 0, 0, 1, 1, 1,
      0, 0, 1, 1, 1, 0
    ]);

    let uvs = new Float32Array([
      min[0], min[1], min[0], max[1], max[0], max[1],
      min[0], min[1], max[0], max[1], max[0], min[1]
    ]);

    vbuf.upload(gl, {
      elemSize: 2,
      type    : gl.FLOAT,
      target  : gl.ARRAY_BUFFER,
      perfHint: gl.STATIC_DRAW,
    }, mesh);

    let uvbuf = this.vbo.get(gl, key + "_uvs");
    uvbuf.upload(gl, {
      elemSize: 2,
      type    : gl.FLOAT,
      target  : gl.ARRAY_BUFFER,
      perfHint: gl.STATIC_DRAW,
    }, uvs);

    return {
      co : vbuf,
      uvs: uvbuf
    };
  }

  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    if (!this.vbuf) {
      this.regenMesh(gl);
    }

    let shader = this.shader;
    this.setup(ctx, gl, uniforms, defines);

    shader.bind(gl, uniforms, defines);

    //this.vbuf.bind(gl, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

Pattern.STRUCT = `
Pattern {
  typeName            : string;
  activePreset        : string;
  sliders             : Sliders;

  fast_mode           : bool;
  pixel_size          : double;
  filter_width        : double;  
  per_pixel_random    : bool;
  per_pixel_blue      : bool;
  use_weighted_filter : bool;
  print_test          : bool;
  show_variance       : bool;
  use_variance        : bool;
  variance_color_direct : bool;
  variance_color_fac  : float;
  variance_decay      : float;
  color_variance      : bool;
  variance_blur       : float;
  variance_bleed      : float;
  use_monty_sharpness : bool;
  old_gradient        : bool;
  no_gradient         : bool;
  use_sharpness       : bool;  
  sharpness           : double;
  
  max_samples         : int;
  mul_with_orig       : bool;
  use_curves          : bool;
  curveset            : CurveSet;
  id                  : int;
  graph_flag          : int;
}
`;
nstructjs.register(Pattern);

export var PatternsEnum;

export function makePatternsEnum() {
  let i = 0;

  let def = {}, uidef = {}, descr = {}, icons = {};

  for (let cls of PatternClasses) {
    let pdef = cls.patternDef();
    let uiname = def.uiName ?? ToolProperty.makeUIName(pdef.typeName);

    let key = pdef.typeName;

    def[key] = i;
    uidef[key] = uiname;
    descr[key] = pdef.description ?? "";
    icons[key] = pdef.icon ?? -1;

    i++;
  }

  let prop = new EnumProperty(0, def);
  prop.addIcons(icons);
  prop.addDescriptions(descr);
  prop.addUINames(uidef);

  if (PatternsEnum) {
    PatternsEnum.updateDefinition(prop);
  } else {
    PatternsEnum = prop;
  }

  window._PatternsEnum = PatternsEnum;
  return PatternsEnum;
}

Pattern._no_base_sidebar = false;