import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat,
  saveUIData, loadUIData
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';
import {presetManager} from '../../pattern/preset.js';

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

    this.style["overflow"] = "scroll";

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

    let panel = tab.panel("Builtin Presets");
    let list = UIBase.createElement("preset-category-x");
    list.dataPath = `presets.types.active.categories['Builtin']`;

    panel.add(list);

    let keys = util.list(presetManager.categoryKeys);
    if (keys.indexOf("My Presets") >= 0) {
      keys.remove("My Presets");
      keys = ["My Presets"].concat(keys);
    }

    keys.remove("Builtin");

    for (let k of keys) {
      panel = tab.panel(k);
      let list = UIBase.createElement("preset-category-x");
      list.dataPath = `presets.types.active.categories['${k}']`;

      panel.add(list);
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
