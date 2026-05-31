import {
  Vector2, Vector3, Vector4, Matrix4, Quat, util,
  nstructjs, UIBase, Container, saveUIData, loadUIData,
  ToolOp, IntProperty, FloatProperty, EnumProperty, FlagProperty,
  Vec2Property, Vec3Property, StringProperty, startMenu, BoolProperty,
  ToolProperty, Menu, DataAPI, DataStruct
} from '../path.ux/scripts/pathux.js';
import {Pattern, PatternDef, PatternFlags, PatternClasses, PatternsEnum, DefineMap} from '../pattern/pattern.js';
import {MLGraph} from '../ml/ml_types.js';
import {SliderTypes} from '../pattern/pattern_types.js';
import type {UniformMap} from '../pattern/pattern_shaders.js';
import type {ToolContext} from '../core/context.js';
import type {FBO} from '../webgl/webgl.js';

import './moire.js'; //prevent warning when ToolOp.register reads GraphAddOp.inputs.type
import {Icons} from '../editors/icon_enum.js';

/* Resolve the active pattern as a GraphPattern, or undefined. */
function activeGraph(ctx: ToolContext): GraphPattern | undefined {
  let pat = ctx.pattern;
  return pat instanceof GraphPattern ? pat : undefined;
}

export class GraphAddOp extends ToolOp<{
  before: IntProperty
  type: EnumProperty
  ignoreMe: BoolProperty
}, {}, ToolContext> {
  constructor() {
    super();
  }

  static tooldef() {
    let EnumProp = PatternsEnum ? PatternsEnum : new EnumProperty(0, {});

    return {
      uiname     : "+",
      description: "Add Pattern",
      toolpath   : "graph.add",
      is_modal   : true,
      icon       : Icons.PLUS,
      inputs     : {
        before  : new IntProperty(-1),
        type    : EnumProp.copy(),
        ignoreMe: new BoolProperty()
      }
    }
  }

  static canRun(ctx: ToolContext): boolean {
    return !!ctx.pattern && ctx.pattern instanceof GraphPattern;
  }

  modalStart(ctx: ToolContext): Promise<unknown> {
    let ret = super.modalStart(ctx);

    let x = ctx.screen.mpos[0];
    let y = ctx.screen.mpos[1];

    let menu = UIBase.createElement("menu-x") as Menu<ToolContext>;

    //in case menu is cancelled, don't run op
    this.inputs.ignoreMe.setValue(true);

    for (let cls of PatternClasses) {
      let def = cls.patternDef();
      let uiname = def.uiName ?? ToolProperty.makeUIName(def.typeName);

      menu.addItem(uiname, PatternsEnum?.values[def.typeName]);
    }

    menu._onselect = (id: string | number) => {
      this.inputs.ignoreMe.setValue(false);
      this.inputs.type.setValue(typeof id === "number" ? id : parseInt(id));
      this.exec(ctx);
    }

    menu._onclose = () => {
    }

    if (this.modalRunning) {
      this.modalEnd(false);
    }

    menu.ctx = ctx;

    startMenu(menu, x, y);

    return ret;
  }

  exec(ctx: ToolContext): void {
    if (this.inputs.ignoreMe.getValue()) {
      return;
    }

    let pat = activeGraph(ctx);
    if (!pat) {
      return;
    }

    let typeId = this.inputs.type.getValue();
    let i = this.inputs.before.getValue();

    console.log("adding pattern!", pat, typeId, i);

    let type = PatternsEnum?.keys[typeId];
    let pat2: Pattern | undefined;

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
    pat.drawGen++;

    window.redraw_viewport();
  }
}

ToolOp.register(GraphAddOp);

export class GraphRemoveOp extends ToolOp<{
  index: IntProperty
}, {}, ToolContext> {
  constructor() {
    super();
  }

  static tooldef() {
    let EnumProp = PatternsEnum ? PatternsEnum : new EnumProperty(0, {});

    return {
      uiname     : "-",
      description: "Remove Pattern",
      toolpath   : "graph.remove",
      icon       : Icons.DELETE,
      inputs     : {
        index: new IntProperty()
      }
    }
  }

  static canRun(ctx: ToolContext): boolean {
    return !!ctx.pattern && ctx.pattern.typeName === "graph";

  }

  exec(ctx: ToolContext): void {
    let pat = activeGraph(ctx);
    if (!pat) {
      return;
    }

    let index = this.inputs.index.getValue();

    let gen = pat.graph.generators[index];

    console.warn(index, pat, pat.graph);

    if (!gen) {
      console.error("Invalid generator at index", index);
      ctx.error("Error removing pattern");
      return;
    }

    pat.graph.remove(gen);
    pat.drawGen++;

    window.redraw_viewport();
  }
}

ToolOp.register(GraphRemoveOp);


export class GraphMoveUp extends ToolOp<{
  index: IntProperty
}, {}, ToolContext> {
  constructor() {
    super();
  }

  static tooldef() {
    let EnumProp = PatternsEnum ? PatternsEnum : new EnumProperty(0, {});

    return {
      uiname     : "-",
      description: "Move Pattern Up",
      toolpath   : "graph.move_up",
      icon       : Icons.CHEVRON_UP,
      inputs     : {
        index: new IntProperty()
      }
    }
  }

  static canRun(ctx: ToolContext): boolean {
    return !!ctx.pattern && ctx.pattern.typeName === "graph";

  }

  exec(ctx: ToolContext): void {
    let pat = activeGraph(ctx);
    if (!pat) {
      return;
    }

    let index = this.inputs.index.getValue();

    let gen = pat.graph.generators[index];

    console.warn(index, pat, pat.graph);

    if (!gen) {
      console.error("Invalid generator at index", index);
      ctx.error("Error removing pattern");
      return;
    }

    console.log("Move up");

    pat.graph.move(gen, -1);
    pat.drawGen++;

    window.redraw_viewport();
  }
}

ToolOp.register(GraphMoveUp);

export class GraphMoveDown extends ToolOp<{
  index: IntProperty
}, {}, ToolContext> {
  constructor() {
    super();
  }

  static tooldef() {
    let EnumProp = PatternsEnum ? PatternsEnum : new EnumProperty(0, {});

    return {
      uiname     : "-",
      description: "Move Pattern Down",
      toolpath   : "graph.move_down",
      icon       : Icons.CHEVRON_DOWN,
      inputs     : {
        index: new IntProperty()
      }
    }
  }

  static canRun(ctx: ToolContext): boolean {
    return !!ctx.pattern && ctx.pattern.typeName === "graph";

  }

  exec(ctx: ToolContext): void {
    let pat = activeGraph(ctx);
    if (!pat) {
      return;
    }

    let index = this.inputs.index.getValue();

    let gen = pat.graph.generators[index];

    console.warn(index, pat, pat.graph);

    if (!gen) {
      console.error("Invalid generator at index", index);
      ctx.error("Error removing pattern");
      return;
    }

    console.log("Move up");

    pat.graph.move(gen, 1);
    pat.drawGen++;

    window.redraw_viewport();
  }
}

ToolOp.register(GraphMoveDown);

export class GraphEditor extends Container {
  _update_digest: InstanceType<typeof util.HashDigest>
  _last_update_key: number | undefined
  _rebuild: boolean

  constructor() {
    super();

    this._update_digest = new util.HashDigest();
    this._last_update_key = undefined;
    this._rebuild = true;
  }

  static define() {
    return {
      tagname: "fractal-graph-editor-x"
    }
  }

  /* The live context is always a ToolContext at runtime. */
  get toolCtx(): ToolContext {
    return this.ctx as ToolContext;
  }

  rebuild(): void {
    let pat = this.toolCtx.pattern;

    if (!pat || !(pat instanceof GraphPattern)) {
      return;
    }

    this._rebuild = false;
    let uidata = saveUIData(this, "data");

    this.clear();
    this.label("Editor");

    this.useIcons(2);
    this.tool("graph.add(before=0)");
    this.useIcons(false);

    let i = 0;

    let badparams = new Set(["_factor", "_blend_mode", "depend"]);

    let gen_i = 0;

    for (let gen of pat.graph.generators) {
      let panel = this.panel(gen.typeName + ":" + gen.id);

      panel.panelFrame.titleframe.useIcons(2);
      panel.panelFrame.titleframe.tool(`graph.remove(index=${gen_i})`);

      let strip = panel.panelFrame.titleframe;//.strip();
      strip.tool(`graph.move_up(index=${gen_i})`);
      strip.tool(`graph.move_down(index=${gen_i})`);

      gen_i++;

      let parami = gen.sliders.getParamIndex("_factor");
      if (parami !== -1) {
        panel.prop(`pattern.graph.nodes[${i}].paramDef[${parami}].value`);
      }

      parami = gen.sliders.getParamIndex("_blend_mode");
      if (parami !== -1) {
        panel.prop(`pattern.graph.nodes[${i}].paramDef[${parami}].value`);
      }

      let panel3 = panel.panel("Settings");
      panel3.dataPrefix = `pattern.graph.nodes[${i}]`;

      //hackish way to prevent Pattern.buildSidebar from being
      //called by children!
      Pattern._no_base_sidebar = true;
      gen.constructor.buildSidebar(this.toolCtx, panel3);
      Pattern._no_base_sidebar = false;

      panel3.closed = true;

      let panel2 = panel.panel("Sliders");
      let pj = 0, pcount = 0;
      let param = gen.sliders.params[0];

      for (let j = 0; j < gen.sliders.length; j++) {
        /* param.type is a numeric SliderTypes code; this comparison to the
         * literal "string" is always false (preserved from the original JS). */
        while (String(param.type) === "string") {
          pj++;
          param = gen.sliders.params[pj];
        }

        if (!badparams.has(param.name)) {
          let path = `pattern.graph.nodes[${i}].sliders[${j}].value`;
          let slider = UIBase.createElement("numslider-x") as UIBase;
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

      this.useIcons(2);
      this.tool(`graph.add(before=${i + 1})`);
      this.useIcons(false);
      i++;
    }

    if (i !== pat.graph.generators.length) {
      this.useIcons(2);
      this.tool("graph.add(before=-1)");
      this.useIcons(false);
    }

    loadUIData(this, uidata);

    for (let i = 0; i < 3; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }


  update(): void {
    super.update();

    let pat = this.toolCtx?.pattern;

    if (!pat || !(pat instanceof GraphPattern)) {
      return;
    }

    let hash = this._update_digest.reset();

    hash.add(pat.graph.length);
    for (let gen of pat.graph.generators) {
      hash.add(gen.id);
    }

    let key = hash.get();

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this._rebuild = true;
    }

    if (this._rebuild) {
      try {
        this.rebuild();
      } catch (error) {
        if (error instanceof Error) {
          console.error(error.stack);
          console.error(error.message);
        }
      }
    }
  }
}

UIBase.register(GraphEditor);

export class GraphPattern extends Pattern {
  _last_shader_key: number | undefined
  graph: MLGraph
  _last_update_key: number | undefined

  constructor() {
    super();

    this._last_shader_key = undefined;
    this.graph = new MLGraph();
    this._last_update_key = undefined;
  }

  static apiDefine(api: DataAPI): DataStruct | undefined {
    let st = super.apiDefine(api);

    st?.struct("graph", "graph", "Graph", api.mapStruct(MLGraph, false));

    return st;
  }

  static buildSidebar(ctx: ToolContext, con: Container): void {
    super.buildSidebar(ctx, con);

    let elem = UIBase.createElement("fractal-graph-editor-x") as UIBase;
    con.add(elem);
  }

  static patternDef(): PatternDef {
    return {
      typeName     : "graph",
      uiName       : "Graph",
      sliderDef    : [
        {name: "gain", value: 1.0},//0
        {name: "color", value: 0.65},//1
        {name: "colorscale", value: 1.0},//2
        {name: "brightness", value: 1.0},//3
        {name: "valoffset", value: 1.0},//4
        "x", //5
        "y", //6
        {name: "scale", value: 1.0}, //7
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

  getFragmentCode(): string {
    return this.graph.generate();
    //this.graph.getShaderCode();
    return super.getFragmentCode();
  }


  viewportDraw(ctx: ToolContext, gl: AppGL, uniforms: UniformMap = {}, defines: DefineMap = {}): void {
    this.checkUpdate(gl);

    super.viewportDraw(ctx, gl, uniforms, defines);
  }

  _doViewportDraw(ctx: ToolContext, canvas: HTMLCanvasElement, gl: AppGL, enableAccum: boolean,
                  finalOnly                                  = false,
                  finalFbo: FBO | null | undefined           = undefined,
                  customUVs: [number, number][] | undefined  = undefined,
                  customSize: [number, number] | undefined   = undefined): void {
    this.checkUpdate(gl);

    super._doViewportDraw(ctx, canvas, gl, enableAccum, finalOnly, finalFbo, customUVs, customSize);
  }

  checkUpdate(gl: AppGL): void {
    let key = this.graph.genShaderKey();

    if (key !== this._last_shader_key) {
      this._last_shader_key = key;
      console.warn("shader update", key);

      if (this.shader) {
        this.shader.destroy(gl);
        this.shader = undefined;
        this.compileShader(gl);
      }
    }

    key = this.graph.genUpdateKey();

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.drawGen++;
    }
  }

  setup(ctx: ToolContext, gl: AppGL, uniforms: UniformMap, defines: DefineMap): void {
    let transform = this.constructor.patternDef().offsetSliders;

    this.graph.setupShader(ctx, gl, uniforms, defines, this.sliders, transform);

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
