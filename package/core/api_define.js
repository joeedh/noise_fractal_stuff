import {areaclasses, DataAPI, EnumProperty} from '../path.ux/pathux.js';
import {PatternClasses, makePatternsEnum, PatternsEnum, Pattern} from '../pattern/pattern.js';
import '../patterns/all.js';
import {FileState} from './file.js';
import {ToolContext} from './context.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import '../editors/canvas/canvas_ops.js';
import {CategoryList, Preset, PresetList, PresetManager, presetManager} from '../pattern/preset.js';

function api_define_preset(api) {
  let st = api.mapStruct(Preset, true);

  st.string("name", "name", "Name")
    .customGetSet(undefined, function (name) {
      presetManager.rename(this.dataref, name);
    });

  st.string("typeName", "typeName", "Type").readOnly();
  st.string("category", "category", "Category")
    .customGetSet(undefined, function (cat) {
      presetManager.changeCategory(this.dataref, cat);
    });

  let cst = api.mapStruct(CategoryList, true);
  cst.string("typeName", "typeName", "Type").readOnly();
  cst.string("category", "category", "Category").readOnly();
  cst.list("", "presets", [
    function getLength(api, list) {
      return list.length;
    },
    function get(api, list, key) {
      key = parseInt(key);
      return list[key];
    },
    function getKey(api, list, obj) {
      return obj.categoryIndex;
    },
    function getStruct(api, list, obj) {
      return st;
    },
    function getIter(api, list) {
      return list;
    },

  ]);

  let plst = api.mapStruct(PresetList, true);
  plst.list("", "categories", [
    function getLength(api, list) {
      return list.manager.categoryKeys.size;
    },
    function get(api, list, key) {
      if (!list.manager.categoryKeys.has(key)) {
        return undefined;
      }
      return list.manager.getCategoryList(list.typeName, key);
    },
    function getKey(api, list, obj) {
      return obj.typeName;
    },
    function getIter(api, list) {
      return (function*() {
        for (let key of list.manager.categoryKeys) {
          yield list.getCategoryList(list.typeName, key);
        }
      })();
    },
    function getStruct(api, list, obj) {
      return cst;
    }
  ]);

  let pst = api.mapStruct(PresetManager, true);
  pst.list("", "types", [
    function getLength(api, list) {
      return list.typeLists.size;
    },
    function getActive(api, list) {
      //eek!
      if (!_appstate || !_appstate.ctx || !_appstate.ctx.pattern) {
        return undefined;
      }

      return list.getTypeList(_appstate.ctx.pattern.typeName);
    },
    function get(api, list, key) {
      return list.typeLists.get(key);
    },
    function getKey(api, list, obj) {
      return obj.typeName;
    },
    function getIter(api, list) {
      return list.values();
    },
    function getStruct(api, list, obj) {
      return plst;
    }
  ]);
}

function api_define_model(api) {
  let st = api.mapStruct(FileState, true);

  st.list("patterns", "patterns", [
    function getStruct(api, list, key) {
      let pat = list.typeMap.get(key);

      return api.mapStruct(pat.constructor, false);
    },
    function get(api, list, key) {
      list.ensure(key);
      return list.typeMap.get(key);
    },

    function getKey(api, list, pat) {
      return pat.typeName;
    },

    function getActive(api, list) {
      return list.active;
    },

    function setActive(api, list, pat) {
      list.setActive(pat);
      window._appstate.autoSave();
    },

    function getIter(api, list) {
      return list;
    }
  ]);
}

export function api_define() {
  let api = new DataAPI();

  //make base class struct
  Pattern.apiDefine(api);

  for (let cls of PatternClasses) {
    cls.apiDefine(api);
  }

  for (let k in areaclasses) {
    areaclasses[k].apiDefine(api);
  }

  api_define_model(api);
  api_define_preset(api);

  let cst = api.mapStruct(ToolContext, true);
  cst.dynamicStruct("pattern", "pattern", "Pattern", api.mapStruct(Pattern, false));

  cst.struct("model", "model", "Model", api.mapStruct(FileState));
  cst.enum("", "activePattern", makePatternsEnum(), "Active Pattern").customGetSet(function () {
    let pat = this.dataref.model.patterns.active;

    if (!pat) {
      return 0;
    }

    return PatternsEnum.values[pat.typeName];
  }, function (val) {
    this.dataref.model.setActivePattern(PatternsEnum.keys[val]);
    window.redraw_viewport();
    window._appstate.autoSave();
  });

  cst.struct("canvas", "canvas", "Canvas", api.mapStruct(CanvasEditor));
  cst.struct("presets", "presets", "Presets", api.mapStruct(PresetManager));

  api.rootContextStruct = cst;


  return api;
}
