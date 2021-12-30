import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';

export class PropsEditor extends Editor {
  static define() {
    return {
      tagname : "props-editor-x",
      areaname: "props-editor",
      uiname: "Properties"
    }
  }

  copy() {
    let ret = document.createElement(this.constructor.define().tagname);
    return ret;
  }

  init() {
    super.init();

    let tabs = this.tabBar = this.container.tabs("left");

    let tab = tabs.tab("Main");

    this.setCSS();
  }

  setCSS() {
    super.setCSS();

    if (this.tabs) {
      this.tabs.style["height"] = this.size[1] + "px";
    }
  }
};
PropsEditor.STRUCT = nstructjs.inherit(PropsEditor, Editor) + `
  
}`;
Editor.register(PropsEditor);
nstructjs.register(PropsEditor);
