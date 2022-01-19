import {nstructjs, Vector2, math, util, UIBase, Curve1D, CurveConstructors} from '../path.ux/pathux.js';
import * as cconst from '../core/const.js';
import {getPatternClass, PatternClasses} from './pattern_base.js';

const KeyTag = Symbol("key-tag");

export const MODIFIED_PRESET_NAME = "Modified Builtin Presets";
export const BUILTIN_PRESET_NAME = "Builtin"
export const MY_PRESETS_NAME = "My Presets";

export class CategoryList extends Array {
  constructor(type, category) {
    super();

    this.typeName = type;
    this.category = category;
  }
}

export class PresetList extends Array {
  constructor(typeName, manager) {
    super();
    this.typeName = typeName;
    this.manager = manager;
  }
}

export class Preset {
  constructor(preset) {
    this.preset = preset;
    this.category = "";
    this.schema = "";
    this.version = 0;
    this.categoryIndex = 0;

    this[KeyTag] = undefined;
    this.name = 'unnamed';
  }

  copyTo(b) {
    b.preset = JSON.parse(JSON.stringify(this.preset));
    b.name = this.name;
    b.schema = this.schema;
    b.version = this.version;
    b.category = this.category;
  }

  copy() {
    let ret = new Preset();
    this.copyTo(ret);
    return ret;
  }

  toJSON() {
    return {
      name    : this.name,
      category: this.category,
      version : this.version,
      schema  : this.schema,
      preset  : this.preset
    }
  }

  loadJSON(json) {
    if (typeof json === "string") {
      json = JSON.parse(json);
    }

    for (let k in json) {
      this[k] = json[k];
    }

    return this;
  }
}

export function savePreset(pat,
                           presetName     = "preset",
                           category       = "My Presets",
                           existingPreset = undefined) {
  let istruct = new nstructjs.STRUCT;
  istruct.add_class(pat.constructor);

  let mstruct = nstructjs.manager;

  let badset = new Set([]);//["vec2", "vec3", "vec4", "mat4"]);

  function add_class(name) {
    if (!badset.has(name) && !(name in istruct.structs)) {
      istruct.add_class(mstruct.struct_cls[name]);
      let st = mstruct.structs[name];

      //console.log("add class", name);

      for (let field of st.fields) {
        rec(field);
      }
    }
  }

  //add_class("Curve1d");
  for (let cls of CurveConstructors) {
    add_class(cls.structName);
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

  let preset = existingPreset ?? new Preset();

  return preset.loadJSON({
    version: cconst.VERSION,
    schema : nstructjs.write_scripts(istruct, false),
    preset : nstructjs.writeJSON(pat),
    name   : presetName,
    category
  });
}

export function loadPreset(preset) {
  if (typeof preset === "string") {
    preset = JSON.parse(preset);
  }

  console.warn("loadPreset", preset);

  let schema = preset.schema;
  let data = preset.preset;

  let istruct = new nstructjs.STRUCT();
  istruct.parse_structs(preset.schema);

  return istruct.readJSON(data, getPatternClass(data.typeName));
}

export const PRecalcFlags = {
  CATEGORY_LISTS: 1
};

export class PresetManager extends Array {
  constructor() {
    super();

    this.typeLists = new Map();
    this.keymap = new Map();
    this.categoryKeys = new Set([MY_PRESETS_NAME, BUILTIN_PRESET_NAME, MODIFIED_PRESET_NAME]);
    this.categoryLists = new Map();

    this.recalc = PRecalcFlags.CATEGORY_LISTS;
  }

  makeKey(preset) {
    let type = preset.preset.typeName;
    return `P${type}:$:${preset.name}`;
  }

  splitKey(key) {
    let i = key.search(/\:\$\:/);
    return [key.slice(1, i), key.slice(i + 3, key.length)];
  }

  getCategoryList(type, category) {
    let listkey = type + "_" + category;

    if (this.flag & PRecalcFlags.CATEGORY_LISTS) {
      this.flag &= ~PRecalcFlags.CATEGORY_LISTS;
      this.categoryLists = new Map();
    }

    if (!this.categoryLists.has(listkey)) {
      let list = new CategoryList(type, category);
      this.categoryLists.set(listkey, list);

      for (let preset of this) {
        if (preset.preset.typeName === type && preset.category === category) {
          preset.categoryIndex = list.length;
          list.push(preset);
        }
      }
    }

    return this.categoryLists.get(listkey);
  }

  getTypeList(type) {
    if (!this.typeLists.has(type)) {
      this.typeLists.set(type, new PresetList(type, this));
    }

    return this.typeLists.get(type);
  }

  changeCategory(preset, cat) {
    preset.category = cat;

    this.categoryKeys.add(cat);

    if (preset[KeyTag]) {
      this.keymap.delete(preset[KeyTag]);
    }

    preset[KeyTag] = this.makeKey(preset);
    this.keymap.set(preset[KeyTag], preset);

    this.flag |= PRecalcFlags.CATEGORY_LISTS;

    return this;
  }

  rename(preset, name) {
    let nameset = new Set();

    let type = preset.preset.typeName;

    for (let p of this.getTypeList(type)) {
      nameset.add(p.name);
    }

    let startname = name;
    let i = 2;

    while (nameset.has(name)) {
      name = `${startname} ${i++}`;
    }

    preset.name = name;

    if (preset[KeyTag]) {
      this.keymap.delete(preset[KeyTag]);
    }

    preset[KeyTag] = this.makeKey(preset);
    this.keymap.set(preset[KeyTag], preset);

    preset.name = name;
    this.flag |= PRecalcFlags.CATEGORY_LISTS;

    return this;
  }

  push(preset) {
    let type = preset.preset.typeName;

    this.rename(preset, preset.name);

    if (!this.typeLists.has(type)) {
      this.typeLists.set(type, new PresetList(type, this));
    }

    this.typeLists.get(type).push(preset);
    const tag = preset[KeyTag] = this.makeKey(preset);

    this.keymap.set(tag, preset);
    this.categoryKeys.add(preset.category);

    this.flag |= PRecalcFlags.CATEGORY_LISTS;

    return super.push(preset);
  }

  load() {
    for (let cls of PatternClasses) {
      let def = cls.getPatternDef();

      if (!def.presets) {
        continue;
      }

      for (let preset of def.presets) {
        this.push(preset);
      }
    }

    for (let k in localStorage) {
      try {
        if (k[0] === "P" && k.search(/\:\$\:/) >= 0) {
          let json = localStorage[k];

          let preset = new Preset().loadJSON(json);
          this.push(preset);
        }
      } catch (error) {
        util.print_stack(error);
        console.error("Failed to load a preset!", k);
      }
    }
  }

  /** copies preset if it's a builtin and returns new one,
   otherwise preset itself is returned */
  savePreset(preset) {
    if (preset.category === "Builtin") {
      preset = preset.copy();
      preset.name = "Modified " + preset.name;
      preset.category = MODIFIED_PRESET_NAME;

      preset[KeyTag] = undefined;

      this.rename(preset, preset.name);
      this.push(preset);

      this.flag |= PRecalcFlags.CATEGORY_LISTS;
    }


    localStorage[preset[KeyTag]] = JSON.stringify(preset);

    return preset;
  }

  updatePreset(preset, pattern, saveToLocalStorage = true) {
    let sanitize_float = (obj) => {
      if (typeof obj != "object") {
        return;
      }

      for (let k in obj) {
        let v = obj[k];

        if (typeof v === "number") {
          v = v.toFixed(5);
        } else if (typeof v === "object") {
          sanitize_float(v);
        }

        obj[k] = v;
      }
    }

    function sanitize_stringify(obj) {
      obj = JSON.parse(JSON.stringify(obj));
      sanitize_float(obj);

      //don't compare these fields

      delete obj.preset.sharpness;
      delete obj.preset.filter_width;
      delete obj.preset.use_monty_sharpness;
      delete obj.preset.use_sharpness;
      delete obj.preset.no_gradient;
      delete obj.preset.old_gradient;
      delete obj.preset.per_pixel_random;
      delete obj.preset.pixel_size;
      delete obj.preset.activePreset;
      delete obj.schema;

      return JSON.stringify(obj);
    }

    if (preset.category === "Builtin") {
      let buf1 = sanitize_stringify(preset);JSON.parse(JSON.stringify(preset));
      let buf2 = sanitize_stringify(savePreset(pattern, preset.name, preset.category));

      if (buf1 === buf2) {
        console.warn("presetManager.updatePreset: Builting preset hasn't change; not forking. . .");
        return;
      }

      console.warn("Builtin changed!");
      console.log(buf1, "\n\n" + buf2);
    } else {
      savePreset(pattern, preset.name, preset.category, preset);
    }

    if (saveToLocalStorage) {
      this.savePreset(preset);
    }
  }

  getPreset(type, name) {
    for (let preset of this.getTypeList(type)) {
      if (preset.name === name && preset.preset.typeName === type) {
        return preset;
      }
    }
  }

  deletePreset(preset) {
    if (preset.category === BUILTIN_PRESET_NAME) {
      throw new Error("builtin presets cannot be deleted");
    }

    this.flag |= PRecalcFlags.CATEGORY_LISTS;

    if (preset[KeyTag]) {
      this.keymap.delete(preset[KeyTag]);
      delete localStorage[preset[KeyTag]];
    }

    this.remove(preset);
    this.getTypeList(preset.preset.typeName).remove(preset);
  }

  nextPreset(preset) {
    let list = this.getCategoryList(preset.preset.typeName, preset.category);
    let i = list.indexOf(preset);

    let ret = list[(i + 1) % list.length];
    return ret === preset ? undefined : ret;
  }
}

export const presetManager = new PresetManager();

export function initPresets() {
  presetManager.load();
}

window._presetManager = presetManager;
