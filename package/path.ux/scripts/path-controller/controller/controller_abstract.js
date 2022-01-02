import {ToolOp} from '../toolsys/toolsys.js';
import {print_stack} from '../util/util.js';
import {PropFlags, PropTypes} from '../toolsys/toolprop_abstract.js';
import {ToolProperty} from '../toolsys/toolprop.js';
import {DataPathError, isVecProperty, ListIface} from './controller_base.js';

export class ModelInterface {
  constructor() {
    this.prefix = "";
  }

  getToolDef(path) {
    throw new Error("implement me");
  }

  getToolPathHotkey(ctx, path) {
    return undefined;
  }

  get list() {
    throw new Error("implement me");
    return ListIface;
  }

  createTool(path, inputs={}, constructor_argument=undefined) {
    throw new Error("implement me");
  }

  //returns tool class, or undefined if one cannot be found for path
  parseToolPath(path) {
    throw new Error("implement me");
  }

  /**
   * runs .undo,.redo if toolstack head is same as tool
   *
   * otherwise, .execTool(ctx, tool) is called.
   *
   * @param compareInputs : check if toolstack head has identical input values, defaults to false
   * */
  execOrRedo(ctx, toolop, compareInputs=false) {
    return ctx.toolstack.execOrRedo(ctx, toolop, compareInputs);
  }

  execTool(ctx, path, inputs={}, constructor_argument=undefined) {
    return new Promise((accept, reject) => {
      let tool = path;

      try {
        if (typeof tool == "string" || !(tool instanceof ToolOp)) {
          tool = this.createTool(ctx, path, inputs, constructor_argument);
        }
      } catch (error) {
        print_stack(error);
        reject(error);
        return;
      }

      //give client a chance to change tool instance directly
      accept(tool);

      //execute
      try {
        ctx.toolstack.execTool(ctx, tool);
      } catch (error) { //for some reason chrome is suppressing errors
        print_stack(error);
        throw error;
      }
    });
  }

  //used by simple_controller.js for tagging error messages
  pushReportContext(name) {

  }

  //used by simple_controller.js for tagging error messages
  popReportContext() {

  }

  static toolRegistered(tool) {
    throw new Error("implement me");
  }

  static registerTool(tool) {
    throw new Error("implement me");
  }

  //not yet supported by path.ux's controller implementation
  massSetProp(ctx, mass_set_path, value) {
    throw new Error("implement me");
  }

  /** takes a mass_set_path and returns an array of individual paths */
  resolveMassSetPaths(ctx, mass_set_path) {
    throw new Error("implement me");
  }

  /**
   * @example
   *
   * return {
   *   obj      : [object owning property key]
   *   parent   : [parent of obj]
   *   key      : [property key]
   *   subkey   : used by flag properties, represents a key within the property
   *   value    : [value of property]
   *   prop     : [optional toolprop.ToolProperty representing the property definition]
   *   struct   : [optional datastruct representing the type, if value is an object]
   *   mass_set : mass setter string, if controller implementation supports it
   * }
   */
  resolvePath(ctx, path, ignoreExistence, rootStruct) {
  }

  setValue(ctx, path, val, rootStruct) {
    let res = this.resolvePath(ctx, path, undefined,  rootStruct);
    let prop = res.prop;

    if (prop !== undefined && (prop.flag & PropFlags.READ_ONLY)) {
      throw new DataPathError("Tried to set read only property");
    }

    if (prop !== undefined && (prop.flag & PropFlags.USE_CUSTOM_GETSET)) {
      prop.dataref = res.obj;
      prop.ctx = ctx;
      prop.datapath = path;

      if (res.subkey !== undefined) {
        let val2 = prop.getValue();
        if (typeof val2 === "object") {
          val2 = val2.copy();
        }

        if (prop.type === PropTypes.FLAG) {
          if (val) {
            val2 |= prop.values[res.subkey];
          } else {
            val2 &= ~prop.values[res.subkey];
          }

          val = val2;
        } else if (prop.type === PropTypes.ENUM) {
          val = prop.values[res.subkey];
        } else {
          val2[res.subkey] = val;
          val = val2;
        }
      }

      prop.setValue(val);
      return;
    }

    if (prop !== undefined) {
      if (prop.type === PropTypes.CURVE && !val) {
        throw new DataPathError("can't set curve data to nothing");
      }

      let use_range = (prop.type & (PropTypes.INT | PropTypes.FLOAT));

      use_range = use_range || (res.subkey && (prop.type & (PropTypes.VEC2 | PropTypes.VEC3 | PropTypes.VEC4)));
      use_range = use_range && prop.range;
      use_range = use_range && !(prop.range[0] === 0.0 && prop.range[1] === 0.0);
      use_range = use_range && typeof val === "number";

      if (use_range) {
        val = Math.min(Math.max(val, prop.range[0]), prop.range[1]);
      }
    }

    let old = res.obj[res.key];

    if (res.subkey !== undefined && res.prop !== undefined && res.prop.type === PropTypes.ENUM) {
      let ival = res.prop.values[res.subkey];

      if (val) {
        res.obj[res.key] = ival;
      }
    } else if (res.prop !== undefined && res.prop.type === PropTypes.FLAG) {
      if (res.subkey !== undefined) {
        let ival = res.prop.values[res.subkey];

        if (val) {
          res.obj[res.key] |= ival;
        } else {
          res.obj[res.key] &= ~ival;
        }
      } else if (typeof val === "number" || typeof val === "boolean") {
        val = typeof val === "boolean" ? (val & 1) : val;

        res.obj[res.key] = val;
      } else {
        throw new DataPathError("Expected a number for a bitmask property");
      }
    } else if (res.subkey !== undefined && isVecProperty(res.prop)) {
      res.obj[res.subkey] = val;
    } else if (!(prop !== undefined && prop instanceof ListIface)) {
      res.obj[res.key] = val;
    }

    if (prop !== undefined && prop instanceof ListIface) {
      prop.set(this, res.obj, res.key, val);
    } else if (prop !== undefined) {
      prop.dataref = res.obj;
      prop.datapath = path;
      prop.ctx = ctx;

      prop._fire("change", res.obj[res.key], old);
    }
  }

  getDescription(ctx, path) {
    let rdef = this.resolvePath(ctx, path);
    if (rdef === undefined) {
      throw new DataPathError("invalid path " + path);
    }

    if (!rdef.prop || !(rdef.prop instanceof ToolProperty)) {
      return "";
    }

    let type = rdef.prop.type;
    let prop = rdef.prop;

    if (rdef.subkey !== undefined) {
      let subkey = rdef.subkey;

      if (type & (PropTypes.VEC2|PropTypes.VEC3|PropTypes.VEC4)) {
        if (prop.descriptions && subkey in prop.descriptions) {
          return prop.descriptions[subkey];
        }
      } else if (type & (PropTypes.ENUM|PropTypes.FLAG)) {
        if (!(subkey in prop.values) && subkey in prop.keys) {
          subkey = prop.keys[subkey]
        };

        if (prop.descriptions && subkey in prop.descriptions) {
          return prop.descriptions[subkey];
        }
      } else if (type === PropTypes.PROPLIST) {
        let val = tdef.value;
        if (typeof val === "object" && val instanceof ToolProperty) {
          return val.description;
        }
      }
    }

    return rdef.prop.description ? rdef.prop.description : rdef.prop.uiname;
  }

  validPath(ctx, path, rootStruct) {
    try {
      this.getValue(ctx, path, rootStruct);
      return true;
    } catch (error) {
      if (!(error instanceof DataPathError)) {
        throw error;
      }
    }

    return false;
  }

  getPropName(ctx, path) {
    let i = path.length-1;
    while (i >= 0 && path[i] !== ".") {
      i--;
    }

    path = path.slice(i+1, path.length).trim();

    if (path.endsWith("]")) {
      i = path.length - 1;
      while (i >= 0 && path[i] !== "[") {
        i--;
      }

      path = path.slice(0, i).trim();

      return this.getPropName(ctx, path);
    }

    return path;
  }

  getValue(ctx, path, rootStruct=undefined) {
    if (typeof ctx == "string") {
      throw new Error("You forgot to pass context to getValue");
    }

    let ret = this.resolvePath(ctx, path, undefined, rootStruct);

    if (ret === undefined) {
      throw new DataPathError("invalid path " + path);
    }

    let exec = ret.prop !== undefined && (ret.prop.flag & PropFlags.USE_CUSTOM_GETSET);

    //resolvePath handles the case of vector properties with custom callbacks for us
    //(and possibly all the other cases too, need to check)
    exec = exec && !(ret.prop !== undefined && (ret.prop.type & (PropTypes.VEC2|PropTypes.VEC3|PropTypes.VEC4|PropTypes.QUAT)));

    if (exec) {
      ret.prop.dataref = ret.obj;
      ret.prop.datapath = path;
      ret.prop.ctx = ctx;

      let val = ret.prop.getValue();

      if (typeof val === "string" && (ret.prop.type & (PropTypes.FLAG|PropTypes.ENUM))) {
        val = ret.prop.values[val];
      }

      if (ret.subkey && ret.prop.type === PropTypes.ENUM) {
        val = val === ret.prop.values[ret.subkey];
      } else if (ret.subkey && ret.prop.type === PropTypes.FLAG) {
        val = val & ret.prop.values[ret.subkey];
      }

      return val;

    }

    return ret.value;
  }
}
