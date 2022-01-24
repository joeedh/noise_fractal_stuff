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
    this._update_digest = new util.HashDigest();
  }

  get length() {
    return this.generators.length;
  }

  static apiDefine(api) {
    let st = api.mapStruct(this, true);

    st.list("generators", "nodes", [function getStruct(api, list, key) {
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
                                    }]);

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
          let link2 = new SliderLink();
          link1.copyTo(link2);

          link2.src = link1.src.id;
          link2.dst = link1.dst.id;

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

    this.flag |= MLGraphFlags.RESORT;

    gen.id = this.idgen++;
    this.idMap.set(gen.id, gen);

    for (let p of gen.sliders.params) {
      p.id = this.idgen++;
      this.idMap.set(p.id, p);
    }

    this.generators.push(gen);

    return this;
  }

  remove(gen) {
    if (gen.id === -1) {
      console.warn("Generator is not in graph!", gen);
      return;
    }

    this.flag |= MLGraphFlags.RESORT;
    this.generators.remove(gen);
    this.idMap.delete(gen.id);

    gen.id = -1;

    //to prevent reference leaks, forcbly clear sortlist
    this.sortlist.length = 0;

    for (let param of gen.slider.params) {
      this.idMap.delete(param.id);
      param.id = -1;

      for (let link of param.links) {
        if (link.src === param) {
          link.dst.links.remove(link);
        } else {
          link.src.links.remove(link);
        }
      }
    }
  }

  sort() {
    this.flag &= ~MLGraphFlags.RESORT;

    let sortlist = this.sortlist;
    this.sortlist.length = 0;

    let rec = (gen) => {
      gen.flag |= MLFlags.VISIT;

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          if (link.dst.owner === gen && !(link.src.owner.flag & MLFlags.VISIT)) {
            rec(link.src.owner);
          }
        }
      }

      sortlist.push(gen);

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          if (link.src.owner === gen && !(link.dst.owner.flag & MLFlags.VISIT)) {
            rec(link.dst.owner);
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

  getDefineKey(gen, k) {
    k = k.replace(/\$/g, "" + gen.id);

    return `${k}_${gen.id}`;
  }

  getUniformKey(gen, param) {
    return "p" + param.name + "_" + gen.id;
  }

  setupShader(ctx, gl, uniforms, defines, transformSliders, transformOffsets) {
    for (let gen of this.sortlist) {
      let us = {};
      let ds = {};

      gen.setup(ctx, gl, us, ds);

      let id = "" + gen.id;

      for (let [dst, src] of [[uniforms, us], [defines, ds]]) {
        for (let k in src) {
          let k2 = k.replace(/\$/g, "" + id);
          let v2 = src[k];

          if (dst === defines) {
            k2 = this.getDefineKey(gen, k2);
            if (typeof v2 === "string") {
              v2 = v2.replace(/\bSLIDERS\b/g, "SLIDERS" + gen.id);
            }
          }

          dst[k2] = v2;
        }
      }
    }

    for (let gen of this.sortlist) {
      let k = 'SLIDERS' + gen.id;

      for (let i = 0; i < gen.sliders.length; i++) {
        uniforms[`${k}[${i}]`] = gen.sliders[i] ?? 0.0;
      }

      let param = gen.sliders.get("_factor");
      uniforms[this.getUniformKey(gen, param)] = param.value;
    }

    const x = transformSliders[transformOffsets.x];
    const y = transformSliders[transformOffsets.y];
    const scale = transformSliders[transformOffsets.scale];

    //add transform
    for (let gen of this.sortlist) {
      let transform2 = gen.constructor.patternDef().offsetSliders;
      let k = "SLIDERS" + gen.id;

      let x2 = gen.sliders[transform2.x]/scale + x;
      let y2 = gen.sliders[transform2.y]/scale + y;
      let scale2 = gen.sliders[transform2.scale] * scale;

      uniforms[`${k}[${transform2.x}]`] = x2;
      uniforms[`${k}[${transform2.y}]`] = y2;
      uniforms[`${k}[${transform2.scale}]`] = scale2;
    }

    if (Math.random() > 0.9) {
      //console.error("UNIFORMS", uniforms);
      //console.error("DEFINES", defines);
    }
  }

  /** generate fragment shader code, node this
   *  fits into the pattern shader system
   */
  generate(ctx) {
    if (this.flag & MLGraphFlags.RESORT) {
      this.sort();
    }

    let s = '';
    let getName = gen => `layer${gen.id}`;

    for (let gen of this.sortlist) {
      s += `
uniform float SLIDERS${gen.id}[${gen.sliders.length}];
uniform float ${this.getUniformKey(gen, gen.sliders.get("_factor"))};
`;

    }

    for (let gen of this.sortlist) {
      let code = gen.getFragmentCode();
      let name = getName(gen);

      let defines = {};
      let uniforms = {};
      let ctx = {pattern: gen};

      gen.setup(ctx, undefined, uniforms, defines);
      console.log("VARS", gen.constructor.patternDef().typeName, uniforms, defines);

      for (let k in defines) {
        let k2 = this.getDefineKey(gen, k);
        k = new RegExp("\\b" + k + "\\b");

        code = code.replaceAll(k, k2);
      }

      for (let k in uniforms) {
        let k2 = k.replace(/\$/g, "" + gen.id);

        code = code.replaceAll(k, k2);
      }

      code = code.replace(/\$/g, "g" + gen.id);
      code = code.replace(/\bpattern\b/g, name).trim();
      code = code.replace(/\bSLIDERS\b/g, "SLIDERS" + gen.id);

      s += "\n" + `
/*---------------${name}--------------*/
${code}
      `.trim() + "\n";
    }

    let mixes = {
      [SliderBlendModes.ADD]: (a, b) => `(${a}) + (${b})`,
      [SliderBlendModes.SUB]: (a, b) => `(${a}) - (${b})`,
      [SliderBlendModes.MUL]: (a, b) => `(${a}) * (${b})`,
      [SliderBlendModes.DIV]: (a, b) => `(${a}) / (${b})`,
      [SliderBlendModes.MIX]: (a, b) => `(${b})`,
    }
    let getMix = (a, b, mode) => {
      return `${mixes[mode](a, b)}`
    };

    let code = '  float f, f2, totw;\n\n';
    let first = true;

    for (let gen of this.sortlist) {
      code += `  /* ${gen.constructor.patternDef().typeName + ":" + gen.id} */\n`;
      code += `  f2 = ${getName(gen)}(ix, iy);\n`;

      //let w = gen.sliders._factor;
      let w = this.getUniformKey(gen, gen.sliders.get("_factor"));
      let mode = ~~gen.sliders._blend_mode;

      if (first) {
        first = false;
        code += `  f = f2*${w};\n`;
      } else {
        code += `  f += ${getMix(`f/(totw == 0.0 ? 0.00001 : totw)`, 'f2', mode)}*${w};\n`;
      }

      code += `  totw += ${w};\n\n`;
    }

    code += `
  if (totw != 0.0) {
    f /= totw;
  }
  
  return f;
`;

    //console.log("CODE", totw, code);

    s += `
float pattern(float ix, float iy) {
${code}
}
    `;

    //console.log(s);

    return s;
  }

  genShaderKey(digest = this._update_digest) {
    for (let gen of this.generators) {
      digest.add(gen.typeName);

      for (let param of gen.sliders.params) {
        digest.add(param.links.length);
      }

      if (gen.shader) {
        digest.add(gen.shader.fragmentSource.length);
      }
    }

    return digest.get();
  }

  genUpdateKey(digest = this._update_digest.reset()) {
    this.genShaderKey(digest);

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        if (param.noReset) {
          continue;
        }

        let v = param.value;

        if (typeof v === "number") {
          digest.add(param.value);
        } else if (typeof v === "object" && Array.isArray(v)) {
          for (let num of v) {
            digest.add(num);
          }
        }
      }
    }

    return digest.get();
  }

  pruneDuplicateLinks() {
    let linkMap = new Map();

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        for (let i = 0; i < param.links.length; i++) {
          let link = param.links[i];

          let key = "" + link.src.name + ":" + link.src.owner.id + ":";
          key += link.dst.name + ":" + link.dst.owner.id;

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
        param.owner = gen;
        this.idMap.set(param.id, param);
      }
    }

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        let links2 = [];

        //console.warn(param, gen);

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
