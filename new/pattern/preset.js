import {nstructjs, Vector2, math, util, UIBase} from '../path.ux/pathux.js';
import * as cconst from '../core/const.js';
import {getPatternClass} from './pattern_base.js';

export function savePreset(pat, presetName="preset", category="My Presets") {
  let istruct = new nstructjs.STRUCT;
  istruct.add_class(pat.constructor);

  let mstruct = nstructjs.manager;

  let badset = new Set([]);//["vec2", "vec3", "vec4", "mat4"]);

  function add_class(name) {
    if (!badset.has(name) && !(name in istruct.structs)) {
      istruct.add_class(mstruct.struct_cls[name]);
      let st = mstruct.structs[name];

      console.log("add class", name);

      for (let field of st.fields) {
        rec(field);
      }
    }
  }

  //find all used structs for schema
  function rec(obj) {
    //console.log(obj);

    if ("name" in obj && obj.name in mstruct.structs) {
      add_class(obj.name);
    } else if ("type" in obj && typeof obj.type === "string" && obj.type in mstruct.structs) {
      add_class(obj.type);
    } else if ("data" in obj && typeof obj.data === "string" && obj.data in mstruct.structs) {
      add_class(obj.data);
    }

    for (let k in obj) {
      let v = obj[k];

      if (typeof v === "object") {
        rec(v);
      }
    }
  }

  let st = nstructjs.manager.structs[pat.constructor.structName];
  for (let field of st.fields) {
    rec(field);
  }

  //return;
  console.log("ST", st);

  let ret = {
    version: cconst.VERSION,
    schema: nstructjs.write_scripts(istruct, false),
    preset : nstructjs.writeJSON(pat),
    name : presetName,
    category
  };

  return ret;
}

export function loadPreset(json) {
  if (typeof json === "string") {
    json = JSON.parse(json);
  }

  let schema = json.schema;
  let data = json.preset;

  let preset = nstructjs.readJSON(data, getPatternClass(data.typeName));

  return preset;
}

export class PresetManager {
  constructor() {

  }

  load();
}

export const presetManager = new PresetManager();
presetManager.load();