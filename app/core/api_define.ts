import {DataAPI, ToolPropertyCache, EnumProperty, buildToolSysAPI} from '../path.ux/scripts/pathux.js';
import {areaclasses} from '../path.ux/scripts/screen/area_base.js';
import {PatternClasses, makePatternsEnum, PatternsEnum, Pattern, CurveSet} from '../pattern/pattern.js';
import '../patterns/all.js';
import {FileState, PatternList} from './file.js';
import {ToolContext} from './context.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';
import '../editors/canvas/canvas_ops.js';
import {CategoryList, Preset, PresetList, PresetManager, presetManager} from '../pattern/preset.js';

type API = DataAPI
import {autoDiffGLSL} from '../glsl_autodiff/autodiff.js';
import './app_ops.js';
import {SliderLink, SliderParam} from '../pattern/pattern_types.js';
import {MLGraph} from '../ml/ml_types.js';


function api_define_preset(api: API) {
  let st = api.mapStruct(Preset, true);

  st.string("name", "name", "Name")
      .customGetSet<Preset>(undefined, function (name) {
        presetManager.rename(this.dataref, String(name));
      });

  st.string("typeName", "typeName", "Type").readOnly();
  st.string("category", "category", "Category")
      .customGetSet<Preset>(undefined, function (cat) {
        presetManager.changeCategory(this.dataref, String(cat));
      });

  let cst = api.mapStruct(CategoryList, true);
  cst.string("typeName", "typeName", "Type").readOnly();
  cst.string("category", "category", "Category").readOnly();
  cst.list<CategoryList, string, Preset>("", "presets", [
    function getLength(api: API, list: CategoryList) {
      return list.length;
    },
    function get(api: API, list: CategoryList, key: string) {
      return list[parseInt(key)];
    },
    function getKey(api: API, list: CategoryList, obj: Preset) {
      return obj.categoryIndex;
    },
    function getStruct(api: API, list: CategoryList, obj: Preset) {
      return st;
    },
    function getIter(api: API, list: CategoryList) {
      return list;
    },

  ]);

  let plst = api.mapStruct(PresetList, true);
  plst.list<PresetList, string, CategoryList>("", "categories", [
    function getLength(api: API, list: PresetList) {
      return list.manager?.categoryKeys.size ?? 0;
    },
    function get(api: API, list: PresetList, key: string) {
      if (!list.manager || !list.manager.categoryKeys.has(key)) {
        return undefined;
      }
      return list.manager.getCategoryList(list.typeName, key);
    },
    function getKey(api: API, list: PresetList, obj: CategoryList) {
      return obj.typeName;
    },
    function getIter(api: API, list: PresetList) {
      const manager = list.manager
      return (function* () {
        if (!manager) {
          return
        }
        for (let key of manager.categoryKeys) {
          yield manager.getCategoryList(list.typeName, key);
        }
      })();
    },
    function getStruct(api: API, list: PresetList, obj: CategoryList) {
      return cst;
    }
  ]);

  let pst = api.mapStruct(PresetManager, true);
  pst.list<PresetManager, string, PresetList>("", "types", [
    function getLength(api: API, list: PresetManager) {
      return list.typeLists.size;
    },
    function getActive(api: API, list: PresetManager) {
      //eek!
      if (!_appstate || !_appstate.ctx || !_appstate.ctx.pattern) {
        return undefined;
      }

      return list.getTypeList(_appstate.ctx.pattern.typeName);
    },
    function get(api: API, list: PresetManager, key: string) {
      return list.typeLists.get(key);
    },
    function getKey(api: API, list: PresetManager, obj: PresetList) {
      return obj.typeName;
    },
    function getIter(api: API, list: PresetManager) {
      return list.values();
    },
    function getStruct(api: API, list: PresetManager, obj: PresetList) {
      return plst;
    }
  ]);
}

function api_define_model(api: API) {
  let st = api.mapStruct(FileState, true);

  st.bool("limitGPUPower", "limitGPUPower", "Limit GPU")
      .description("Try to prevent GPU\n from overheating.")
  st.float("gpuSkipFactor", "gpuSkipFactor", "GPU Skip")
      .description("Bigger values produce more GPU frame skipping in Limit GPU mode")
      .range(0, 1.0)
      .step(0.2)
      .noUnits()
      .decimalPlaces(2);

  st.list<PatternList, string, Pattern>("patterns", "patterns", [
    function getStruct(api: API, list: PatternList, key: string) {
      let pat = list.typeMap.get(key)
      if (!pat) {
        return undefined
      }

      return api.mapStruct(pat.constructor as new () => Pattern, false);
    },
    function get(api: API, list: PatternList, key: string) {
      list.ensure(key);
      return list.typeMap.get(key);
    },

    function getKey(api: API, list: PatternList, pat: Pattern) {
      return pat.typeName;
    },

    function getActive(api: API, list: PatternList) {
      return list.active;
    },

    function setActive(api: API, list: PatternList, pat: Pattern) {
      list.setActive(pat);
      window._appstate.autoSave();
    },

    function getIter(api: API, list: PatternList) {
      return list;
    }
  ]);
}

export function api_define() {
  let api = new DataAPI();

  SliderLink.apiDefine(api);
  SliderParam.apiDefine(api);

  CurveSet.apiDefine(api);

  //make base class struct
  Pattern.apiDefine(api);

  MLGraph.apiDefine(api);

  for (let cls of PatternClasses) {
    cls.apiDefine(api);
  }

  for (let k in areaclasses) {
    const cls = areaclasses[k] as {apiDefine?: (api: API) => unknown}
    cls.apiDefine?.(api);
  }

  api_define_model(api);
  api_define_preset(api);

  let cst = api.mapStruct(ToolContext, true);
  cst.dynamicStruct("pattern", "pattern", "Pattern", api.mapStruct(Pattern, false));

  cst.struct("model", "model", "Model", api.mapStruct(FileState));

  const patternsEnum = makePatternsEnum()
  cst.enum("", "activePattern", patternsEnum, "Active Pattern").customGetSet<ToolContext>(function () {
    let pat = this.dataref.model.patterns.active;

    if (!pat || typeof pat === 'string') {
      return 0;
    }

    return patternsEnum.values[pat.typeName];
  }, function (val) {
    this.dataref.model.setActivePattern(String(patternsEnum.keys[val as number]));
    window.redraw_viewport();
    window._appstate.autoSave();
  });

  cst.struct("canvas", "canvas", "Canvas", api.mapStruct(CanvasEditor));
  cst.struct("presets", "presets", "Presets", api.mapStruct(PresetManager));

  cst.struct("propCache", "toolDefaults", "Tool Defaults", api.mapStruct(ToolPropertyCache));

  api.rootContextStruct = cst;

  buildToolSysAPI(api, false);

  return api;
}
