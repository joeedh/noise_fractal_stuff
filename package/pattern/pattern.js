import {EnumProperty, util, nstructjs} from '../path.ux/pathux.js';
import {renderPattern} from './pattern_draw.js';
import {ShaderProgram, RenderBuffer} from '../webgl/webgl.js';
import {Shaders} from './pattern_shaders.js';
import {loadPreset, presetManager, savePreset} from './preset.js';

import {PatternClasses} from './pattern_base.js';

export {PatternClasses} from './pattern_base.js';

let CachedPatternTok = Symbol("cached-pattern");

export const PatternFlags = {
  CUSTOM_SHADER: 1
};

export class Sliders extends Array {
  constructor(n = 0, pat) {
    super(n);
    this._pattern = pat;

    this.renderTiles = false;
    this.samplesPerTile = 2;
  }

  static from(b, pattern) {
    let ret = new Sliders(0, pattern);

    for (let item of b) {
      ret.push(item);
    }

    return ret;
  }

  toJSON() {
    return util.list(this);
  }

  loadSliderDef(def) {
    let defineProp = (k, i, sdef) => {
      Object.defineProperty(this, k, {
        get: function () {
          return this[i];
        },
        set: function (v) {
          if (!sdef.noReset) {
            this._pattern.drawGen++;
          }
          this[i] = v;
        }
      })
    }

    const badkeys = new Set([
      "length", "push", "pop", "remove", "indexOf", "toString",

    ]);

    for (let i = 0; i < def.length; i++) {
      let item = def[i];
      let k;

      if (typeof item === "string") {
        k = item;
        item = {name: item};
      } else {
        k = item.name;
      }

      if (badkeys.has(k)) {
        continue;
      }

      defineProp(k, i, item);
    }
  }
}

export class Pattern {
  constructor() {
    let def = this.constructor.patternDef();

    if (!def.typeName) {
      throw new Error("patternDef is missing typeName!");
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
    this.use_sharpness = true;
    this.sharpness = 0.5;
    this.per_pixel_random = true;

    this.DT = 0.001;
    this.T = 0.0;

    this.drawGen = 0;
    this.drawSample = 0;
    this._lastDrawGen = 0;
    this._lastDrawGens = new Map();

    this.typeName = def.typeName;
    this.uiName = def.uiName;
    this.flag = def.flag !== undefined ? def.flag : 0;

    this.sliders = new Sliders(0, this);
    this.pixel_size = 1.0;

    this.shader = undefined;
    this.finalShader = undefined;

    this.loadSlidersFromDef(this.constructor.patternDef().sliderDef);
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
      shader       : `
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
    con.prop("fast_mode");
    con.prop("filter_width");
    con.prop("pixel_size");
    con.prop("max_samples");
    con.prop("mul_with_orig");
    con.prop("no_gradient");
    con.prop("use_sharpness");
    con.prop("use_monty_sharpness");
    con.prop("sharpness");
    con.prop("per_pixel_random");
    con.prop("print_test");
    //con.prop("old_gradient");
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    let onchange = function () {
      this.dataref.drawGen++;
      window.redraw_viewport();
      window._appstate.autoSave();
    };

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
      "Render at lower resolution\n Multiplies pixel_size by 0.5");

    st.bool("no_gradient", "no_gradient", "B/W mode");
    st.bool("old_gradient", "old_gradient", "Old Gradient");
    st.bool("use_monty_sharpness", "use_monty_sharpness", "Monty Sharpness")
      .on('change', onchange);

    st.bool("print_test", "print_test", "Printer Test");
    st.bool("use_sharpness", "use_sharpness", "Use Sharpness");
    st.bool("per_pixel_random", "per_pixel_random", "Pixel Random")
      .on('change', onchange);

    st.float("sharpness", "sharpness", "Sharpness")
      .range(0.0, 1.0)
      .noUnits();
    st.float("filter_width", "filter_width", "Filter Width")
      .noUnits()
      .range(0.0, 10.0)
      .on('change', onchange);

    st.float("pixel_size", "pixel_size", "Pixel Size")
      .range(0.05, 1.0)
      .on('change', onchange)
      .noUnits();

    class dummy {
    }

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

    let floatst = api.mapStruct(dummy, true);
    floatst.float("value", "value", "Value")
      .noUnits().rollerSlider();

    st.string("typeName", "type", "").readOnly();
    st.list("sliders", "sliders", [
      function getStruct(api, list, obj) {
        return floatst;
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

    return st;
  }

  static register(cls) {
    if (!cls.STRUCT || cls.STRUCT === Pattern.STRUCT) {
      throw new Error("you forgot to add a struct script");
    }

    PatternClasses.push(cls);
    nstructjs.register(cls);
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
    b.mul_with_orig = this.mul_with_orig;
    b.pixel_size = this.pixel_size;
    b.activePreset = this.activePreset;
    b.filter_width = this.filter_width;
    b.no_gradient = this.no_gradient;
    b.old_gradient = this.old_gradient;
    b.use_monty_sharpness = this.use_monty_sharpness;
    b.print_test = this.print_test;
    b.use_sharpness = this.use_sharpness;
    b.sharpness = this.sharpness;
    b.per_pixel_random = this.per_pixel_random;

    b.max_samples = this.max_samples;

    for (let i = 0; i < this.sliders.length; i++) {
      b.sliders[i] = this.sliders[i];
    }

    b.drawGen++;
  }

  loadSlidersFromDef(sliderDef) {
    this.sliders.length = 0;

    for (let item of sliderDef) {
      if (typeof item === "string") {
        item = {name: item};
      }

      if ("value" in item) {
        this.sliders.push(item.value);
      } else {
        this.sliders.push(0.0);
      }
    }

    this.sliders.loadSliderDef(sliderDef);

    return this;
  }

  genShader() {
    let vertex = `
    `;
  }

  compileShader(gl) {
    let fragment = this.constructor.patternDef().shader;
    let vertex = Shaders.fragmentBase.vertex;

    let main = Shaders.fragmentBase.fragment;
    fragment = Shaders.fragmentBase.fragmentPre + fragment + main;

    let sdef = {
      fragment, vertex, attributes: Shaders.fragmentBase.attributes, uniforms: {}
    };

    this.shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

    sdef = Shaders.finalShader;
    this.finalShader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);
  }

  getPixelSize() {
    if (this.fast_mode) {
      return this.pixel_size*0.5;
    }

    return this.pixel_size;
  }

  _doViewportDraw(ctx, canvas, gl, enableAccum,
                  finalOnly = false, finalFbo = undefined,
                  customUVs                   = undefined,
                  customSize                  = undefined) {
    enableAccum = enableAccum && this.enableAccum;

    if (!this.shader) {
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
    let fbosUpdated = editor.ensureFbos(gl, this.fboCount, this.getPixelSize());
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

    if (this.per_pixel_random) {
      defines.PER_PIXEL_RANDOM = null;
    }

    if (this.flag & PatternFlags.CUSTOM_SHADER) {
      defines.CUSTOM_SHADER = null;
    }

    if (this.mul_with_orig) {
      defines.MULTIPLY_ORIG = null;
      defines.MULTIPLY_ORIG_EXP = this.mul_with_orig_exp;
    }

    let uniforms = {};

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
    uniforms.enableAccum = enableAccum && this.drawSample > 0 ? 1.0 : 0.0;
    uniforms.uSample = this.drawSample;
    uniforms.T = this.T;

    gl.disable(gl.SCISSOR_TEST);

    this.updateInfo(ctx);

    const do_main_draw = this.drawSample <= this.max_samples && !finalOnly;

    defines.VALUE_OFFSET = "0.0";

    this.setup(ctx, gl, uniforms, defines);

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
      let t = fbos[0];
      fbos[0] = fbos[1];
      fbos[1] = t;
    }

    if (do_main_draw) {
      this.drawSample++;
      this.T += this.DT;
    }
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

    let sliderdef = this.constructor.patternDef().sliderDef;

    while (this.sliders.length < sliderdef.length) {
      let item = sliderdef[this.sliders.length];
      let value;

      if (typeof item === "object") {
        value = item.value ?? 0.0;
      } else {
        value = 0.0;
      }

      this.sliders.push(value);
    }

    this.sliders = Sliders.from(this.sliders, this);
    this.sliders.loadSliderDef(sliderdef);
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
    shader.bind(gl, uniforms, defines);

    //this.vbuf.bind(gl, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

Pattern.STRUCT = `
Pattern {
  typeName            : string;
  activePreset        : string;
  sliders             : array(double);

  fast_mode           : bool;
  pixel_size          : double;
  filter_width        : double;  
  per_pixel_random    : bool;
  print_test          : bool;
  use_monty_sharpness : bool;
  old_gradient        : bool;
  no_gradient         : bool;
  use_sharpness       : bool;  
  sharpness           : double;
  
  max_samples         : int;
  mul_with_orig       : bool;
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