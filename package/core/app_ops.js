import {
  nstructjs, ToolOp, ToolProperty, BoolProperty,
  StringProperty, EnumProperty, FlagProperty, FloatProperty,
  util, UndoFlags
} from '../path.ux/pathux.js';
import {Icons} from '../editors/icon_enum.js';
import * as cconst from './const.js';
import {loadPreset, Preset, presetManager, savePreset} from '../pattern/preset.js';

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
    this.ctx.state.saveStartupFile();
  }
}

ToolOp.register(SaveStartup);


export class ClearStartup extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.clear_startup_file",
      uiname  : "Clear Default File",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    delete localStorage[cconst.STARTUP_FILE_KEY];
  }
}

ToolOp.register(ClearStartup);

export class ChangePresetsOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Change Preset",
      toolpath: "app.change_presets",
      inputs  : {
        preset: new StringProperty()
      }
    }
  }

  exec(ctx) {
    let pat = ctx.pattern;

    let preset = presetManager.getPreset(pat.typeName, pat.activePreset);
    if (!preset) {
      preset = savePreset(pat, pat.activePreset);
      presetManager.push(preset);
    }

    presetManager.updatePreset(preset, pat, true);

    let name = this.inputs.preset.getValue();
    let preset2 = presetManager.getPreset(pat.typeName, name);

    if (!preset2) {
      ctx.error("No preset " + name);
      return;
    }

    pat.activePreset = name;
    pat.loadPreset(preset2);

    pat.drawGen++;
    window.redraw_viewport();
  }
}

ToolOp.register(ChangePresetsOp);

export class DeleteActivePresetOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Delete Active Preset",
      toolpath: "app.delete_active_preset",
      inputs  : {},
    }
  }

  static canRun(ctx) {
    return ctx.pattern && ctx.pattern.getActivePreset();
  }

  undoPre(ctx) {
    this._undo = JSON.stringify(ctx.pattern.getActivePreset());
  }

  undo(ctx) {
    let preset = new Preset().loadJSON(this._undo);

    presetManager.push(preset);
    ctx.pattern.loadPreset(preset);
  }

  exec(ctx) {
    let preset = ctx.pattern.getActivePreset();
    let next = presetManager.nextPreset(preset);

    presetManager.deletePreset(preset);

    if (next) {
      ctx.pattern.loadPreset(next);
    }

    ctx.pattern.drawGen++;
    window.redraw_viewport();

    console.error("NEXT", next ? next.name : next);
  }
}

ToolOp.register(DeleteActivePresetOp);

export class DownloadPresetsOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Export Presets (json)",
      toolpath: "app.export_presets",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    let a = document.createElement("a");
    a.download = "presets.json";

    let presets = util.list(presetManager);
    let json = JSON.stringify(presets, undefined, 2);

    let blob = new Blob([json], {type: "text/json"});
    let url = URL.createObjectURL(blob);

    a.href = url;
    a.click();
  }
}

ToolOp.register(DownloadPresetsOp);

export class AppExitOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Exit",
      toolpath: "app.exit",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    ctx.state.saveStartupFile();

    if (window.haveElectron) {
      window.close();
    }
  }
}

ToolOp.register(AppExitOp);

export class ResetPatternOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Reset Pattern",
      toolpath: "app.reset_pattern"
    }
  }

  exec(ctx) {
    ctx.model.resetPattern(ctx.pattern.typeName);
    window.redraw_viewport();
  }
}

ToolOp.register(ResetPatternOp);
