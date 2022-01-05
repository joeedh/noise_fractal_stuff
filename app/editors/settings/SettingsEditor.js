import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat, exportTheme
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';

export class SettingsEditor extends Editor {
  static define() {
    return {
      tagname : "settings-editor-x",
      areaname: "settings-editor",
      uiname: "Settings"
    }
  }

  copy() {
    let ret = document.createElement(this.constructor.define().tagname);
    return ret;
  }

  init() {
    super.init();

    let tabs = this.tabBar = this.container.tabs("left");

    let tab = tabs.tab("Settings");
    tab = tabs.tab("Theme");

    let row = tab.strip();
    row.button("Export Theme", () => {
      console.log("export theme!");
      let themejs = exportTheme();

      themejs = `
/* 
  warning: auto-generated file!
  save to editors/theme.js 
*/

import {CSSFont} from '../path.ux/pathux.js';

export ${themejs}
      `.trim() + "\n";
      console.log(themejs);

      let blob = new Blob([themejs], {type : "application/javascript"});
      let url = URL.createObjectURL(blob);

      console.log(url)

      let a = document.createElement("a");
      a.setAttribute("href", url);
      a.setAttribute("download", "theme.js");
      a.click();
    });

    let themeEditor = UIBase.createElement("theme-editor-x");
    row.add(themeEditor);

    this.doOnce(() => {
      this.flushUpdate();
      this.flushSetCSS();
    });

    this.setCSS();
  }

  setCSS() {
    super.setCSS();

    this.style["overflow"] = "scroll";

    if (this.tabs) {
      this.tabs.style["height"] = this.size[1] + "px";
    }
  }
};
SettingsEditor.STRUCT = nstructjs.inherit(SettingsEditor, Editor) + `
  
}`;
Editor.register(SettingsEditor);
nstructjs.register(SettingsEditor);
