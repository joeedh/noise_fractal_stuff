import './polyfill.js';

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
import {makeScreen} from './app_ops.js';

export var appstate;

export class AppState {
  constructor() {
    this.api = api_define();
    this.model = new FileState();
    this.toolstack = new AppToolStack();

    //file saving key to resave files
    this.fileKey = undefined;

    this._last_tool = undefined;

    this.ctx = new ToolContext(this);

    //create dummy screen to make context system happy
    this.screen = UIBase.createElement("app-screen-x");
    this.screen.ctx = this.ctx;

    this._autosave_req = undefined;
    this.lastAutoSaveTime = util.time_ms();
  }

  update() {
    let title;

    if (this.ctx && this.ctx.pattern && this.ctx.canvas && this.ctx.canvas.gl) {
      if (this.ctx.pattern.shaderNeedsCompile()) {
        this.ctx.pattern.compileShader(this.ctx.canvas.gl);
        window.redraw_viewport();
      }
    }

    for (let node of document.head.childNodes) {
      if (node.tagName === "TITLE") {
        title = node;
        break;
      }
    }

    if (title) {
      let s = title.innerHTML;

      if (!this.toolstack.fileModified && s.startsWith("*")) {
        s = s.slice(1, s.length - 1);
        title.innerHTML = s;
      } else if (this.toolstack.fileModified && !s.startsWith("*")) {
        s = "*" + s;
        title.innerHTML = s;
      }
    }

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

  makeScreen() {
    if (this.screen) {
      this.screen.unlisten();
      this.screen.remove();
    }

    let screen = makeScreen(this.ctx);
    this.screen = screen;

    screen.ctx = this.ctx;
    document.body.appendChild(this.screen);
    this.screen.listen();
  }

  reset(screen = makeScreen(this.ctx), resetToolStack = true, resetModel = true) {
    if (this.screen) {
      this.screen.remove();
    }

    console.warn("application reset");

    if (resetModel) {
      this.fileKey = undefined;
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

  saveFile(args = {}) {
    args.screen = args.screen ?? true;

    return saveFile(this, args);
  }

  loadFile(buf, args = {}) {
    args.screen = args.screen ?? true;

    return loadFile(this, buf, args);
  }
}

import {loadDefaultFile} from './app_ops.js';

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
