import {DataAPI, EnumProperty} from '../path.ux/pathux.js';
import {PatternClasses, makePatternsEnum, PatternsEnum} from '../pattern/pattern.js';
import '../patterns/all.js';
import {FileState} from './file.js';
import {ToolContext} from './context.js';

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

  for (let cls of PatternClasses) {
    cls.apiDefine(api);
  }

  api_define_model(api);

  let cst = api.mapStruct(ToolContext, true);
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

  api.rootContextStruct = cst;

  return api;
}
