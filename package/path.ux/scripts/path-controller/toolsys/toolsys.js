"use strict";
import nstructjs from '../util/struct.js';

/**

 ToolOps are base operators for modifying application state.
 They operate on Contexts and can use the datapath API.
 They make up the undo stack.

 ToolOp subclasses handle undo with their undoPre (run before tool execution)
 and undo methods.  You can set default handlers (most commonly this is just
 saving/reloading the app state) with setDefaultUndoHandlers.

 ToolOps have inputs and outputs (which are ToolProperties) and can also
 be modal.

 ## Rules

 Tools are never, EVER allowed to store direct pointers to the application state,
 with one exception: tools in modal mode may store such pointers, but they must
 delete them when existing modal mode by overriding modalEnd.

 This is to prevent very evil and difficult to debug bugs in the undo stack
 and nasty memory leaks.

 ## Example

 <pre>

 const ExampleEnum = {
  ITEM1 : 0,
  ITEM2 : 1
}

 class MyTool extends ToolOp {
  static tooldef() {
    return {
      uiname     : "Tool Name",
      toolpath   : "my.tool",
      inputs     : {
          input1 : new IntProperty(),
          input2 : new EnumProperty(0, ExampleEnum)
      },
      outputs    : {
          someoutput : new IntProperty
      }
    }
  }

  undoPre(ctx) {
    //run before tool starts
  }

  undo(ctx) {
    //undo handler
  }

  execPre(ctx) {
    //run right before exec
  }
  exec(ctx) {
    //main execution method
  }
  execPost(ctx) {
    //run right after exec
  }
}
 ToolOp.register(MyTool);

 </pre>
 */

import * as events from '../util/events.js';
import {keymap} from '../util/simple_events.js';
import {PropFlags, PropTypes} from './toolprop.js';
import {DataPath} from '../controller/controller_base.js';
import * as util from '../util/util.js';

export let ToolClasses = [];
window._ToolClasses = ToolClasses;

export function setContextClass(cls) {
  console.warn("setContextClass is deprecated");
}

export const ToolFlags = {
  PRIVATE: 1

};


export const UndoFlags = {
  NO_UNDO      : 2,
  IS_UNDO_ROOT : 4,
  UNDO_BARRIER : 8,
  HAS_UNDO_DATA: 16
};

class InheritFlag {
  constructor(slots = {}) {
    this.slots = slots;
  }
}

let modalstack = [];

let defaultUndoHandlers = {
  undoPre(ctx) {
    throw new Error("implement me");
  },
  undo(ctx) {
    throw new Error("implement me");
  }
}

export function setDefaultUndoHandlers(undoPre, undo) {
  if (!undoPre || !undo) {
    throw new Error("invalid parameters to setDefaultUndoHandlers");
  }

  defaultUndoHandlers.undoPre = undoPre;
  defaultUndoHandlers.undo = undo;
}

export class ToolPropertyCache {
  constructor() {
    this.map = new Map();
    this.pathmap = new Map();
    this.accessors = {};

    this.userSetMap = new Set();

    this.api = undefined;
    this.dstruct = undefined;
  }

  static getPropKey(cls, key, prop) {
    return prop.apiname && prop.apiname.length > 0 ? prop.apiname : key;
  }

  _buildAccessors(cls, key, prop, dstruct, api) {
    let tdef = cls._getFinalToolDef();

    this.api = api;
    this.dstruct = dstruct;

    if (!tdef.toolpath) {
      console.warn("Bad tool property", cls, "it's tooldef was missing a toolpath field");
      return;
    }

    let path = tdef.toolpath.trim().split(".").filter(f => f.trim().length > 0);
    let obj = this.accessors;

    let st = dstruct;
    let partial = "";

    for (let i = 0; i < path.length; i++) {
      let k = path[i];
      let pathk = k;

      if (i === 0) {
        pathk = "accessors." + k;
      }

      if (i > 0) {
        partial += ".";
      }
      partial += k;

      if (!(k in obj)) {
        obj[k] = {};
      }

      let st2 = api.mapStruct(obj[k], true, k);
      if (!(k in st.pathmap)) {
        st.struct(pathk, k, k, st2);
      }
      st = st2;

      this.pathmap.set(partial, obj[k]);

      obj = obj[k];
    }

    let name = prop.apiname !== undefined && prop.apiname.length > 0 ? prop.apiname : key;
    let prop2 = prop.copy()

    let dpath = new DataPath(name, name, prop2);
    let uiname = prop.uiname;

    if (!uiname || uiname.trim().length === 0) {
      uiname = prop.apiname;
    }
    if (!uiname || uiname.trim().length === 0) {
      uiname = key;
    }

    uiname = ToolProperty.makeUIName(uiname);

    prop2.uiname = uiname;
    prop2.description = prop2.description || prop2.uiname;

    st.add(dpath);

    obj[name] = prop2.getValue();
  }

  _getAccessor(cls) {
    let toolpath = cls.tooldef().toolpath.trim();
    return this.pathmap.get(toolpath);
  }

  useDefault(cls, key, prop) {
    key = this.userSetMap.has(cls.tooldef().trim() + "." + this.constructor.getPropKey(key));
    key = key.trim();

    return key;
  }

  has(cls, key, prop) {
    if (prop.flag & PropFlags.NO_DEFAULT) {
      return false;
    }

    let obj = this._getAccessor(cls);

    key = this.constructor.getPropKey(cls, key, prop);
    return obj && key in obj;
  }

  get(cls, key, prop) {
    if (cls === ToolMacro) {
      return;
    }

    let obj = this._getAccessor(cls);
    key = this.constructor.getPropKey(cls, key, prop);

    if (obj) {
      return obj[key];
    }

    return undefined;
  }

  set(cls, key, prop) {
    if (cls === ToolMacro) {
      return;
    }

    let toolpath = cls.tooldef().toolpath.trim();
    let obj = this._getAccessor(cls);

    if (!obj) {
      console.warn("Warning, toolop " + cls.name + " was not in the default map; unregistered?");
      this._buildAccessors(cls, key, prop, this.dstruct, this.api);

      obj = this.pathmap.get(toolpath);
    }

    if (!obj) {
      console.error("Malformed toolpath in toolop definition: " + toolpath);
      return;
    }

    key = this.constructor.getPropKey(cls, key, prop);

    //copy prop first in case we're a non-primitive-value type, e.g. vector properties
    obj[key] = prop.copy().getValue();

    let path = toolpath + "." + key;
    this.userSetMap.add(path);

    return this;
  }
}

export const SavedToolDefaults = new ToolPropertyCache();

export class ToolOp extends events.EventHandler {
  /**
   Main ToolOp constructor.  It reads the inputs/outputs properteis from
   this.constructor.tooldef() and copies them to build this.inputs and this.outputs.
   If inputs or outputs are wrapped in ToolOp.inherit(), it will walk up the class
   chain to fetch parent class properties.


   Default input values are loaded from SavedToolDefaults.  If initialized (buildToolSysAPI
   has been called) SavedToolDefaults will have a copy of all the default
   property values of all registered ToolOps.
   **/

  constructor() {
    super();

    this._pointerId = undefined;
    this._overdraw = undefined;
    this.__memsize = undefined;

    var def = this.constructor.tooldef();

    if (def.undoflag !== undefined) {
      this.undoflag = def.undoflag;
    }

    if (def.flag !== undefined) {
      this.flag = def.flag;
    }

    this._accept = this._reject = undefined;
    this._promise = undefined;

    for (var k in def) {
      this[k] = def[k];
    }

    let getSlots = (slots, key) => {
      if (slots === undefined)
        return {};

      if (!(slots instanceof InheritFlag)) {
        return slots;
      }

      slots = {};
      let p = this.constructor;
      let lastp = undefined;

      while (p !== undefined && p !== Object && p !== ToolOp && p !== lastp) {
        if (p.tooldef) {
          let def = p.tooldef();

          if (def[key] !== undefined) {
            let slots2 = def[key];
            let stop = !(slots2 instanceof InheritFlag);

            if (slots2 instanceof InheritFlag) {
              slots2 = slots2.slots;
            }

            for (let k in slots2) {
              if (!(k in slots)) {
                slots[k] = slots2[k];
              }
            }

            if (stop) {
              break;
            }
          }
        }

        lastp = p;
        p = p.prototype.__proto__.constructor;
      }

      return slots;
    };

    let dinputs = getSlots(def.inputs, "inputs");
    let doutputs = getSlots(def.outputs, "outputs");

    this.inputs = {};
    this.outputs = {};

    if (dinputs) {
      for (let k in dinputs) {
        let prop = dinputs[k].copy();
        prop.apiname = prop.apiname && prop.apiname.length > 0 ? prop.apiname : k;

        if (!this.hasDefault(prop, k)) {
          this.inputs[k] = prop;
          continue;
        }

        try {
          prop.setValue(this.getDefault(prop, k));
        } catch (error) {
          console.log(error.stack);
          console.log(error.message);
        }

        prop.wasSet = false;
        this.inputs[k] = prop;
      }
    }

    if (doutputs) {
      for (let k in doutputs) {
        let prop = doutputs[k].copy();
        prop.apiname = prop.apiname && prop.apiname.length > 0 ? prop.apiname : k;

        this.outputs[k] = prop;
      }
    }

    this.drawlines = [];
  }

  /**
   ToolOp definition.

   An example:
   <pre>
   static tooldef() {
    return {
      uiname   : "Tool Name",
      toolpath : "logical_module.tool", //logical_module need not match up to a real module
      icon     : -1, //tool's icon, or -1 if there is none
      description : "tooltip",
      is_modal : false, //tool is interactive and takes control of events
      hotkey   : undefined,
      undoflag : 0, //see UndoFlags
      flag     : 0,
      inputs   : ToolOp.inherit({
        f32val : new Float32Property(1.0),
        path   : new StringProperty("./path");
      }),
      outputs  : {}
      }
    }
   </pre>
   */
  static tooldef() {
    if (this === ToolOp) {
      throw new Error("Tools must implemented static tooldef() methods!");
    }

    return {};
  }

  /** Returns a map of input property values,
   *  e.g. `let {prop1, prop2} = this.getValues()` */
  getInputs() {
    let ret = {};

    for (let k in this.inputs) {
      ret[k] = this.inputs[k].getValue();
    }

    return ret;
  }

  static Equals(a, b) {
    if (!a || !b) return false;
    if (a.constructor !== b.constructor) return false;

    let bad = false;

    for (let k in a.inputs) {
      bad = bad || !(k in b.inputs);
      bad = bad || a.inputs[k].constructor !== b.inputs[k];
      bad = bad || !a.inputs[k].equals(b.inputs[k]);

      if (bad) {
        break;
      }
    }

    return !bad;
  }

  static inherit(slots = {}) {
    return new InheritFlag(slots);
  }

  /**

   Creates a new instance of this toolop from args and a context.
   This is often use to fill properties with default arguments
   stored somewhere in the context.

   */
  static invoke(ctx, args) {
    let tool = new this();

    for (let k in args) {
      if (!(k in tool.inputs)) {
        console.warn("Unknown tool argument " + k);
        continue;
      }

      let prop = tool.inputs[k];
      let val = args[k];

      if ((typeof val === "string") && prop.type & (PropTypes.ENUM | PropTypes.FLAG)) {
        if (val in prop.values) {
          val = prop.values[val];
        } else {
          console.warn("Possible invalid enum/flag:", val);
          continue;
        }
      }

      tool.inputs[k].setValue(val);
    }

    return tool;
  }

  static register(cls) {
    if (ToolClasses.indexOf(cls) >= 0) {
      console.warn("Tried to register same ToolOp class twice:", cls.name, cls);
      return;
    }

    ToolClasses.push(cls);
  }

  static _regWithNstructjs(cls, structName = cls.name) {
    if (nstructjs.isRegistered(cls)) {
      return;
    }

    let parent = cls.prototype.__proto__.constructor;

    if (!cls.hasOwnProperty("STRUCT")) {
      if (parent !== ToolOp && parent !== ToolMacro && parent !== Object) {
        this._regWithNstructjs(parent);
      }

      cls.STRUCT = nstructjs.inherit(cls, parent) + '}\n';
    }

    nstructjs.register(cls);
  }

  static isRegistered(cls) {
    return ToolClasses.indexOf(cls) >= 0;
  }

  static unregister(cls) {
    if (ToolClasses.indexOf(cls) >= 0) {
      ToolClasses.remove(cls);
    }
  }

  static _getFinalToolDef() {
    let def = this.tooldef();

    let getSlots = (slots, key) => {
      if (slots === undefined)
        return {};

      if (!(slots instanceof InheritFlag)) {
        return slots;
      }

      slots = {};
      let p = this

      while (p !== undefined && p !== Object && p !== ToolOp) {
        if (p.tooldef) {
          let def = p.tooldef();

          if (def[key] !== undefined) {
            let slots2 = def[key];
            let stop = !(slots2 instanceof InheritFlag);

            if (slots2 instanceof InheritFlag) {
              slots2 = slots2.slots;
            }

            for (let k in slots2) {
              if (!(k in slots)) {
                slots[k] = slots2[k];
              }
            }

            if (stop) {
              break;
            }
          }

        }
        p = p.prototype.__proto__.constructor;
      }

      return slots;
    };

    let dinputs = getSlots(def.inputs, "inputs");
    let doutputs = getSlots(def.outputs, "outputs");

    def.inputs = dinputs;
    def.outputs = doutputs;

    return def;
  }

  static onTick() {
    for (let toolop of modalstack) {
      toolop.on_tick();
    }
  }

  static searchBoxOk(ctx) {
    let flag = this.tooldef().flag;
    let ret = !(flag && (flag & ToolFlags.PRIVATE));
    ret = ret && this.canRun(ctx);

    return ret;
  }

  //toolop is an optional instance of this class, may be undefined
  static canRun(ctx, toolop = undefined) {
    return true;
  }

  /** Called when the undo system needs to destroy
   *  this toolop to save memory*/
  onUndoDestroy() {

  }

  /** Used by undo system to limit memory */
  calcMemSize(ctx) {
    if (this.__memsize !== undefined) {
      return this.__memsize;
    }

    let tot = 0;

    for (let step = 0; step < 2; step++) {
      let props = step ? this.outputs : this.inputs;

      for (let k in props) {
        let prop = props[k];

        let size = prop.calcMemSize();

        if (isNaN(size) || !isFinite(size)) {
          console.warn("Got NaN when calculating mem size for property", prop);
          continue;
        }

        tot += size;
      }
    }

    let size = this.calcUndoMem(ctx);

    if (isNaN(size) || !isFinite(size)) {
      console.warn("Got NaN in calcMemSize", this);
    } else {
      tot += size;
    }

    this.__memsize = tot;

    return tot;
  }

  loadDefaults(force = true) {
    for (let k in this.inputs) {
      let prop = this.inputs[k];

      if (!force && prop.wasSet) {
        continue;
      }

      if (this.hasDefault(prop, k)) {
        prop.setValue(this.getDefault(prop, k));
        prop.wasSet = false;
      }
    }

    return this;
  }

  hasDefault(toolprop, key = toolprop.apiname) {
    return SavedToolDefaults.has(this.constructor, key, toolprop);
  }

  getDefault(toolprop, key = toolprop.apiname) {
    let cls = this.constructor;

    if (SavedToolDefaults.has(cls, key, toolprop)) {
      return SavedToolDefaults.get(cls, key, toolprop);
    } else {
      return toolprop.getValue();
    }
  }

  saveDefaultInputs() {
    for (let k in this.inputs) {
      let prop = this.inputs[k];

      if (prop.flag & PropFlags.SAVE_LAST_VALUE) {
        SavedToolDefaults.set(this.constructor, k, prop);
      }
    }

    return this;
  }

  genToolString() {
    let def = this.constructor.tooldef();
    let path = def.toolpath + "(";

    for (let k in this.inputs) {
      let prop = this.inputs[k];

      path += k + "=";
      if (prop.type === PropTypes.STRING)
        path += "'";

      if (prop.type === PropTypes.FLOAT) {
        path += prop.getValue().toFixed(3);
      } else {
        path += prop.getValue();
      }

      if (prop.type === PropTypes.STRING)
        path += "'";
      path += " ";
    }
    path += ")";
    return path;
  }

  on_tick() {

  }

  /**default on_keydown implementation for modal tools,
   no need to call super() to execute this if you don't want to*/
  on_keydown(e) {
    switch (e.keyCode) {
      case keymap["Enter"]:
      case keymap["Space"]:
        this.modalEnd(false);
        break;
      case keymap["Escape"]:
        this.modalEnd(true);
        break;
    }
  }

  //called after undoPre
  calcUndoMem(ctx) {
    console.warn("ToolOp.prototype.calcUndoMem: implement me!");
    return 0;
  }

  undoPre(ctx) {
    throw new Error("implement me!");
  }

  undo(ctx) {
    throw new Error("implement me!");
    //_appstate.loadUndoFile(this._undo);
  }

  redo(ctx) {
    this._was_redo = true; //also set by toolstack.redo

    this.undoPre(ctx);
    this.execPre(ctx);
    this.exec(ctx);
    this.execPost(ctx);
  }

  //for compatibility with fairmotion
  exec_pre(ctx) {
    this.execPre(ctx);
  }

  execPre(ctx) {
  }

  exec(ctx) {
  }

  execPost(ctx) {

  }

  /**for use in modal mode only*/
  resetTempGeom() {
    var ctx = this.modal_ctx;

    for (var dl of this.drawlines) {
      dl.remove();
    }

    this.drawlines.length = 0;
  }

  error(msg) {
    console.warn(msg);
  }

  getOverdraw() {
    if (this._overdraw === undefined) {
      this._overdraw = document.createElement("overdraw-x");
      this._overdraw.start(this.modal_ctx.screen);
    }

    return this._overdraw;
  }

  /**for use in modal mode only*/
  makeTempLine(v1, v2, style) {
    let line = this.getOverdraw().line(v1, v2, style);
    this.drawlines.push(line);
    return line;
  }

  pushModal(node) {
    throw new Error("cannot call this; use modalStart")
  }

  popModal() {
    throw new Error("cannot call this; use modalEnd");
  }

  /**returns promise to be executed on modalEnd*/
  modalStart(ctx) {
    if (this.modalRunning) {
      console.warn("Warning, tool is already in modal mode consuming events");
      return this._promise;
    }

    this.modal_ctx = ctx;
    this.modalRunning = true

    this._promise = new Promise((accept, reject) => {
      this._accept = accept;
      this._reject = reject;

      modalstack.push(this);

      if (this._pointerId !== undefined) {
        super.pushPointerModal(ctx.screen, this._pointerId);
      } else {
        super.pushModal(ctx.screen);
      }
    });

    return this._promise;
  }

  /*eek, I've not been using this.
    guess it's a non-enforced contract, I've been naming
    cancel methods 'cancel' all this time.

    XXX fix
  */
  toolCancel() {
  }

  modalEnd(was_cancelled) {
    if (this._modalstate) {
      modalstack.pop();
    }

    if (this._overdraw !== undefined) {
      this._overdraw.end();
      this._overdraw = undefined;
    }

    if (was_cancelled && this._on_cancel !== undefined) {
      if (this._accept) {
        this._accept(this.modal_ctx, true);
      }

      this._on_cancel(this);
      this._on_cancel = undefined;
    }

    this.resetTempGeom();

    var ctx = this.modal_ctx;

    this.modal_ctx = undefined;
    this.modalRunning = false;
    this.is_modal = false;

    super.popModal();

    this._promise = undefined;

    if (this._accept) {
      this._accept(ctx, false);//Context, was_cancelled
      this._accept = this._reject = undefined;
    }

    this.saveDefaultInputs();
  }

  loadSTRUCT(reader) {
    reader(this);

    let outs = this.outputs;
    let ins = this.inputs;

    this.inputs = {};
    this.outputs = {};

    for (let pair of ins) {
      this.inputs[pair.key] = pair.val;
    }

    for (let pair of outs) {
      this.outputs[pair.key] = pair.val;
    }
  }

  _save_inputs() {
    let ret = [];
    for (let k in this.inputs) {
      ret.push(new PropKey(k, this.inputs[k]));
    }

    return ret;
  }

  _save_outputs() {
    let ret = [];
    for (let k in this.outputs) {
      ret.push(new PropKey(k, this.outputs[k]));
    }

    return ret;
  }
}

ToolOp.STRUCT = `
toolsys.ToolOp {
  inputs  : array(toolsys.PropKey) | this._save_inputs();
  outputs : array(toolsys.PropKey) | this._save_outputs();
}
`;
nstructjs.register(ToolOp);

class PropKey {
  constructor(key, val) {
    this.key = key;
    this.val = val;
  }
}

PropKey.STRUCT = `
toolsys.PropKey {
  key : string;
  val : abstract(ToolProperty);
}
`;
nstructjs.register(PropKey);

export class MacroLink {
  constructor(sourcetool_idx, srckey, srcprops = "outputs", desttool_idx, dstkey, dstprops = "inputs") {
    this.source = sourcetool_idx;
    this.dest = desttool_idx;

    this.sourceProps = srcprops;
    this.destProps = dstprops;

    this.sourcePropKey = srckey;
    this.destPropKey = dstkey;
  }
}

MacroLink.STRUCT = `
toolsys.MacroLink {
  source         : int;
  dest           : int;
  sourcePropKey  : string;
  destPropKey    : string;
  sourceProps    : string;
  destProps      : string; 
}
`;
nstructjs.register(MacroLink);

export const MacroClasses = {};
window._MacroClasses = MacroClasses;

let macroidgen = 0;


export class ToolMacro extends ToolOp {
  constructor() {
    super();

    this.tools = [];
    this.curtool = 0;
    this.has_modal = false;
    this.connects = [];
    this.connectLinks = [];

    this._macro_class = undefined;
  }

  static tooldef() {
    return {
      uiname: "Tool Macro"
    }
  }

  //toolop is an optional instance of this class, may be undefined
  static canRun(ctx, toolop = undefined) {
    return true;
  }

  _getTypeClass() {
    if (this._macro_class && this._macro_class.ready) {
      return this._macro_class;
    }

    if (!this._macro_class) {
      this._macro_class = class MacroTypeClass extends ToolOp {
        static tooldef() {
          return this.__tooldef;
        }
      }

      this._macro_class.__tooldef = {
        toolpath: this.constructor.tooldef().toolpath || ''
      };
      this._macro_class.ready = false;
    }

    if (!this.tools || this.tools.length === 0) {
      /* We've been invoked by ToolOp constructor,
      *  for now just return an empty class  */
      return this._macro_class;
    }

    let key = "";
    for (let tool of this.tools) {
      key = tool.constructor.name + ":";
    }

    /* Handle child classes of ToolMacro */
    if (this.constructor !== ToolMacro) {
      key += ":" + this.constructor.tooldef().toolpath;
    }

    for (let k in this.inputs) {
      key += k + ":";
    }

    if (key in MacroClasses) {
      this._macro_class = MacroClasses[key];
      return this._macro_class;
    }

    let name = "Macro("
    let i = 0;
    let is_modal;

    for (let tool of this.tools) {
      let def = tool.constructor.tooldef();

      if (i > 0) {
        name += ", ";
      } else {
        is_modal = def.is_modal;
      }

      if (def.uiname) {
        name += def.uiname;
      } else if (def.toolpath) {
        name += def.toolpath;
      } else {
        name += tool.constructor.name;
      }

      i++;
    }

    let inputs = {};

    for (let k in this.inputs) {
      inputs[k] = this.inputs[k].copy().clearEventCallbacks();
      inputs[k].wasSet = false;
    }

    let tdef = {
      uiname  : name,
      toolpath: key,
      inputs,
      outputs : {},
      is_modal
    };

    let cls = this._macro_class;
    cls.__tooldef = tdef;
    cls._macroTypeId = macroidgen++;
    cls.ready = true;

    /*
    let cls = {
      name : key,
      tooldef() {
        return tdef
      },
      _getFinalToolDef() {
        return this.tooldef();
      }
    };//*/

    MacroClasses[key] = cls;

    return cls;
  }

  saveDefaultInputs() {
    for (let k in this.inputs) {
      let prop = this.inputs[k];

      if (prop.flag & PropFlags.SAVE_LAST_VALUE) {
        SavedToolDefaults.set(this._getTypeClass(), k, prop);
      }
    }

    return this;
  }

  hasDefault(toolprop, key = toolprop.apiname) {
    return SavedToolDefaults.has(this._getTypeClass(), key, toolprop);
  }

  getDefault(toolprop, key = toolprop.apiname) {
    let cls = this._getTypeClass();

    if (SavedToolDefaults.has(cls, key, toolprop)) {
      return SavedToolDefaults.get(cls, key, toolprop);
    } else {
      return toolprop.getValue();
    }
  }

  connect(srctool, srcoutput, dsttool, dstinput, srcprops = "outputs", dstprops = "inputs") {
    if (typeof dsttool === "function") {
      return this.connectCB(...arguments);
    }

    let i1 = this.tools.indexOf(srctool);
    let i2 = this.tools.indexOf(dsttool);

    if (i1 < 0 || i2 < 0) {
      throw new Error("tool not in macro");
    }

    //remove linked properties from this.inputs
    if (srcprops === "inputs") {
      let tool = this.tools[i1];

      let prop = tool.inputs[srcoutput];
      if (prop === this.inputs[srcoutput]) {
        delete this.inputs[srcoutput];
      }
    }

    if (dstprops === "inputs") {
      let tool = this.tools[i2];
      let prop = tool.inputs[dstinput];

      if (this.inputs[dstinput] === prop) {
        delete this.inputs[dstinput];
      }
    }

    this.connectLinks.push(new MacroLink(i1, srcoutput, srcprops, i2, dstinput, dstprops));
    return this;
  }

  connectCB(srctool, dsttool, callback, thisvar) {
    this.connects.push({
      srctool : srctool,
      dsttool : dsttool,
      callback: callback,
      thisvar : thisvar
    });

    return this;
  }

  add(tool) {
    if (tool.is_modal) {
      this.is_modal = true;
    }

    for (let k in tool.inputs) {
      let prop = tool.inputs[k];

      if (!(prop.flag & PropFlags.PRIVATE)) {
        this.inputs[k] = prop;
      }
    }

    this.tools.push(tool);

    return this;
  }

  _do_connections(tool) {
    let i = this.tools.indexOf(tool);

    for (let c of this.connectLinks) {
      if (c.source === i) {
        let tool2 = this.tools[c.dest];

        tool2[c.destProps][c.destPropKey].setValue(tool[c.sourceProps][c.sourcePropKey].getValue());
      }
    }

    for (var c of this.connects) {
      if (c.srctool === tool) {
        c.callback.call(c.thisvar, c.srctool, c.dsttool);
      }
    }
  }

  /*
  canRun(ctx) {
    if (this.tools.length == 0)
      return false;

    //poll first tool only in list
    return this.tools[0].constructor.canRun(ctx);
  }//*/

  modalStart(ctx) {
    //macros obviously can't call loadDefaults in the constructor
    //like normal tool ops can.
    this.loadDefaults(false);

    this._promise = new Promise((function (accept, reject) {
      this._accept = accept;
      this._reject = reject;
    }).bind(this));

    this.curtool = 0;

    let i;

    for (i = 0; i < this.tools.length; i++) {
      if (this.tools[i].is_modal)
        break;

      this.tools[i].undoPre(ctx);
      this.tools[i].execPre(ctx);
      this.tools[i].exec(ctx);
      this.tools[i].execPost(ctx);
      this._do_connections(this.tools[i]);
    }

    var on_modal_end = (function on_modal_end() {
      this._do_connections(this.tools[this.curtool]);
      this.curtool++;

      while (this.curtool < this.tools.length &&
      !this.tools[this.curtool].is_modal) {
        this.tools[this.curtool].undoPre(ctx);
        this.tools[this.curtool].execPre(ctx);
        this.tools[this.curtool].exec(ctx);
        this.tools[this.curtool].execPost(ctx);
        this._do_connections(this.tools[this.curtool]);

        this.curtool++;
      }

      if (this.curtool < this.tools.length) {
        this.tools[this.curtool].undoPre(ctx);
        this.tools[this.curtool].modalStart(ctx).then(on_modal_end);
      } else {
        this._accept(this, false);
      }
    }).bind(this);

    if (i < this.tools.length) {
      this.curtool = i;
      this.tools[this.curtool].undoPre(ctx);
      this.tools[this.curtool].modalStart(ctx).then(on_modal_end);
    }

    return this._promise;
  }

  loadDefaults(force = true) {
    return super.loadDefaults(force);
  }

  exec(ctx) {
    //macros obviously can't call loadDefaults in the constructor
    //like normal tool ops can.
    //note that this will detect if the user changes property values

    this.loadDefaults(false);

    for (var i = 0; i < this.tools.length; i++) {
      this.tools[i].undoPre(ctx);
      this.tools[i].execPre(ctx);
      this.tools[i].exec(ctx);
      this.tools[i].execPost(ctx);
      this._do_connections(this.tools[i]);
    }
  }

  calcUndoMem(ctx) {
    let tot = 0;

    for (let tool of this.tools) {
      tot += tool.calcUndoMem(ctx);
    }

    return tot;
  }

  calcMemSize(ctx) {
    let tot = 0;

    for (let tool of this.tools) {
      tot += tool.calcMemSize(ctx);
    }

    return tot;
  }

  undoPre() {
    return; //undoPre is handled in exec() or modalStart()
  }

  undo(ctx) {
    for (var i = this.tools.length - 1; i >= 0; i--) {
      this.tools[i].undo(ctx);
    }
  }
}

ToolMacro.STRUCT = nstructjs.inherit(ToolMacro, ToolOp, "toolsys.ToolMacro") + `
  tools        : array(abstract(toolsys.ToolOp));
  connectLinks : array(toolsys.MacroLink);
}
`;
nstructjs.register(ToolMacro);

export class ToolStack extends Array {
  constructor(ctx) {
    super();

    this.memLimit = 512*1024*1024;
    this.enforceMemLimit = false;

    this.cur = -1;
    this.ctx = ctx;

    this.modalRunning = 0;

    this._undo_branch = undefined; //used to save undo branch in case of tool cancel
  }

  get head() {
    return this[this.cur];
  }

  limitMemory(maxmem = this.memLimit, ctx = this.ctx) {
    if (maxmem === undefined) {
      throw new Error("maxmem cannot be undefined");
    }

    let size = this.calcMemSize();

    let start = 0;

    while (start < this.cur - 2 && size > maxmem) {
      size -= this[start].calcMemSize(ctx);
      start++;
    }

    if (start === 0) {
      return size;
    }

    for (let i = 0; i < start; i++) {
      this[i].onUndoDestroy();
    }

    this.cur -= start;

    for (let i = 0; i < this.length - start; i++) {
      this[i] = this[i + start];
    }
    this.length -= start;

    return this.calcMemSize(ctx);
  }

  calcMemSize(ctx = this.ctx) {
    let tot = 0;

    for (let tool of this) {
      try {
        tot += tool.calcMemSize();
      } catch (error) {
        util.print_stack(error);
        console.error("Failed to execute a calcMemSize method");
      }
    }

    return tot;
  }

  setRestrictedToolContext(ctx) {
    this.toolctx = ctx;
  }

  reset(ctx) {
    if (ctx !== undefined) {
      this.ctx = ctx;
    }

    this.modalRunning = 0;
    this.cur = -1;
    this.length = 0;
  }

  /**
   * runs .undo,.redo if toolstack head is same as tool
   *
   * otherwise, .execTool(ctx, tool) is called.
   *
   * @param compareInputs : check if toolstack head has identical input values, defaults to false
   * */
  execOrRedo(ctx, tool, compareInputs = false) {
    let head = this.head;

    let ok = compareInputs ? ToolOp.Equals(head, tool) : head && head.constructor === tool.constructor;

    tool.__memsize = undefined; //reset cache memsize

    if (ok) {
      //console.warn("Same tool detected");

      this.undo();

      //can inputs differ? in that case, execute new tool
      if (!compareInputs) {
        this.execTool(ctx, tool);
      } else {
        this.rerun();
      }

      return false;
    } else {
      this.execTool(ctx, tool);
      return true;
    }
  }

  execTool(ctx, toolop) {
    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit, ctx);
    }

    if (!toolop.constructor.canRun(ctx, toolop)) {
      console.log("toolop.constructor.canRun returned false");
      return;
    }

    let tctx = ctx.toLocked();

    let undoflag = toolop.constructor.tooldef().undoflag;
    if (toolop.undoflag !== undefined) {
      undoflag = toolop.undoflag;
    }
    undoflag = undoflag === undefined ? 0 : undoflag;

    //if (!(undoflag & UndoFlags.IS_UNDO_ROOT) && !(undoflag & UndoFlags.NO_UNDO)) {
    //tctx = new SavedContext(ctx, ctx.datalib);
    //}

    toolop.execCtx = tctx;

    if (!(undoflag & UndoFlags.NO_UNDO)) {
      this.cur++;

      //save branch for if tool cancel
      this._undo_branch = this.slice(this.cur + 1, this.length);

      //truncate
      this.length = this.cur + 1;

      this[this.cur] = toolop;
      toolop.undoPre(tctx);
    }

    if (toolop.is_modal) {
      ctx = toolop.modal_ctx = ctx;

      this.modal_running = true;

      toolop._on_cancel = (function (toolop) {
        if (!(toolop.undoflag & UndoFlags.NO_UNDO)) {
          this[this.cur].undo(ctx);
          this.pop_i(this.cur);
          this.cur--;
        }
      }).bind(this);

      //will handle calling .exec itself
      toolop.modalStart(ctx);
    } else {
      toolop.execPre(tctx);
      toolop.exec(tctx);
      toolop.execPost(tctx);
      toolop.saveDefaultInputs();
    }
  }

  toolCancel(ctx, tool) {
    if (tool._was_redo) { //also set by toolstack.redo
      //ignore tool cancel requests on redo
      return;
    }

    if (tool !== this[this.cur]) {
      console.warn("toolCancel called in error", this, tool);
      return;
    }

    this.undo();
    this.length = this.cur + 1;

    if (this._undo_branch !== undefined) {
      for (let item of this._undo_branch) {
        this.push(item);
      }
    }
  }

  undo() {
    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit);
    }

    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      let tool = this[this.cur];

      tool.undo(tool.execCtx);

      this.cur--;
    }
  }

  //reruns a tool if it's at the head of the stack
  rerun(tool) {
    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit);
    }

    if (tool === this[this.cur]) {
      tool._was_redo = false;

      if (!tool.execCtx) {
        tool.execCtx = this.ctx;
      }

      tool.undo(tool.execCtx);

      tool._was_redo = true; //also set by toolstack.redo

      tool.undoPre(tool.execCtx);
      tool.execPre(tool.execCtx);
      tool.exec(tool.execCtx);
      tool.execPost(tool.execCtx);
    } else {
      console.warn("Tool wasn't at head of stack", tool);
    }
  }

  redo() {
    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit);
    }

    if (this.cur >= -1 && this.cur + 1 < this.length) {
      //console.log("redo!", this.cur, this.length);

      this.cur++;
      let tool = this[this.cur];


      if (!tool.execCtx) {
        tool.execCtx = this.ctx;
      }

      tool._was_redo = true;
      tool.redo(tool.execCtx);

      tool.saveDefaultInputs();
    }
  }

  save() {
    let data = [];
    nstructjs.writeObject(data, this);
    return data;
  }

  rewind() {
    while (this.cur >= 0) {
      let last = this.cur;
      this.undo();

      //prevent infinite loops
      if (last === this.cur) {
        break;
      }
    }

    return this;
  }

  /**cb is a function(ctx), if it returns the value false then playback stops
   promise will still be fulfilled.

   onstep is a callback, if it returns a promise that promise will be
   waited on, otherwise execution is queue with window.setTimeout().
   */
  replay(cb, onStep) {
    let cur = this.cur;

    this.rewind();

    let last = this.cur;

    let start = util.time_ms();

    return new Promise((accept, reject) => {
      let next = () => {
        last = this.cur;

        if (cb && cb(ctx) === false) {
          accept();
          return;
        }

        if (this.cur < this.length) {
          this.cur++;
          this.rerun();
        }

        if (last === this.cur) {
          console.warn("time:", (util.time_ms() - start)/1000.0);
          accept(this);
        } else {
          if (onStep) {
            let ret = onStep();

            if (ret && ret instanceof Promise) {
              ret.then(() => {
                next();
              });
            } else {
              window.setTimeout(() => {
                next();
              })
            }
          }
        }
      }

      next();
    });
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let item of this._stack) {
      this.push(item);
    }

    delete this._stack;
  }

  //note that this makes sure tool classes are registered with nstructjs
  //during save
  _save() {
    for (let tool of this) {
      let cls = tool.constructor;

      if (!nstructjs.isRegistered(cls)) {
        cls._regWithNstructjs(cls);
      }
    }

    return this;
  }
}

ToolStack.STRUCT = `
toolsys.ToolStack {
  cur    : int;
  _stack : array(abstract(toolsys.ToolOp)) | this._save();
}
`;
nstructjs.register(ToolStack);

window._testToolStackIO = function () {
  let data = [];
  let cls = _appstate.toolstack.constructor;

  nstructjs.writeObject(data, _appstate.toolstack);
  data = new DataView(new Uint8Array(data).buffer);

  let toolstack = nstructjs.readObject(data, cls);

  _appstate.toolstack.rewind();

  toolstack.cur = -1;
  toolstack.ctx = _appstate.toolstack.ctx;
  _appstate.toolstack = toolstack;

  return toolstack;
}

export function buildToolSysAPI(api, registerWithNStructjs = true, rootCtxStruct = undefined) {
  let datastruct = api.mapStruct(ToolPropertyCache, true);

  for (let cls of ToolClasses) {
    let def = cls._getFinalToolDef();

    for (let k in def.inputs) {
      let prop = def.inputs[k];

      if (!(prop.flag & (PropFlags.PRIVATE | PropFlags.READ_ONLY))) {
        SavedToolDefaults._buildAccessors(cls, k, prop, datastruct, api);
      }
    }
  }

  if (rootCtxStruct) {
    rootCtxStruct.struct("toolDefaults", "toolDefaults", "Tool Defaults", api.mapStruct(ToolPropertyCache));
  }

  if (!registerWithNStructjs) {
    return;
  }

  //register tools with nstructjs
  for (let cls of ToolClasses) {
    try {
      if (!nstructjs.isRegistered(cls)) {
        ToolOp._regWithNstructjs(cls);
      }
    } catch (error) {
      console.log(error.stack);
      console.error("Failed to register a tool with nstructjs");
    }
  }
}
