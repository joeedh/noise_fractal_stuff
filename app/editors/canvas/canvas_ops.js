import {
  Vector2, Vector3, Matrix4, Quat, util,
  math, ToolOp, ToolProperty, FloatProperty,
  EnumProperty, IntProperty, BoolProperty,
  StringProperty, nstructjs, eventWasTouch, Vec2Property,
  UIBase
} from '../../path.ux/pathux.js';
import {Icons} from '../icon_enum.js';
import {taskManager} from '../../core/task.js';

export class CanvasOp extends ToolOp {
  constructor() {
    super();

    this.drawLines = [];
    this.drawBoxes = [];
  }

  static canRun(ctx) {
    return !!ctx.pattern;
  }

  resetDrawGeom() {
    for (let line of this.drawLines) {
      line.end();
    }

    for (let box of this.drawBoxes) {
      box.end();
    }

    this.drawLines.length = 0;
    this.drawBoxes.length = 0;
  }

  modalEnd(was_cancelled) {
    this.resetDrawGeom(this.modal_ctx);

    super.modalEnd(was_cancelled);
  }

  addDrawBox(x, y, w, h) {
    let canvas = this.modal_ctx.canvas;
    let dbox = canvas.addDrawBox(x, y, w, h);

    this.drawBoxes.push(dbox);
    return dbox;
  }

  undoPre(ctx) {
    let pat = ctx.pattern;

    this._undo = {
      type   : pat.typeName,
      sliders: util.list(pat.sliders),

      /*patterns are allowed to override transform to not fetch from sliders,
       so store explicitly too*/
      offsetx: pat.offsetx,
      offsety: pat.offsety,
      scale  : pat.scale
    }
  }

  undo(ctx) {
    let ud = this._undo;

    ctx.model.getPattern(ud.type);

    let pat = ctx.pattern;
    for (let i = 0; i < ud.sliders.length; i++) {
      pat.sliders[i] = ud.sliders[i];
    }

    pat.offsetx = ud.offsetx;
    pat.offsety = ud.offsety;
    pat.scale = ud.scale;

    pat.drawGen++;
    window.redraw_viewport();

    ctx.state.autoSave();
  }

  exexPre(ctx) {
    taskManager.stopNamed("zoom");
  }

  execPost(ctx) {
    ctx.pattern.drawGen++;
    window.redraw_viewport();

    ctx.state.autoSave();
  }
}

export class ResetOp extends CanvasOp {
  static tooldef() {
    return {
      uiname     : "Reset",
      toolpath   : "canvas.reset_view",
      icon       : Icons.HOME,
      description: "Zoom out fully",
    }
  }

  exec(ctx) {
    let pat = ctx.pattern;

    let pdef = pat.constructor.getPatternDef();

    pat.offsetx = pdef.sliderDef[pdef.offsetSliders.x].value ?? 0;
    pat.offsety = pdef.sliderDef[pdef.offsetSliders.y].value ?? 0;
    pat.scale = pdef.sliderDef[pdef.offsetSliders.scale].value ?? 4.75;
  }
}

ToolOp.register(ResetOp);

export class CanvasZoomOp extends CanvasOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.mpos = new Vector2();

    this.first = true;
  }

  static tooldef() {
    return {
      uiname     : "Zoom Canvas",
      description: "Drag a box to zoom canvas",
      toolpath   : "canvas.zoom",
      inputs     : ToolOp.inherit({
        offset: new Vec2Property(),
        scale : new FloatProperty().noUnits(),

        startX       : new FloatProperty().setBaseUnit("pixel").setDisplayUnit("pixel"),
        startY       : new FloatProperty().setBaseUnit("pixel").setDisplayUnit("pixel"),
        hasStartMouse: new BoolProperty()
      }),
      outputs    : ToolOp.inherit({}),
      is_modal   : true,
    }
  }

  cancel() {
    this.modalEnd(true);
  }

  on_mousedown(e) {
    return this.on_mousemove(e);
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;
    let canvas = ctx.canvas;
    let pat = ctx.pattern;

    let mpos = canvas._getMouse(e);
    this.mpos.load(mpos);

    if (this.first) {
      this.first = false;

      if (this.inputs.hasStartMouse.getValue()) {
        this.last_mpos[0] = this.inputs.startX.getValue();
        this.last_mpos[1] = this.inputs.startY.getValue();
      } else {
        this.last_mpos.load(mpos);
        return;
      }
    }

    this.resetDrawGeom();

    let a = this.last_mpos, b = this.mpos;

    let pos = new Vector2(), size = new Vector2();

    pos[0] = Math.min(a[0], b[0]);
    pos[1] = Math.min(a[1], b[1]);

    size[0] = Math.max(a[0], b[0]) - pos[0];
    size[1] = Math.max(a[1], b[1]) - pos[1];

    this.addDrawBox(pos[0], pos[1], size[0], size[1]);

    //be slightly above .5 to give some wiggle room
    size.mulScalar(0.6);

    let dimen = Math.max(size[0], size[1]);
    let cent = new Vector2(pos).addFac(size, 0.5);

    pos.load(cent).subScalar(dimen*0.5);

    let pos2 = new Vector2(cent).addScalar(dimen*0.5);

    canvas.transform(pos);
    canvas.transform(pos2);
    canvas.transform(cent);

    let min = new Vector2().addScalar(1e17);
    let max = new Vector2().addScalar(-1e17);

    min.min(pos);
    min.min(pos2);

    max.max(pos);
    max.max(pos2);

    max.sub(min);

    let scale = max[0]*0.5 + max[1]*0.5;

    min.addFac(max, 0.5);
    console.log("POS", min);

    //scale = pat.scale;
    this.inputs.offset.setValue(min);
    this.inputs.scale.setValue(scale);

    console.error(scale);
  }

  on_mouseup(e) {
    let cancel = this.first || (e.button !== 0 && !eventWasTouch(e));
    let ctx = this.modal_ctx;

    this.modalEnd(cancel);

    let pat = ctx.pattern;

    let startscale = pat.scale;
    let startx = pat.offsetx*pat.scale;
    let starty = pat.offsety*pat.scale;
    let steps = 18;

    let off = this.inputs.offset.getValue();
    let endx = off[0];
    let endy = off[1];
    let endscale = this.inputs.scale.getValue();

    let t = 0, dt = 1.0/(steps - 1);

    if (!cancel) {
      //this.exec(ctx);
      taskManager.range("zoom", 0, steps, (i) => {
        let t = i*dt;

        let x = startx + (endx - startx)*t;
        let y = starty + (endy - starty)*t;
        let scale = startscale + (endscale - startscale)*t;

        console.log("zoom!", i, t, "scale", scale.toFixed(2));

        pat.offsetx = x/scale;
        pat.offsety = y/scale;
        pat.scale = scale;

        pat.drawGen++;
        window.redraw_viewport();

        if (i === steps - 1) {
          ctx.state.autoSave();
        }
      }).unique().start();
    }
  }

  exec(ctx) {
    let pat = ctx.pattern;

    let offset = this.inputs.offset.getValue();
    let scale = this.inputs.scale.getValue();

    pat.offsetx = offset[0]/scale;
    pat.offsety = offset[1]/scale;
    pat.scale = scale;

    pat.drawGen++;
    window.redraw_viewport();
  }
}

ToolOp.register(CanvasZoomOp);

export class StepZoomOp extends CanvasOp {
  static tooldef() {
    return {
      uiname  : "Zoom (step)",
      toolpath: "canvas.step_zoom",
      inputs  : {
        dir   : new IntProperty(1),
        amount: new FloatProperty(0.2)
      },
      icon : Icons.ZOOM_OUT
    }
  }

  exec(ctx) {
    let pat = ctx.pattern;

    let scale = pat.scale;
    let x = pat.offsetx * scale;
    let y = pat.offsety * scale;

    let amount = this.inputs.amount.getValue();
    let dir = -this.inputs.dir.getValue();

    scale *= 1.0 + amount * dir;

    pat.scale = scale;
    pat.offsetx = x / scale;
    pat.offsety = y / scale;

    pat.drawGen++;
  }
}

ToolOp.register(StepZoomOp);
