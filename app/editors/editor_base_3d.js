import {Editor} from './editor_base.js';
import {Vector2, UIBase, Vector3, Matrix4, util, nstructjs} from '../path.ux/pathux.js';

export class EditorGL extends Editor {
  constructor() {
    super();

    this.glSize = new Vector2([512, 512]);
    this.glPos = new Vector2();

    this._projRets = util.cachering.fromConstructor(Vector3, 512);
  }

  viewportDraw(canvas, gl) {
    let dpi = UIBase.getDPI();

    this.glPos[0] = ~~(this.pos[0]*dpi);
    this.glPos[1] = ~~(this.pos[1]*dpi);

    this.glSize[0] = ~~(this.size[0]*dpi);
    this.glSize[1] = ~~(this.size[1]*dpi);

    let y = this.glPos[1] + this.glSize[1];
    y = canvas.height - y;

    this.glPos[1] = y;

    if (gl.contextBad) {
      return;
    }

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);
  }

  project(p) {
    p[0] -= this.pos[0];
    p[1] -= this.pos[1];
  }

  unproject(p) {
    p[0] += this.pos[0];
    p[1] += this.pos[1];
  }
};
EditorGL.STRUCT = nstructjs.inherit(EditorGL, Editor) + `
}`;
nstructjs.register(EditorGL);
