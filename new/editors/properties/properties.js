import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat,
  saveUIData, loadUIData
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';

export class PropsEditor extends Editor {
  constructor() {
    super();

    this._last_update_key = '';
  }

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

    this.rebuild();
  }

  rebuild() {
    let uidata = saveUIData(this.container, "uidata");

    if (this.tabBar) {
      this.tabBar.remove();
    }

    let tabs = this.tabBar = this.container.tabs("left");

    let tab = tabs.tab("Main");

    tab.prop("canvas.showSliders");

    if (this.ctx && this.ctx.pattern) {
      let con = tab.col();

      con.dataPrefix = "pattern";
      con.noMarginsOrPadding();

      let pat = this.ctx.pattern;
      pat.constructor.buildSidebar(this.ctx, con);
    }

    this.setCSS();

    loadUIData(this.container, uidata);
    this.flushUpdate();
  }

  setCSS() {
    super.setCSS();

    if (this.tabs) {
      this.tabs.style["height"] = this.size[1] + "px";
    }
  }

  update() {
    super.update();

    if (!this.ctx || !this.ctx.pattern) {
      return;
    }

    let key = this.ctx.pattern.typeName;
    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.rebuild();
    }
  }
};
PropsEditor.STRUCT = nstructjs.inherit(PropsEditor, Editor) + `
  
}`;
Editor.register(PropsEditor);
nstructjs.register(PropsEditor);
