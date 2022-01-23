import {
  Vector2, Vector3, Vector4, Matrix4, Quat, util,
  nstructjs, UIBase, Container, saveUIData, loadUIData,
  ToolOp, IntProperty, FloatProperty, EnumProperty, FlagProperty,
  Vec2Property, Vec3Property, StringProperty, startMenu, BoolProperty
} from '../path.ux/pathux.js';
import {Pattern, PatternFlags, PatternClasses, PatternsEnum} from '../pattern/pattern.js';
import {MLGraph} from '../ml/ml_types.js';
import {SliderTypes} from '../pattern/pattern_types.js';
import './moire.js'; //prevent warning when ToolOp.register reads GraphAddOp.inputs.type

export class GraphAddOp extends ToolOp {
  constructor() {
    super();

    this._last_update_key = undefined;
  }

  static tooldef() {
    let EnumProp = PatternsEnum ? PatternsEnum : new EnumProperty(0, {0: null});

    return {
      uiname     : "+",
      description: "Add Pattern",
      toolpath   : "graph.add",
      is_modal   : true,
      inputs     : {
        before  : new IntProperty(-1),
        type    : EnumProp.copy(),
        ignoreMe: new BoolProperty()
      }
    }
  }

  static canRun(ctx) {
    return ctx.pattern && ctx.pattern instanceof GraphPattern;
  }

  modalStart(ctx) {
    super.modalStart(ctx);

    let x = ctx.screen.mpos[0];
    let y = ctx.screen.mpos[1];

    let menu = UIBase.createElement("menu-x");

    //in case menu is cancelled, don't run op
    this.inputs.ignoreMe.setValue(true);

    for (let cls of PatternClasses) {
      let def = cls.patternDef();
      let uiname = def.uiName ?? ToolProperty.makeUIName(def.typeName);

      menu.addItem(uiname, PatternsEnum.values[def.typeName]);
    }

    menu.onselect = (id) => {
      this.inputs.ignoreMe.setValue(false);
      this.inputs.type.setValue(id);
      this.exec(ctx);
    }

    menu.onclose = () => {
    }

    if (this.modalRunning) {
      this.modalEnd(false);
    }

    menu.ctx = ctx;

    startMenu(menu, x, y);
  }

  exec(ctx) {
    if (this.inputs.ignoreMe.getValue()) {
      return;
    }

    let pat = ctx.pattern;
    let type = this.inputs.type.getValue();
    let i = this.inputs.before.getValue();

    console.log("adding pattern!", pat, type, i);

    type = PatternsEnum.keys[type];
    let pat2;

    for (let cls of PatternClasses) {
      if (cls.patternDef().typeName === type) {
        pat2 = new cls();
        break;
      }
    }

    if (!pat2) {
      console.warn("failed to find pattern " + type);
      return;
    }

    pat.graph.insert(pat2, i);
  }
}

ToolOp.register(GraphAddOp);

export class GraphEditor extends Container {
  constructor() {
    super();

    this._update_digest = new util.HashDigest();

    this._rebuild = true;
  }

  static define() {
    return {
      tagname: "fractal-graph-editor-x"
    }
  }

  rebuild() {
    let pat = this.ctx.pattern;

    if (!pat || !(pat instanceof GraphPattern)) {
      return;
    }

    this._rebuild = false;
    let uidata = saveUIData(this, "data");

    this.clear();
    this.label("Editor");

    this.tool("graph.add(before=0)");
    let i = 0;

    let badparams = new Set(["_factor", "_blend_mode", "depend"]);

    for (let gen of pat.graph.generators) {
      let panel = this.panel(gen.typeName + ":" + gen.id);

      let parami = gen.sliders.getParamIndex("_factor");
      if (parami !== -1) {
        panel.prop(`pattern.graph.nodes[${i}].paramDef[${parami}].value`);
      }

      parami = gen.sliders.getParamIndex("_blend_mode");
      if (parami !== -1) {
        panel.prop(`pattern.graph.nodes[${i}].paramDef[${parami}].value`);
      }

      let panel2 = panel.panel("Sliders");
      let pj = 0, pcount = 0;
      let param = gen.sliders.params[0];

      for (let j=0; j<gen.sliders.length; j++) {
        while (param.type === "string") {
          pj++;
          param = gen.sliders.params[pj];
        }

        if (!badparams.has(param.name)) {
          let path = `pattern.graph.nodes[${i}].sliders[${j}].value`;
          let slider = UIBase.createElement("numslider-x");
          slider.setAttribute("datapath", path);

          let row = panel2.row();
          row.label(param.name);
          row.add(slider);
        }

        let size;

        switch (param.type) {
          case SliderTypes.VECTOR2:
            size = 2;
            break;
          case SliderTypes.VECTOR3:
            size = 3;
            break;
          case SliderTypes.VECTOR4:
            size = 4;
            break;
        }

        pcount++;

        if (size === undefined || pcount >= size) {
          pj++;
          pcount = 0;
          param = gen.sliders.params[pj];

          continue;
        }
      }

      panel2.closed = true;

      this.tool(`graph.add(before=${i+1})`);
      i++;
    }

    if (i !== pat.graph.generators.length) {
      this.tool("graph.add(before=-1)");
    }

    loadUIData(this, uidata);

    for (let i=0; i<3; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }


  update() {
    super.update();

    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let pat = this.ctx.pattern;

    let key = pat.graph.length;

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this._rebuild = true;
    }

    if (this._rebuild) {
      try {
        this.rebuild();
      } catch (error) {
        console.error(error.stack);
        console.error(error.message);
      }
    }
  }
}

UIBase.register(GraphEditor);

export class GraphPattern extends Pattern {
  constructor() {
    super();

    this._last_shader_key = undefined;
    this.graph = new MLGraph();
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    st.struct("graph", "graph", "Graph", api.mapStruct(MLGraph, false));

    return st;
  }

  static buildSidebar(ctx, con) {
    super.buildSidebar(ctx, con);

    let elem = UIBase.createElement("fractal-graph-editor-x");
    con.add(elem);
  }

  static patternDef() {
    return {
      typeName     : "graph",
      uiName       : "Graph",
      sliderDef    : [
        {name: "gain"},//0
        {name: "color"},//1
        {name: "colorscale"},//2
        {name: "brightness"},//3
        {name: "valoffset"},//4

        "x", "y", "scale",
      ],
      offsetSliders: {
        x    : 5,
        y    : 6,
        scale: 7
      },
      shader       : `
float pattern(float ix, float iy) {
  return 0.5;
}
      `
    }
  }

  getFragmentCode() {
    return this.graph.generate();
    //this.graph.getShaderCode();
    return super.getFragmentCode();
  }


  viewportDraw(ctx, gl, uniforms = {}, defines = {}) {
    let key = this.graph.genUpdateKey();

    if (key !== this._last_shader_key) {
      this._last_shader_key = key;
      console.warn("shader update", key);

      if (this.shader) {
        this.shader.destroy(gl);
        this.shader = undefined;
        this.compileShader(gl);
      }
    }

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  setup(ctx, gl, uniforms, defines) {
    defines.STEPS = 5;
    defines.GAIN = "SLIDERS[0]";
    defines.COLOR_SHIFT = "SLIDERS[1]";
    defines.COLOR_SCALE = "SLIDERS[2]";
    defines.BRIGHTNESS = "SLIDERS[3]";
    defines.VALUE_OFFSET = "SLIDERS[4]";
  }
}

GraphPattern.STRUCT = nstructjs.inherit(GraphPattern, Pattern) + `
  graph : MLGraph;
}`;
Pattern.register(GraphPattern);
