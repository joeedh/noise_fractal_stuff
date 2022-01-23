import {FileState, saveFile, loadFile} from './file.js';
import {nstructjs, UIBase, DataAPI, util} from '../path.ux/pathux.js';
import {api_define} from './api_define.js';
import {AppToolStack} from './toolstack.js';
import {AppScreen} from '../screen.js';
import {ToolContext} from './context.js';
import '../screen.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import '../editors/all.js';
import {MainMenu} from '../editors/menu/MainMenu.js';
import {PropsEditor} from '../editors/properties/properties.js';
import * as cconst from './const.js';

export var appstate;

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

export class AppState {
  constructor() {
    this.api = api_define();
    this.model = new FileState();
    this.toolstack = new AppToolStack();

    this._last_tool = undefined;

    this.ctx = new ToolContext(this);

    //create dummy screen to make context system happy
    this.screen = UIBase.createElement("app-screen-x");
    this.screen.ctx = this.ctx;

    this._autosave_req = undefined;
    this.lastAutoSaveTime = util.time_ms();
  }

  autoSave() {
    if (this._autosave_req) {
      return;
    }

    this._autosave_req = true;

    window.setTimeout(() => {
      this._autosave_req = undefined;
      this.saveStartupFile();
      this.lastAutoSaveTime = util.time_ms();
    }, 250);
  }

  saveStartupFile() {
    let file = new Uint8Array(this.saveFile());

    let s = '';

    for (let i = 0; i < file.length; i++) {
      s += String.fromCharCode(file[i]);
    }

    s = btoa(s);

    localStorage[cconst.STARTUP_FILE_KEY] = s;
    console.log("saved startup file:", (s.length/1024.0).toFixed(2) + "kb");
  }

  reset(screen=makeScreen(this.ctx), resetToolStack=true, resetModel=true) {
    if (this.screen) {
      this.screen.remove();
    }

    console.warn("application reset");

    if (resetModel) {
      this.model = new FileState();
      this.model.setActivePattern("newton");
    }

    if (resetToolStack) {
      this.toolstack = new AppToolStack();
      this._last_tool = undefined;
    }

    this.screen = screen;

    screen.ctx = this.ctx;
    document.body.appendChild(this.screen);
    this.screen.listen();
  }

  undoSave() {
    return saveFile(this, {screen: false});
  }

  undoLoad(buf) {
    return loadFile(this, buf, {screen: false});
  }

  saveFile() {
    return saveFile(this, {screen: true});
  }

  loadFile(buf) {
    return loadFile(this, buf, {screen: true});
  }
}

export function loadDefaultFile(appstate, loadLocalStorage=true) {
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
  }
}

window.loadDefaultFile = loadDefaultFile;

export function start() {
  appstate = window._appstate = new AppState();
  appstate.reset();

  loadDefaultFile(appstate);

  Object.defineProperty(window, "C", {
    get() {
      return _appstate.ctx;
    }
  });
}
