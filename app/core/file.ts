import {nstructjs, util} from '../path.ux/scripts/pathux.js';
import {Pattern, PatternClasses} from '../pattern/pattern.js';
import * as cconst from './const.js';
import type {AppState} from './appstate.js';
import type {AppScreen} from '../screen.js';

export const FileFlags = {
  HAS_SCREEN: 1
};

type StructReader<T> = (obj: T) => void

export class PatternList extends Array<Pattern> {
  static STRUCT: string
  _items: Pattern[] | undefined
  active: Pattern | string | undefined
  typeMap: Map<string, Pattern>

  constructor() {
    super();

    this._items = undefined; //nstructjs temp
    this.active = undefined;

    this.typeMap = new Map();
  }

  setActive(pat: Pattern | undefined) {
    this.active = pat;
  }

  push(item: Pattern) {
    this.typeMap.set(item.typeName, item);

    return super.push(item);
  }

  has(typeName_or_pattern: string | Pattern) {
    let pat = typeName_or_pattern;

    if (typeof pat === "string") {
      return this.typeMap.has(pat);
    } else if (typeof pat === "object") {
      return this.typeMap.get(pat.typeName) === pat;
    }

    return false;
  }

  remove(item: Pattern) {
    super.remove(item);

    if (item === this.active) {
      this.active = this.length > 0 ? this[0] : undefined;
    }

    this.typeMap.delete(item.typeName);
  }

  ensure(typeName: string): Pattern {
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

  loadSTRUCT(reader: StructReader<PatternList>) {
    reader(this);

    for (let item of this._items ?? []) {
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
  static STRUCT: string
  version_major: number
  version_minor: number
  version_micro: number
  flag: number
  structDefs: string
  magic?: string

  constructor() {
    this.version_major = cconst.VERSION[0];
    this.version_minor = cconst.VERSION[1];
    this.version_micro = cconst.VERSION[2];

    this.flag = 0;
    this.structDefs = nstructjs.write_scripts();
  }

  shallowCopyTo(b: FileHeader) {
    b.version_major = this.version_major;
    b.version_minor = this.version_minor
    b.version_micro = this.version_micro;

    return this;
  }

  shallowCopyFrom(b: FileHeader) {
    this.version_major = b.version_major;
    this.version_minor = b.version_minor
    this.version_micro = b.version_micro;

    this.flag = b.flag & ~FileFlags.HAS_SCREEN;

    return this;
  }

  loadSTRUCT(reader: StructReader<FileHeader>) {
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
  limitGPUPower: boolean
  gpuSkipFactor: number
  patterns: PatternList

  constructor() {
    super();

    this.limitGPUPower = true;
    this.gpuSkipFactor = 0.2;
    this.patterns = new PatternList();
  }

  shallowCopyTo(b: FileState) {
    super.shallowCopyTo(b);
    b.patterns = this.patterns;
    b.limitGPUPower = this.limitGPUPower;
    b.gpuSkipFactor = this.gpuSkipFactor;

    return this;
  }

  shallowCopyFrom(b: FileState) {
    b.shallowCopyTo(this);
    return this;
  }

  setActivePattern(typeName: string) {
    let pat = this.getPattern(typeName);

    if (pat) {
      this.patterns.active = pat;
    }

    return pat;
  }

  resetPattern(typeName: string) {
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

  getPattern(typeName: string) {
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
  screen?: AppScreen

  constructor() {
    super();

    this.flag |= FileFlags.HAS_SCREEN;
  }

  shallowCopyTo(b: FileWithScreen) {
    super.shallowCopyTo(b);

    b.screen = this.screen;
    return this;
  }

  shallowCopyFrom(b: FileWithScreen) {
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

export interface FileIOArgs {
  screen?: boolean
  json?: boolean
  resetToolStack?: boolean
}

export function saveFile(appstate: AppState, args: FileIOArgs) {
  let model: FileState = appstate.model;

  const doScreen = args.screen;
  const useJson = args.json;

  if (doScreen) {
    let model2 = new FileWithScreen();
    model.shallowCopyTo(model2);
    model2.screen = appstate.screen;
    model = model2;
  }

  if (!useJson) {
    let data: number[] = [];
    nstructjs.writeObject(data, model);

    return new Uint8Array(data).buffer;
  } else {
    return JSON.stringify(nstructjs.writeJSON(model), undefined, 1);
  }
}

export function loadFileFinal(appstate: AppState, model: FileState, istruct: InstanceType<typeof nstructjs.STRUCT>, args: FileIOArgs) {
  let doScreen = args.screen;
  let resetToolStack = args.resetToolStack;

  let screen: AppScreen | undefined;

  if (args.screen && model instanceof FileWithScreen) {
    screen = model.screen;
    if (screen) {
      screen.ctx = appstate.ctx;
    }
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
      sarea.area?.on_fileload(false);
    }
  }

  window.redraw_viewport();
}

interface FileJSON {
  magic?: string
  structDefs: string
  flag: number
}

export function loadFileJSON(appstate: AppState, buf: string | object, args: FileIOArgs = {}) {
  let json = (typeof buf === 'string' ? JSON.parse(buf) : buf) as FileJSON

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

export function loadFileBinary(appstate: AppState, buf: ArrayBuffer | ArrayBufferView | DataView, args: FileIOArgs = {}) {
  let view: DataView
  if (buf instanceof DataView) {
    view = buf
  } else if (ArrayBuffer.isView(buf)) {
    view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  } else {
    view = new DataView(buf)
  }

  let header = nstructjs.readObject(view, FileHeader);
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

  let model = istruct.readObject(view, cls);
  loadFileFinal(appstate, model, istruct, args);
}


export function loadFile(appstate: AppState, buf: string | ArrayBuffer | ArrayBufferView | DataView, args: FileIOArgs = {}) {
  if (args.json) {
    return loadFileJSON(appstate, buf, args);
  } else if (typeof buf === 'string') {
    throw new Error('binary file load requires a buffer, not a string')
  } else {
    return loadFileBinary(appstate, buf, args);
  }
}
