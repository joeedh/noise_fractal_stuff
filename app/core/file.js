import {nstructjs, util} from '../path.ux/pathux.js';
import {Pattern, PatternClasses} from '../pattern/pattern.js';
import * as cconst from './const.js';

export const FileFlags = {
  HAS_SCREEN: 1
};

export class PatternList extends Array {
  constructor() {
    super();

    this._items = undefined; //nstructjs temp
    this.active = undefined;

    this.typeMap = new Map();
  }

  setActive(pat) {
    this.active = pat;
  }

  push(item) {
    this.typeMap.set(item.typeName, item);

    return super.push(item);
  }

  has(typeName_or_pattern) {
    let pat = typeName_or_pattern;

    if (typeof pat === "string") {
      return this.typeMap.has(pat);
    } else if (typeof pat === "object") {
      return this.typeMap.get(pat.typeName) === pat;
    }

    return false;
  }

  remove(item) {
    super.remove(item);

    if (item === this.active) {
      this.active = this.length > 0 ? this[0] : undefined;
    }

    this.typeMap.delete(item);
  }

  ensure(typeName) {
    for (let pat of this) {
      if (pat.typeName === typeName) {
        return pat;
      }
    }

    for (let cls of PatternClasses) {
      if (cls.patternDef().typeName === typeName) {
        let pat = new cls();

        this.push(pat);

        return pat;
      }
    }

    throw new Error("unknown pattern " + typeName);
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let item of this._items) {
      this.push(item);

      if (item.typeName === this.active) {
        //console.error("Found active", this.active, item);
        this.active = item;
      }
    }

    if (typeof this.active === "string") {
      if (this.active.length > 0) {
        console.error("Failed to find active pattern generator " + this.active);
      }

      this.active = undefined;
    }

    this._items = undefined;
  }
}

PatternList.STRUCT = `
PatternList {
  _items : array(abstract(Pattern)) | this;
  active : string                   | this.active !== undefined ? this.active.typeName : ""; 
}
`;
nstructjs.register(PatternList);

export class FileHeader {
  constructor() {
    this.version_major = cconst.VERSION[0];
    this.version_minor = cconst.VERSION[1];
    this.version_micro = cconst.VERSION[2];

    this.flag = 0;
    this.structDefs = nstructjs.write_scripts();
  }

  shallowCopyTo(b) {
    b.version_major = this.version_major;
    b.version_minor = this.version_minor
    b.version_micro = this.version_micro;

    return this;
  }

  shallowCopyFrom(b) {
    this.version_major = b.version_major;
    this.version_minor = b.version_minor
    this.version_micro = b.version_micro;

    this.flag = b.flag & ~FileFlags.HAS_SCREEN;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

FileHeader.STRUCT = `
FileHeader {
  magic         : static_string[4] | "${cconst.FILE_MAGIC}";
  flag          : short;
  version_major : short;
  version_minor : short;
  version_micro : short;
  structDefs    : string; 
}
`;
nstructjs.register(FileHeader);

export class FileState extends FileHeader {
  constructor() {
    super();

    this.limitGPUPower = true;
    this.gpuSkipFactor = 0.2;
    this.patterns = new PatternList();
  }

  shallowCopyTo(b) {
    super.shallowCopyTo(b);
    b.patterns = this.patterns;
    b.limitGPUPower = this.limitGPUPower;
    b.gpuSkipFactor = this.gpuSkipFactor;

    return this;
  }

  shallowCopyFrom(b) {
    b.shallowCopyTo(this);
    return this;
  }

  setActivePattern(typeName) {
    let pat = this.getPattern(typeName);

    if (pat) {
      this.patterns.active = pat;
    }

    return pat;
  }

  resetPattern(typeName) {
    if (!this.patterns.has(typeName)) {
      this.getPattern(typeName);
      return;
    }

    let pat = this.getPattern(typeName);
    let active = pat === this.patterns.active;

    this.patterns.remove(pat);
    pat = this.getPattern(typeName);

    if (active) {
      this.patterns.active = pat;
    }
  }

  getPattern(typeName) {
    return this.patterns.ensure(typeName);
  }
}

FileState.STRUCT = nstructjs.inherit(FileState, FileHeader) + `
  patterns      : PatternList;
  limitGPUPower : bool;
  gpuSkipFactor : float;
}
`;

nstructjs.register(FileState);

export class FileWithScreen extends FileState {
  constructor() {
    super();

    this.flag |= FileFlags.HAS_SCREEN;
  }

  shallowCopyTo(b) {
    super.shallowCopyTo(b);

    b.screen = this.screen;
    return this;
  }

  shallowCopyFrom(b) {
    super.shallowCopyFrom(b);
    this.screen = b.screen;

    return this;
  }
}

FileWithScreen.STRUCT = nstructjs.inherit(FileWithScreen, FileState) + `
  screen : AppScreen;
}
`;
nstructjs.register(FileWithScreen);

export function saveFile(appstate, args) {
  let model = appstate.model;

  const doScreen = args.screen;
  const useJson = args.json;

  if (doScreen) {
    let model2 = new FileWithScreen();
    model.shallowCopyTo(model2);
    model2.screen = appstate.screen;
    model = model2;
  }

  if (!useJson) {
    let data = [];
    nstructjs.writeObject(data, model);
    data = new Uint8Array(data).buffer;

    return data;
  } else {
    return JSON.stringify(nstructjs.writeJSON(model), undefined, 1);
  }
}

export function loadFileFinal(appstate, model, istruct, args) {
  let doScreen = args.screen;
  let resetToolStack = args.resetToolStack;

  let screen;

  if (args.screen && model instanceof FileWithScreen) {
    screen = model.screen;
    screen.ctx = appstate.ctx;
  }

  if (model.constructor !== FileState) {
    model = new FileState().shallowCopyFrom(model);
  }

  console.log(model, screen);

  appstate.model = model;

  if (resetToolStack) {
    appstate.toolstack.reset(appstate.ctx);
  }

  if (doScreen && screen) {
    appstate.reset(screen, false, false);
  }

  if (appstate.screen) {
    for (let sarea of appstate.screen.sareas) {
      sarea.area.on_fileload();
    }
  }

  window.redraw_viewport();
}

export function loadFileJSON(appstate, buf, args = {}) {
  let json = buf;

  if (typeof json === "string") {
    json = JSON.parse(json);
  }

  if (json.magic !== cconst.FILE_MAGIC) {
    throw new Error("invalid file");
  }

  let istruct = new nstructjs.STRUCT();
  istruct.parse_structs(json.structDefs);

  /*
  function fixItems(obj, extraProps = {}) {
    if (!obj._items) {
      let obj2 = Object.assign({_items: []}, extraProps);

      for (let i = 0; i < obj.length; i++) {
        obj2._items.push(obj[i]);
      }

      return obj2;
    }

    return obj;
  }

  json.patterns = fixItems(json.patterns, {active: json.patterns.active});

  function fixPattern(pat) {
    pat.sliders = fixItems(pat.sliders, {params : pat.sliders.params});
    pat.sliders._items = pat.sliders._items.map(f => f ?? 0.0);

    if (pat.typeName === "graph") {
      for (let pat2 of pat.graph.generators) {
        fixPattern(pat2);
      }
    }
  }

  for (let pat of json.patterns._items) {
    fixPattern(pat);
  }
  window._istruct = istruct;

  console.warn(json);
  //*/


  let cls;

  if (json.flag & FileFlags.HAS_SCREEN) {
    cls = FileWithScreen;
  } else {
    cls = FileState;
  }

  let model = istruct.readJSON(json, cls);
  loadFileFinal(appstate, model, istruct, args);
}

export function loadFileBinary(appstate, buf, args = {}) {
  if (buf instanceof Uint8Array || buf instanceof Int8Array || buf instanceof Uint8ClampedArray) {
    buf = buf.buffer;
  }

  if (!(buf instanceof DataView)) {
    buf = new DataView(buf);
  }

  let header = nstructjs.readObject(buf, FileHeader);
  console.log("header", header);

  if (header.magic !== cconst.FILE_MAGIC) {
    throw new Error("invalid file");
  }

  let istruct = new nstructjs.STRUCT();
  istruct.parse_structs(header.structDefs);

  let cls;

  if (header.flag & FileFlags.HAS_SCREEN) {
    cls = FileWithScreen;
  } else {
    cls = FileState;
  }

  let model = istruct.readObject(buf, cls);
  loadFileFinal(appstate, model, istruct, args);
}


export function loadFile(appstate, buf, args = {}) {
  if (args.json) {
    return loadFileJSON(appstate, buf, args);
  } else {
    return loadFileBinary(appstate, buf, args);
  }
}
