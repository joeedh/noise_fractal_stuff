import {
  nstructjs, ToolOp, ToolProperty, BoolProperty,
  StringProperty, EnumProperty, FlagProperty, FloatProperty,
  util, UndoFlags, IntProperty, platform, UIBase
} from '../path.ux/scripts/pathux.js';
import {FilePath} from '../path.ux/scripts/platforms/platform_base.js';
import type {PlatformAPI} from '../path.ux/scripts/platforms/platform_base.js';

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as {message: unknown}).message)
  }
  return String(error)
}
import {Icons} from '../editors/icon_enum.js';
import * as cconst from './const.js';
import {loadPreset, Preset, presetManager, savePreset} from '../pattern/preset.js';
import {render} from './render.js';
import {FILE_EXT} from './const.js';
import {MainMenu} from '../editors/menu/MainMenu.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import {PropsEditor} from '../editors/properties/properties.js';
import type {ToolContext} from './context.js';
import type {AppState} from './appstate.js';
import type {AppScreen} from '../screen.js';
import type {Pattern} from '../pattern/pattern.js';

// path.ux exports the active platform implementation as `unknown`; it is always
// a PlatformAPI subclass at runtime, so expose a typed accessor for it.
function activePlatform(): typeof PlatformAPI {
  return platform.platform as typeof PlatformAPI
}

export function makeScreen(ctx: ToolContext): AppScreen {
  let screen = UIBase.createElement<AppScreen>("app-screen-x");
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

export function loadDefaultFile(appstate: AppState, loadLocalStorage = true) {
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
      util.print_stack(error instanceof Error ? error : undefined);

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

  exec(ctx: ToolContext) {
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

  exec(ctx: ToolContext) {
    ctx.toolstack.undo();
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

  exec(ctx: ToolContext) {
    ctx.toolstack.redo();
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

  exec(ctx: ToolContext) {
    ctx.state.saveStartupFile();
  }
}

ToolOp.register(SaveStartup);

export class SaveFileOp extends ToolOp<{
  saveAsMode: BoolProperty
  useJSON: BoolProperty
}> {
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

  exec(ctx: ToolContext) {
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

  _dialogSave(ctx: ToolContext, buf: string | ArrayBuffer) {
    console.error("PLATFORM", platform.platform);

    activePlatform().showSaveDialog("Save", () => buf, {
      multi          : false,
      addToRecentList: true,
      filters        : [
        {
          name      : "Fractals",
          mime      : "text/json",
          extensions: [FILE_EXT]
        }
      ]
    }).catch((error: unknown) => {
      console.error("ERROR", error);

      ctx.error("Failed to save file: " + errorMessage(error));
    }).then((key: FilePath | void) => {
      console.warn("KEY", key);

      ctx.message("Saved project");
      _appstate.fileKey = key ?? undefined;
      _appstate.toolstack.onFileSaved();
    });
  }

  _keySave(ctx: ToolContext, buf: string | ArrayBuffer) {
    let key = _appstate.fileKey;

    if (key === undefined) {
      this._dialogSave(ctx, buf);
      return;
    }

    activePlatform().writeFile(buf, key, "text/json").then((newkey) => {
      //platform requested we use a new file key
      ctx.message("Saved Project");

      if (newkey !== undefined && newkey instanceof FilePath) {
        _appstate.fileKey = newkey;
      }

      _appstate.toolstack.onFileSaved();
    }).catch((error: unknown) => {
      console.error("ERROR", error);

      ctx.error("Failed to save file: " + errorMessage(error));
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

  exec(ctx: ToolContext) {
    if (ctx.toolstack.fileModified) {
      if (!confirm("Project is modified, you will lose your work;\n still open new project?")) {
        return;
      }
    }

    activePlatform().showOpenDialog("Open", {
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
      activePlatform().readFile(handle, "text/json").then(buf => {
        _appstate.loadFile(buf, {json: true});
        _appstate.fileKey = handle;
      }).catch((error: unknown) => {
        ctx.error("error opening file: " + errorMessage(error));
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

  exec(ctx: ToolContext) {
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

  exec(ctx: ToolContext) {
    delete localStorage[cconst.STARTUP_FILE_KEY];
  }
}

ToolOp.register(ClearStartup);

export class ChangePresetsOp extends ToolOp<{
  preset: StringProperty
}> {
  static tooldef() {
    return {
      uiname  : "Change Preset",
      toolpath: "app.change_presets",
      inputs  : {
        preset: new StringProperty()
      }
    }
  }

  exec(ctx: ToolContext) {
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
      if (error instanceof Error) {
        console.warn(error.stack);
        console.warn(error.message);
      }
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

  _presetUndo!: string

  static canRun(ctx: ToolContext): boolean {
    return !!(ctx.pattern && ctx.pattern.getActivePreset());
  }

  undoPre(ctx: ToolContext) {
    this._presetUndo = JSON.stringify(ctx.pattern.getActivePreset());
  }

  undo(ctx: ToolContext) {
    let preset = new Preset().loadJSON(this._presetUndo);

    presetManager.push(preset);
    ctx.pattern.loadPreset(preset);
  }

  exec(ctx: ToolContext) {
    let preset = ctx.pattern.getActivePreset();
    if (!preset) {
      return;
    }

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

  exec(ctx: ToolContext) {
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

  exec(ctx: ToolContext) {
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

  exec(ctx: ToolContext) {
    ctx.model.resetPattern(ctx.pattern.typeName);
    window.redraw_viewport();
  }
}

ToolOp.register(ResetPatternOp);


export class ExportOp extends ToolOp<{
  name: StringProperty
  width: IntProperty
  height: IntProperty
}> {
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

  exec(ctx: ToolContext) {
    render(ctx, this.inputs.width.getValue(), this.inputs.height.getValue()).then((res) => {

    });
  }
}

ToolOp.register(ExportOp);
