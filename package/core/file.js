import {nstructjs} from '../path.ux/pathux.js';
import {Pattern, PatternClasses} from '../pattern/pattern.js';
import * as cconst from './const.js';
import {write_scripts} from '../path.ux/scripts/path-controller/util/struct.js';

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
  active : string | this.active !== undefined ? this.active.typeName : ""; 
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

    this.patterns = new PatternList();
  }

  shallowCopyTo(b) {
    super.shallowCopyTo(b);
    b.patterns = this.patterns;
    return this;
  }

  shallowCopyFrom(b) {
    super.shallowCopyFrom(b);

    this.patterns = b.patterns;
    return this;
  }

  setActivePattern(typeName) {
    let pat = this.getPattern(typeName);

    if (pat) {
      this.patterns.active = pat;
    }

    return pat;
  }

  getPattern(typeName) {
    return this.patterns.ensure(typeName);
  }
}

FileState.STRUCT = nstructjs.inherit(FileState, FileHeader) + `
  patterns      : PatternList;
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

  if (doScreen) {
    let model2 = new FileWithScreen();
    model.shallowCopyTo(model2);
    model2.screen = appstate.screen;
    model = model2;
  }

  let data = [];
  nstructjs.writeObject(data, model);
  data = new Uint8Array(data).buffer;

  return data;
}

export function loadFile(appstate, buf, args={}) {
  let doScreen = args.screen;
  let resetToolStack = args.resetToolStack;

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
  let screen;

  if (args.screen && model instanceof  FileWithScreen) {
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
    appstate.reset(screen, false);
  }

  if (appstate.screen) {
    for (let sarea of appstate.screen.sareas) {
      sarea.area.on_fileload();
    }
  }

  window.redraw_viewport();
}