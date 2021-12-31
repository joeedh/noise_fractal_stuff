import {areaclasses, DataAPI, EnumProperty} from '../path.ux/pathux.js';
import {PatternClasses, makePatternsEnum, PatternsEnum, Pattern} from '../pattern/pattern.js';
import '../patterns/all.js';
import {FileState} from './file.js';
import {ToolContext} from './context.js';
import {CanvasEditor} from '../editors/canvas/canvas.js';

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

  let cst = api.mapStruct(ToolContext, true);
  cst.dynamicStruct("pattern", "pattern", "Pattern", api.mapStruct(Pattern, false));

  cst.struct("model", "model", "Model", api.mapStruct(FileState));
  cst.enum("", "activePattern", makePatternsEnum(), "Active Pattern").customGetSet(function () {
    let pat = this.dataref.model.patterns.active;

    if (!pat) {
      return 0;
    }

    return PatternsEnum.values[pat.typeName];
  }, function(val) {
    this.dataref.model.setActivePattern(PatternsEnum.keys[val]);
    window.redraw_viewport();
  });

  cst.struct("canvas", "canvas", "Canvas", api.mapStruct(CanvasEditor));

  api.rootContextStruct = cst;

  return api;
}
