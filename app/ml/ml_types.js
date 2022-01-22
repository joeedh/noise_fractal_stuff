import {nstructjs, util, Vector2, Vector3, Vector4} from '../path.ux/pathux.js';
import {MLFlags, MLGraphFlags} from './ml_base.js';
import {SliderTypes, SliderParam, SliderTypeMap, SliderBlendModes} from '../pattern/pattern_types.js';
import {Pattern} from '../pattern/pattern.js';

export const MLGeneratorClasses = [];

export class MLGraph {
  constructor() {
    this.idgen = 0;
    this.generators = [];
    this.idMap = new Map();
    this.sortlist = [];
    this.flag = MLGraphFlags.RESORT;
  }

  get length() {
    return this.generators.length;
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    st.list("generators", "nodes", [
      function getStruct(api, list, key) {
        let obj = key !== undefined ? list[key] : undefined;

        return !obj ? api.mapStruct(Pattern) : api.mapStruct(obj.constructor);
      },

      function get(api, list, key) {
        return list[key];
      },

      function getKey(api, list, obj) {
        return list.indexOf(obj);
      },

      function getIter(api, list) {
        return list[Symbol.iterator]();
      },

      function getLength(api, list) {
        return list.length;
      }
    ]);

    return st;
  }

  copy() {
    let ml = new MLGraph();
    ml.idgen = this.idgen;
    ml.flag = MLGraphFlags.RESORT;

    for (let gen of this.generators) {
      let gen2 = gen.copy();

      gen2.id = gen.id;
      ml.idMap.set(gen2.id, gen);
      ml.generators.push(gen2);

      for (let i = 0; i < gen2.sliders.params.length; i++) {
        let param1 = gen.sliders.params[i];
        let param2 = gen2.sliders.params[i];

        param2.id = param1.id;
        ml.idMap.set(param2.id, param2);

        for (let link1 of param1.links) {
          let link2 = new SliderLink(link1.src.id, link2.src.id);
          link1.copyTo(link2);

          param2.links.push(link2);
        }
      }
    }

    for (let gen of ml.generators) {
      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          link.src = ml.idMap.get(link.src);
          link.dst = ml.idMap.get(link.dst);
        }
      }
    }

    ml.pruneDuplicateLinks();

    return ml;
  }

  flagResort() {
    this.flag |= MLGraphFlags.RESORT;
  }

  insert(gen, before = 0) {
    this.add(gen);

    let generators = this.generators;

    if (generators.length === 1 || before === -1 || before === this.generators.length) {
      return this;
    }

    let i = before;
    while (i < generators.length - 1) {
      generators[i] = generators[i + 1];
    }

    this[before] = gen;

    return this;
  }

  ensureDependParam(gen) {
    for (let param of gen.sliders.params) {
      if (param.name === "depend" && param.type === SliderTypes.DEPEND) {
        return;
      }
    }

    let param = new SliderParam("depend", SliderTypes.DEPEND);
    gen.sliders.push(param);
    gen.sliders.rebindProperties();
  }

  ensureFactorParam(gen) {
    if (!gen.sliders.has("_factor")) {
      gen.sliders.push(new SliderParam("_factor", SliderTypes.FLOAT, 0.5));
    }
    if (!gen.sliders.has("_blend_mode")) {
      gen.sliders.push(new SliderParam("_blend_mode", SliderTypes.ENUM, 0));
    }

    gen.sliders.get("_blend_mode").enumDef = SliderBlendModes;
    gen.sliders.get("_factor").range(-2, 2);
  }

  add(gen) {
    this.ensureDependParam(gen);
    this.ensureFactorParam(gen);

    gen.id = this.idgen++;
    this.idMap.set(gen.id, gen);

    for (let p of gen.sliders.params) {
      p.id = this.idgen++;
      this.idMap.set(p.id, p);
    }

    this.generators.push(gen);

    return this;
  }

  sort() {
    this.flag &= ~MLGraphFlags.RESORT;

    let sortlist = this.sortlist;
    this.sortlist.length = 0;

    let rec = (gen) => {
      gen.flag |= MLFlags.VISIT;

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          if (link.dst === gen && !(link.src.flag & MLFlags.VISIT)) {
            rec(link.src);
          }
        }
      }

      sortlist.push(gen);

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          if (link.src === gen && !(link.dst.flag & MLFlags.VISIT)) {
            rec(link.dst);
          }
        }
      }
    }

    let varbase = 0;

    for (let gen of this.generators) {
      gen.flag &= ~MLFlags.VISIT;
    }

    let roots = [];

    for (let gen of this.generators) {
      if (!gen.haveInputs) {
        roots.push(gen);
      }
    }

    for (let r of roots) {
      if (!(r.flag & MLFlags.VISIT)) {
        rec(r);
      }
    }
  }

  generate() {
    if (this.flag & MLGraphFlags.RESORT) {
      this.sort();
    }

  }

  pruneDuplicateLinks() {
    let linkMap = new Map();

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        for (let i = 0; i < param.links.length; i++) {
          let link = param.links[i];
          let key = "" + link.src.id + ":" + link.dst.id;

          let link2 = linkMap.get(key);

          if (link2) {
            param.links[i] = link2;
          } else {
            linkMap.set(key, link);
          }
        }
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    this.flag |= MLGraphFlags.RESORT;

    for (let gen of this.generators) {
      this.idMap.set(gen.id, gen);

      for (let param of gen.sliders.params) {
        this.idMap.set(param.id, param);
      }
    }

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        let links2 = [];

        console.warn(param, gen);

        for (let link of param.links) {
          link.src = this.idMap.get(link.src);
          link.dst = this.idMap.get(link.dst);

          if (!link.src || !link.dst) {
            console.error("Generator relinking error", link.src, link.dst, link);
            continue;
          }

          links2.push(link);
        }

        param.links = links2;
      }
    }

    /*eliminate duplicate param links, which got duplicated on save*/
    this.pruneDuplicateLinks();

    for (let gen of this.generators) {
      this.ensureDependParam(gen);
      this.ensureFactorParam(gen);
    }
  }
}

MLGraph.STRUCT = `
MLGraph {
  idgen       : int;
  generators  : array(abstract(Pattern));
}
`;
nstructjs.register(MLGraph);
