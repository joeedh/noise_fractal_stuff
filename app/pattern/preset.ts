import {nstructjs, Vector2, math, util, UIBase, Curve1D, CurveConstructors} from '../path.ux/scripts/pathux.js';
import * as cconst from '../core/const.js';
import {getPatternClass, PatternClasses} from './pattern_base.js';
import type {Pattern} from './pattern.js';

/* The serialized inner payload of a Preset (nstructjs JSON of a Pattern). */
export interface PresetData {
  typeName: string
}

const KeyTag: unique symbol = Symbol("key-tag");

export const MODIFIED_PRESET_NAME = "Modified Builtin Presets";
export const BUILTIN_PRESET_NAME = "Builtin"
export const MY_PRESETS_NAME = "My Presets";
import lz from '../path.ux/scripts/path-controller/extern/lz-string/lz-string.js';


export function compress(str: string): string {
  let s = 'LZ:';
  return s + lz.compressToBase64(str);
}

export function decompress(str: string): string {
  if (!str.startsWith("LZ:")) {
    return str;
  }

  str = str.slice(3, str.length);
  return lz.decompressFromBase64(str);
}

export function localStorageGet(key: string): string {
  let ret = localStorage[key];

  if (ret && typeof ret === "string") {
    ret = decompress(ret);
  }

  return ret;
}

export function localStorageSet(key: string, val: string): void {
  if (val && typeof val === "string" && val.length > 512) {
    val = compress(val);
  }

  //localStorage[key] = val;
}

window.compress = compress;
window.decompress = decompress;

window.compressPresets = () => {
  let vs = [];

  let size = 0;

  for (let k in localStorage) {
    let v = localStorage[k];

    if (typeof v !== "string" || !v.length) {
      continue;
    }

    /* Ensure we're not already compressed.*/
    v = decompress(v);

    if (v.length > 512) {
      v = compress(v);
      localStorage[k] = v;
    }

    size += v.length;
  }

  console.log(`SIZE: ${size/1024/1024}mb`);
}

export class CategoryList extends Array<Preset> {
  typeName: string
  category: string

  constructor(type = "", category = "") {
    super();

    this.typeName = type;
    this.category = category;
  }
}

export class PresetList extends Array<Preset> {
  typeName: string
  manager: PresetManager | undefined

  constructor(typeName = "", manager?: PresetManager) {
    super();
    this.typeName = typeName;
    this.manager = manager;
  }
}

export class Preset {
  preset: PresetData
  category: string
  schema: string
  version: number | number[]
  categoryIndex: number
  name: string;

  [KeyTag]: string | undefined

  constructor(preset: PresetData = {typeName: ''}) {
    this.preset = preset;
    this.category = "";
    this.schema = "";
    this.version = 0;
    this.categoryIndex = 0;

    this[KeyTag] = undefined;
    this.name = 'unnamed';
  }

  copyTo(b: Preset): void {
    b.preset = JSON.parse(JSON.stringify(this.preset));
    b.name = this.name;
    b.schema = this.schema;
    b.version = this.version;
    b.category = this.category;
  }

  copy(): Preset {
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

  loadJSON(json: string | Partial<PresetJSON>): this {
    let obj: Partial<PresetJSON> = typeof json === "string" ? JSON.parse(json) : json;

    if (obj.name !== undefined) this.name = obj.name;
    if (obj.category !== undefined) this.category = obj.category;
    if (obj.version !== undefined) this.version = obj.version;
    if (obj.schema !== undefined) this.schema = obj.schema;
    if (obj.preset !== undefined) this.preset = obj.preset;

    return this;
  }
}

/* The plain-object JSON form of a Preset (see Preset.toJSON). */
interface PresetJSON {
  name: string
  category: string
  version: number | number[]
  schema: string
  preset: PresetData
}

export function savePreset(pat: Pattern,
                           presetName                          = "preset",
                           category                            = "My Presets",
                           existingPreset: Preset | undefined  = undefined): Preset {
  let patClass = pat.constructor as nstructjs.StructableClass;

  let istruct = new nstructjs.STRUCT;
  istruct.add_class(patClass);

  let mstruct = nstructjs.manager;

  let badset = new Set<string>();//["vec2", "vec3", "vec4", "mat4"]);

  function add_class(name: string): void {
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
    /* nstructjs.register attaches `structName` to registered classes. */
    let structName = (cls as nstructjs.StructableClass).structName;
    if (structName) {
      add_class(structName);
    }
  }

  //find all used structs for schema
  function rec(value: unknown): void {
    //console.log(value);

    if (value === null || typeof value !== "object") {
      return;
    }

    let obj = value as Record<string, unknown>;

    if (typeof obj.name === "string" && obj.name in mstruct.structs) {
      add_class(obj.name);
    } else if (typeof obj.type === "string" && obj.type in mstruct.structs) {
      add_class(obj.type);
    } else if (typeof obj.data === "string" && obj.data in mstruct.structs) {
      add_class(obj.data);
    }

    for (let k in obj) {
      rec(obj[k]);
    }
  }

  let patStructName = patClass.structName ?? patClass.name ?? "";
  let st = nstructjs.manager.structs[patStructName];
  for (let field of st.fields) {
    rec(field);
  }

  //return;

  let preset = existingPreset ?? new Preset();

  /* writeJSON serializes the Pattern, whose STRUCT includes `typeName`. */
  let presetData = nstructjs.writeJSON(pat) as PresetData & Record<string, unknown>;

  return preset.loadJSON({
    version: cconst.VERSION,
    schema : nstructjs.write_scripts(istruct, false),
    preset : presetData,
    name   : presetName,
    category
  });
}

export function loadPreset(preset: Preset | string, existingObject: Pattern | undefined = undefined): Pattern {
  let p: Preset = typeof preset === "string" ? JSON.parse(preset) : preset;

  console.warn("loadPreset", p);

  let istruct = new nstructjs.STRUCT();
  istruct.parse_structs(p.schema);

  let cls = getPatternClass(p.preset.typeName);
  if (!cls) {
    throw new Error("unknown pattern type " + p.preset.typeName);
  }

  return istruct.readJSON(p.preset, cls as nstructjs.StructableClass<Pattern>, existingObject);
}

export const PRecalcFlags = {
  CATEGORY_LISTS: 1
};

export class PresetManager extends Array<Preset> {
  typeLists: Map<string, PresetList>
  keymap: Map<string, Preset>
  categoryKeys: Set<string>
  categoryLists: Map<string, CategoryList>
  recalc: number
  flag: number

  constructor() {
    super();

    this.typeLists = new Map();
    this.keymap = new Map();
    this.categoryKeys = new Set([MY_PRESETS_NAME, BUILTIN_PRESET_NAME, MODIFIED_PRESET_NAME]);
    this.categoryLists = new Map();

    this.recalc = PRecalcFlags.CATEGORY_LISTS;
    this.flag = 0;
  }

  makeKey(preset: Preset): string {
    let type = preset.preset.typeName;
    return `P${type}:$:${preset.name}`;
  }

  splitKey(key: string): [string, string] {
    let i = key.search(/\:\$\:/);
    return [key.slice(1, i), key.slice(i + 3, key.length)];
  }

  getCategoryList(type: string, category: string): CategoryList {
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

    return this.categoryLists.get(listkey)!;
  }

  getTypeList(type: string): PresetList {
    if (!this.typeLists.has(type)) {
      this.typeLists.set(type, new PresetList(type, this));
    }

    return this.typeLists.get(type)!;
  }

  changeCategory(preset: Preset, cat: string): this {
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

  rename(preset: Preset, name: string): this {
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

  push(preset: Preset): number {
    let type = preset.preset.typeName;

    this.rename(preset, preset.name);

    if (!this.typeLists.has(type)) {
      this.typeLists.set(type, new PresetList(type, this));
    }

    this.typeLists.get(type)!.push(preset);
    const tag = preset[KeyTag] = this.makeKey(preset);

    this.keymap.set(tag, preset);
    this.categoryKeys.add(preset.category);

    this.flag |= PRecalcFlags.CATEGORY_LISTS;

    return super.push(preset);
  }

  load(): void {
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
          let json = localStorageGet(k);

          let preset = new Preset().loadJSON(json);
          this.push(preset);
        }
      } catch (error) {
        if (error instanceof Error) {
          util.print_stack(error);
        }
        console.error("Failed to load a preset!", k);
      }
    }
  }

  /** copies preset if it's a builtin and returns new one,
   otherwise preset itself is returned */
  savePreset(preset: Preset): Preset {
    if (preset.category === "Builtin") {
      preset = preset.copy();
      preset.name = "Modified " + preset.name;
      preset.category = MODIFIED_PRESET_NAME;

      preset[KeyTag] = undefined;

      this.rename(preset, preset.name);
      this.push(preset);

      this.flag |= PRecalcFlags.CATEGORY_LISTS;
    }


    let key = preset[KeyTag];
    if (key !== undefined) {
      localStorageSet(key, JSON.stringify(preset));
    }

    return preset;
  }

  updatePreset(preset: Preset, pattern: Pattern, saveToLocalStorage = true): void {
    let sanitize_float = (value: unknown): void => {
      if (value === null || typeof value != "object") {
        return;
      }

      let obj = value as Record<string, unknown>;

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

    function sanitize_stringify(input: unknown): string {
      let obj = JSON.parse(JSON.stringify(input)) as {preset: Record<string, unknown>; schema?: unknown};
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
      let buf1 = sanitize_stringify(preset);
      JSON.parse(JSON.stringify(preset));
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

  getPreset(type: string, name: string): Preset | undefined {
    for (let preset of this.getTypeList(type)) {
      if (preset.name === name && preset.preset.typeName === type) {
        return preset;
      }
    }
  }

  deletePreset(preset: Preset): void {
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

  nextPreset(preset: Preset): Preset | undefined {
    let list = this.getCategoryList(preset.preset.typeName, preset.category);
    let i = list.indexOf(preset);

    let ret = list[(i + 1)%list.length];
    return ret === preset ? undefined : ret;
  }
}

export const presetManager = new PresetManager();

export function initPresets(): void {
  presetManager.load();
}

window._presetManager = presetManager;
