import {
  nstructjs, ToolOp, ToolProperty, BoolProperty,
  StringProperty, EnumProperty, FlagProperty, FloatProperty,
  util, UndoFlags
} from '../path.ux/pathux.js';
import {Icons} from '../editors/icon_enum.js';
import * as cconst from './const.js';

export class RootFileOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.root_file_op",
      undoflag: UndoFlags.IS_UNDO_ROOT | UndoFlags.UNDO_BARRIER,
      uiname  : "New File",
      icon    : -1,
      inputs  : {},
      outputs : {},
    }
  };

  exec(ctx) {
    ctx.model.setActivePattern("newton");
  }
}

ToolOp.register(RootFileOp);

export class UndoOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.undo",
      undoflag: UndoFlags.NO_UNDO,
      uiname  : "Undo",
      icon    : Icons.UNDO,
      inputs  : {},
      outputs : {},
    }
  };

  exec(ctx) {
    ctx.toolstack.undo(ctx);
  }
}

ToolOp.register(UndoOp);

export class RedoOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.redo",
      undoflag: UndoFlags.NO_UNDO,
      uiname  : "Redo",
      icon    : Icons.REDO,
      inputs  : {},
      outputs : {},
    }
  };

  exec(ctx) {
    ctx.toolstack.redo(ctx);
  }
}

ToolOp.register(RedoOp);

export class SaveStartup extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.save_startup_file",
      uiname  : "Save Default File",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    let file = new Uint8Array(ctx.state.saveFile());

    let s = '';

    for (let i=0; i<file.length; i++) {
      s += String.fromCharCode(file[i]);
    }

    s = btoa(s);

    localStorage[cconst.STARTUP_FILE_KEY] = s;
    console.log("saved startup file:", (s.length / 1024.0).toFixed(2) + "kb");
  }
}

ToolOp.register(SaveStartup);

