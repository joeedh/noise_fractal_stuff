import {
  UIBase, nstructjs, util, vectormath, math,
  Vector2, Vector3, Vector4, Matrix4, Quat
} from '../../path.ux/pathux.js';

import {Editor} from '../editor_base.js';
import {EditorGL} from '../editor_base_3d.js';

export class CanvasEditor extends EditorGL {
  constructor() {
    super();
  }

  static define() {
    return {
      tagname : "canvas-editor-x",
      areaname: "canvas-editor",
      uiname  : "Canvas",
      has3D   : true
    }
  }

  makeHeader() {
    super.makeHeader(this.container, true, false);
  }

  init() {
    super.init();

    let strip = this.header.strip();
    strip.label("Pattern:");
    strip.prop("activePattern");
  }

  viewportDraw(canvas, gl) {
    super.viewportDraw(canvas, gl);

    gl.clearColor(0.5, 0.4, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    console.log("viewport draw!");
  }

  on_resize(size, oldsize) {
    super.on_resize(size, oldsize);

    window.redraw_viewport();
  }

  copy() {
    let ret = document.createElement(this.constructor.define().tagname);
    return ret;
  }

};
CanvasEditor.STRUCT = nstructjs.inherit(CanvasEditor, Editor) + `
  
}`;
Editor.register(CanvasEditor);
nstructjs.register(CanvasEditor);
