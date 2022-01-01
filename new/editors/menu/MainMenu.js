import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat, AreaFlags,
  platform, electron_api, Icons
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';
import '../../core/app_ops.js';

export class MainMenu extends Editor {
  constructor() {
    super();

    this.height = 32;

    this.flag = AreaFlags.NO_SWITCHER;

    this.borderLock |= 1 | 2 | 4 | 8;
    this.minSize[1] = this.height;
    this.maxSize[1] = this.height;
  }

  static define() {
    return {
      tagname : "mainmenu-editor-x",
      areaname: "mainmenu-editor",
      uiname  : "Menu",
      flag    : AreaFlags.HIDDEN
    }
  }

  copy() {
    let ret = document.createElement(this.constructor.define().tagname);
    return ret;
  }

  makeHeader(container) {
    if (!this.header) {
      this.header = this.container.row();
    } else {
      this.header.clear();
    }

    let row = this.header;

    row.noMarginsOrPadding();
    //this.container.noMarginsOrPadding();

    row.menu("File", []);
    row.menu("Edit", [
      "app.undo()",
      "app.redo()"
    ]);

    row.menu("Session", [
      "app.save_startup_file()",
      "app.clear_startup_file()",
      "app.export_presets()"
    ]);

    let notef = UIBase.createElement("noteframe-x");
    //this.container.add(notef);

    if (window.haveElectron) {
      this.maxSize[1] = this.minSize[1] = 1;
      electron_api.initMenuBar(this);
      return;
    }
  }

  init() {
    super.init();
  }
};
MainMenu.STRUCT = nstructjs.inherit(MainMenu, Editor) + `
  
}`;
Editor.register(MainMenu);
nstructjs.register(MainMenu);
