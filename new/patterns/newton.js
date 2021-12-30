import {
  nstructjs, util, math, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

import {Pattern} from '../pattern/pattern.js';

export class NewtonPattern extends Pattern {
  static patternDef() {
    return {
      typeName   : "newton",
      uiName     : "Newton",
      flag       : 0,
      description: "modified newton fractal",
      icon       : -1,
      sliderDef  : [
        "steps",
        {
          name : "bleh",
          range: [1, 2],
          value: 1.0
        }
      ]
    }
  }
}
NewtonPattern.STRUCT = nstructjs.inherit(NewtonPattern, Pattern) + `
}`;

Pattern.register(NewtonPattern);
