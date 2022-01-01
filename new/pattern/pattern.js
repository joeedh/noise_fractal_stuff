import {EnumProperty, nstructjs} from '../path.ux/pathux.js';
import {renderPattern} from './pattern_draw.js';
import {ShaderProgram, RenderBuffer} from '../webgl/webgl.js';
import {Shaders} from './pattern_shaders.js';
import {loadPreset, presetManager, savePreset} from './preset.js';

import {PatternClasses} from './pattern_base.js';

export {PatternClasses} from './pattern_base.js';

let CachedPatternTok = Symbol("cached-pattern");

export class Pattern {
  constructor() {
    let def = this.constructor.patternDef();

    if (!def.typeName) {
      throw new Error("patternDef is missing typeName!");
    }

    this.vbuf = undefined;
    this.vbo = undefined;

    this.activePreset = 'My Preset';

    this.fast_mode = false;
    this.filter_width = 1.4;
    this.no_gradient = false;
    this.old_gradient = true;
    this.use_monty_sharpness = false;
    this.print_test = false;
    this.use_sharpness = true;
    this.sharpness = 0.5;
    this.per_pixel_random = true;
    this.T = 0.0;

    this.drawGen = 0;
    this.drawSample = 0;
    this._lastDrawGen = 0;

    this.typeName = def.typeName;
    this.uiName = def.uiName;
    this.flag = def.flag !== undefined ? def.flag : 0;

    this.sliders = [];
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
    window.redraw_viewport();
  }

  get offsetx() {
    let def = this.constructor.getPatternDef();
    return this.sliders[def.offsetSliders.x];
  }

  set offsetx(v) {
    let def = this.constructor.getPatternDef();
    this.sliders[def.offsetSliders.x] = v;

    this.drawGen++;
    window.redraw_viewport();
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
      .range(0.0, 5.0)
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
    floatst.float("value", "value", "Value");

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

  copyTo(b) {
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

    return this;
  }

  genShader() {
    let vertex = `
    `;
  }

  compileShader(gl) {
    let fragment = this.constructor.patternDef().shader;
    let vertex = Shaders.fragmentBase.vertex;

    fragment = Shaders.fragmentBase.fragment.replace(/\$PATTERN_HERE/, fragment);

    let sdef = {
      fragment, vertex, attributes: ["co"], uniforms: {}
    };

    this.shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

    sdef = Shaders.finalShader;
    this.finalShader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);
  }

  getPixelSize() {
    if (this.fast_mode) {
      return this.pixel_size * 0.5;
    }

    return this.pixel_size;
  }

  _doViewportDraw(ctx, canvas, gl, enableAccum) {
    if (this.drawGen !== this._lastDrawGen) {
      this.drawSample = 0;
      this._lastDrawGen = this.drawGen;
      this.T = 0.0;
    }

    if (!this.shader) {
      this.compileShader(gl);
    }

    let editor = ctx.canvas;
    let fbos = editor.ensureFbos(gl, 2, this.getPixelSize());

    let defines = {};

    if (this.no_gradient) {
      defines.NO_GRADIENT = true;
    }

    if (this.old_gradient) {
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

    let uniforms = {};

    defines.MAX_SLIDERS = this.sliders.length;

    for (let i = 0; i < this.sliders.length; i++) {
      uniforms[`SLIDERS[${i}]`] = this.sliders[i];
    }

    let w = fbos[0].size[0];
    let h = fbos[1].size[1];

    uniforms.sharpness = this.sharpness;
    uniforms.iRes = [w, h];
    uniforms.iInvRes = [1.0/w, 1.0/h];
    uniforms.aspect = w/h;
    uniforms.filterWidth = this.filter_width;
    uniforms.rgba = fbos[1].texColor;
    uniforms.enableAccum = enableAccum && this.drawSample > 0 ? 1.0 : 0.0;
    uniforms.sample = this.drawSample;
    uniforms.T = this.T;

    gl.disable(gl.SCISSOR_TEST);

    let fbo = fbos[0];
    fbo.bind(gl);

    this.viewportDraw(ctx, gl, uniforms, defines);

    fbo.unbind(gl);

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

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    let t = fbos[0];
    fbos[0] = fbos[1];
    fbos[1] = t;

    this.drawSample++;
    this.T += 0.001;
  }

  regenMesh(gl) {
    this.vbo = new RenderBuffer();

    let vbuf = this.mesh = this.vbo.get(gl, "co");

    this.regen = 0;
    var mesh = [
      0, 0, 0, 1, 1, 1,
      0, 0, 1, 1, 1, 0
    ];

    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh), gl.STATIC_DRAW);
  }

  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    if (!this.vbuf) {
      this.regenMesh(gl);
    }

    let shader = this.shader;
    shader.bind(gl, uniforms, defines);

    var vbuf = this.vbuf;

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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