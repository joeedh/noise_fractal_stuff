import {
  nstructjs, ToolOp, ToolProperty, BoolProperty,
  StringProperty, EnumProperty, FlagProperty, FloatProperty,
  util, UndoFlags, IntProperty, platform, UIBase
} from '../path.ux/pathux.js';
import {Icons} from '../editors/icon_enum.js';
import * as cconst from './const.js';
import {loadPreset, Preset, presetManager, savePreset} from '../pattern/preset.js';
import {render} from './render.js';
import {FILE_EXT} from './const.js';
import {MainMenu} from '../editors/menu/MainMenu.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import {PropsEditor} from '../editors/properties/properties.js';

export function makeScreen(ctx) {
  let screen = UIBase.createElement("app-screen-x");
  screen.ctx = ctx;

  let sarea = screen.newScreenArea();
  screen.add(sarea);

  sarea.switch_editor(MainMenu);
  let sarea2 = screen.splitArea(sarea, 0.1);

  sarea2.switch_editor(CanvasEditor);

  let sarea3 = screen.splitArea(sarea2, 0.7, false);
  sarea3.switch_editor(PropsEditor);

  return screen;
}

export function loadDefaultFile(appstate, loadLocalStorage = true) {
  let key = cconst.STARTUP_FILE_KEY;

  if (loadLocalStorage && key in localStorage) {
    try {
      let buf = localStorage[key];
      buf = atob(buf);

      let data = new Uint8Array(buf.length);

      for (let i = 0; i < buf.length; i++) {
        data[i] = buf.charCodeAt(i);
      }

      appstate.loadFile(data);
    } catch (error) {
      util.print_stack(error);

      console.error("failed to load startup file!");

      appstate.reset();
      appstate.api.execTool(appstate.ctx, "app.root_file_op()");
    }
  } else {
    appstate.reset(makeScreen(appstate.ctx), true, true);
    appstate.api.execTool(appstate.ctx, "app.root_file_op");
    appstate.toolstack.onFileSaved(); /* ensure toolstack.fileModified is up to date */

    appstate.screen.completeSetCSS();
    appstate.screen.completeUpdate();
  }
}

window.loadDefaultFile = loadDefaultFile;

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

export class SaveFileOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.save",
      uiname  : "Save Project",
      undoflag: UndoFlags.NO_UNDO,
      inputs  : {
        saveAsMode: new BoolProperty(false),
        useJSON   : new BoolProperty(true)
      }
    }
  }

  exec(ctx) {
    let json = this.inputs.useJSON.getValue();

    let buf = _appstate.saveFile({json});
    let showDialog = _appstate.fileKey === undefined || this.inputs.saveAsMode.getValue();

    console.warn("FILEKEY", _appstate.fileKey);

    if (showDialog) {
      this._dialogSave(ctx, buf);
    } else {
      this._keySave(ctx, buf);
    }
  }

  _dialogSave(ctx, buf) {
    console.error("PLATFORM", platform.platform);

    platform.platform.showSaveDialog("Save", () => buf, {
      multi          : false,
      addToRecentList: true,
      filters        : [
        {
          name      : "Fractals",
          mime      : "text/json",
          extensions: [FILE_EXT]
        }
      ]
    }).catch(error => {
      console.error("ERROR", error);

      error = typeof error === "object" && error.message ? error.message : error;
      ctx.error("Failed to save file: " + error);
    }).then(key => {
      console.warn("KEY", key);

      ctx.message("Saved project");
      _appstate.fileKey = key;
      _appstate.toolstack.onFileSaved();
    });
  }

  _keySave(ctx, buf) {
    let key = _appstate.fileKey;

    platform.platform.writeFile(buf, key, "text/json").then((newkey) => {
      //platform requested we use a new file key
      ctx.message("Saved Project");

      if (newkey !== undefined) {
        _appstate.fileKey = newkey;
      }

      _appstate.toolstack.onFileSaved();
    }).catch(error => {
      console.error("ERROR", error);

      error = typeof error === "object" && error.message ? error.message : error;

      ctx.error("Failed to save file: " + error);
      this._dialogSave(ctx, buf);
    });
  }
}

ToolOp.register(SaveFileOp);

export class OpenFileOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.open",
      uiname  : "Open Project",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    if (ctx.toolstack.fileModified) {
      if (!confirm("Project is modified, you will lose your work;\n still open new project?")) {
        return;
      }
    }

    platform.platform.showOpenDialog("Open", {
      multi          : false,
      addToRecentList: true,
      filters        : [
        {
          name      : "Fractals",
          mime      : "text/json",
          extensions: [FILE_EXT]
        }
      ]
    }).then(handles => {
      if (handles.length === 0) {
        return;
      }

      let handle = handles[0];

      console.log("Open!", handle);
      platform.platform.readFile(handle, "text/json").then(buf => {
        _appstate.loadFile(buf, {json: true});
        _appstate.fileKey = handle;
      }).catch(error => {
        if (typeof error === "object" && error.message) {
          error = error.message;
        }

        ctx.error("error opening file: " + error);
      });
    });
  }
}

ToolOp.register(OpenFileOp);

export class NewFileOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.new",
      uiname  : "New Project",
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    if (ctx.toolstack.fileModified) {
      if (!confirm("Project is modified, you will lose your work;\n still open new project?")) {
        return;
      }
    }

    _appstate.fileKey = undefined;
    loadDefaultFile(_appstate, false);
  }
}

ToolOp.register(NewFileOp);


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

    try {
      presetManager.updatePreset(preset, pat, true);
    } catch (error) {
      ctx.warn("Could not save current preset.");
      console.warn(error.stack);
      console.warn(error.message);
    }

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


export class ExportOp extends ToolOp {
  static tooldef() {
    return {
      toolpath: "app.export",
      undoflag: UndoFlags.NO_UNDO,
      uiname  : "Export",
      icon    : Icons.REDO,
      inputs  : {
        name  : new StringProperty().saveLastValue(),
        width : new IntProperty(512).setRange(2, 40000).noUnits().saveLastValue(),
        height: new IntProperty(512).setRange(2, 40000).noUnits().saveLastValue(),
      },
      outputs : {},
    }
  };

  exec(ctx) {
    render(ctx, this.inputs.width.getValue(), this.inputs.height.getValue()).then((res) => {

    });
  }
}

ToolOp.register(ExportOp);
