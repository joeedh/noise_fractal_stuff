import {nstructjs, util, DataAPI} from '../path.ux/scripts/pathux.js';
import {MLFlags, MLGraphFlags} from './ml_base.js';
import {SliderTypes, SliderParam, SliderBlendModes, SliderLink} from '../pattern/pattern_types.js';
import {Pattern} from '../pattern/pattern.js';
import type {OffsetSliders} from '../pattern/pattern.js';
import type {UniformMap} from '../pattern/pattern_shaders.js';

/* Shader #define map; mirrors the (non-exported) DefineMap in pattern.ts. */
type DefineMap = Record<string, string | number | boolean | null | undefined>

/* A node in the MLGraph; concrete nodes are Pattern subclasses. */
export type MLGenerator = Pattern

/* Context object threaded through Pattern.setup(); only the active pattern is
 * needed by the ML graph code paths. */
interface SetupContext {
  pattern: MLGenerator
}

/* Pattern.setup() declares gl as non-optional AppGL, but the code-generation
 * path legitimately invokes it with no GL context (gl is unused there). This
 * view widens the gl parameter; method parameters are checked bivariantly, so
 * a Pattern is assignable to it. */
interface SetupCallable {
  setup(
    ctx: SetupContext,
    gl: AppGL | undefined,
    uniforms: UniformMap,
    defines: DefineMap
  ): void
}

/* Maps the x/y/scale slider indices into a generator's transform sliders. */
interface TransformOffsets {
  x: number
  y: number
  scale: number
}

/* During copy()/loadSTRUCT(), a SliderLink's src/dst transiently hold the
 * serialized numeric id of a param before being re-resolved to the live
 * SliderParam reference. This view type describes that dual nature; SliderLink
 * is assignable to it (an upcast), so the cast below is provably safe. */
interface SliderLinkIds {
  src: SliderParam | number | undefined
  dst: SliderParam | number | undefined
}

/* Resolve a transient serialized link endpoint (a numeric id, or already a
 * live SliderParam) into the SliderParam it refers to via the graph idMap.
 * Link endpoints always reference params, never generators. */
function resolveParam(
  idMap: Map<number, MLGenerator | SliderParam>,
  ref: SliderParam | number | undefined
): SliderParam | undefined {
  if (typeof ref !== 'number') {
    return ref
  }

  const found = idMap.get(ref)
  return found instanceof SliderParam ? found : undefined
}

/* Access the static patternDef() of a generator instance. gen.constructor is
 * typed as Function; every MLGenerator is a Pattern subclass, so this cast is
 * provably safe. */
function patternDefOf(gen: MLGenerator) {
  return (gen.constructor as typeof Pattern).patternDef()
}

export const MLGeneratorClasses: Array<typeof Pattern> = []

export class MLGraph {
  idgen: number
  generators: MLGenerator[]
  idMap: Map<number, MLGenerator | SliderParam>
  sortlist: MLGenerator[]
  flag: number
  _update_digest: InstanceType<typeof util.HashDigest>

  static STRUCT: string

  constructor() {
    this.idgen = 0;
    this.generators = [];
    this.idMap = new Map();
    this.sortlist = [];
    this.flag = MLGraphFlags.RESORT;
    this._update_digest = new util.HashDigest();
  }

  get length(): number {
    return this.generators.length;
  }

  static apiDefine(api: DataAPI) {
    let st = api.mapStruct(this, true);

    st.list<MLGenerator[], number, MLGenerator>("generators", "nodes", {
      getStruct(api, list, key) {
        let obj = key !== undefined ? list[key] : undefined;

        return !obj ? api.mapStruct(Pattern) : api.mapStruct(obj.constructor);
      },

      get(api, list, key) {
        return list[key];
      },

      getKey(api, list, obj) {
        return list.indexOf(obj);
      },

      getIter(api, list) {
        return list[Symbol.iterator]();
      },

      getLength(api, list) {
        return list.length;
      },
    });

    return st;
  }


  copy(): MLGraph {
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

          const link2ids = link2 as SliderLinkIds;
          link2ids.src = link1.src?.id;
          link2ids.dst = link1.dst?.id;

          param2.links.push(link2);
        }
      }
    }

    for (let gen of ml.generators) {
      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          const linkIds = link as SliderLinkIds
          link.src = resolveParam(ml.idMap, linkIds.src)
          link.dst = resolveParam(ml.idMap, linkIds.dst)
        }
      }
    }

    ml.pruneDuplicateLinks();

    return ml;
  }

  flagResort(): void {
    this.flag |= MLGraphFlags.RESORT;
  }

  move(gen: MLGenerator, offset: number): void {
    let i1 = this.generators.indexOf(gen);
    let i2 = i1 + offset;

    i2 = Math.min(Math.max(i2, 0), this.generators.length - 1);

    if (i1 > i2) {
      let tmp = i1;
      i1 = i2;
      i2 = tmp;
    }

    let gs = this.generators;
    i2 = Math.min(i2, gs.length - 1);

    while (i1 < i2) {
      let tmp = gs[i1];
      gs[i1] = gs[i1 + 1];
      gs[i1 + 1] = tmp;

      i1++;
    }

    this.flagResort();
  }

  insert(gen: MLGenerator, before = 0): this {
    this.add(gen);

    let generators = this.generators;

    if (generators.length === 1 || before < 0 || before >= this.generators.length) {
      return this;
    }

    let i = generators.length - 1;

    while (i > before) {
      generators[i] = generators[i - 1];
      i--;
    }

    generators[before] = gen;

    return this;
  }

  ensureDependParam(gen: MLGenerator): void {
    for (let param of gen.sliders.params) {
      if (param.name === "depend" && param.type === SliderTypes.DEPEND) {
        return;
      }
    }

    let param = new SliderParam("depend", SliderTypes.DEPEND);
    gen.sliders.push(param);
    gen.sliders.rebindProperties();
  }

  ensureFactorParam(gen: MLGenerator): void {
    if (!gen.sliders.has("_factor")) {
      gen.sliders.push(new SliderParam("_factor", SliderTypes.FLOAT, 0.5));
    }
    if (!gen.sliders.has("_blend_mode")) {
      gen.sliders.push(new SliderParam("_blend_mode", SliderTypes.ENUM, 0));
    }

    gen.sliders.get("_blend_mode")!.enumDef = SliderBlendModes;
    gen.sliders.get("_factor")!.range(-2, 2);
  }

  add(gen: MLGenerator): this {
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

  remove(gen: MLGenerator): void {
    if (gen.id === -1) {
      console.warn("Generator is not in graph!", gen);
      return;
    }

    this.flag |= MLGraphFlags.RESORT;
    this.generators.remove(gen);
    this.idMap.delete(gen.id);

    gen.id = -1;

    //to prevent reference leaks, forcibly clear sortlist
    this.sortlist.length = 0;

    for (let param of gen.sliders.params) {
      this.idMap.delete(param.id);
      param.id = -1;

      for (let link of param.links) {
        if (link.src === param) {
          if (link.dst instanceof SliderParam) {
            link.dst.links.remove(link);
          }
        } else if (link.src instanceof SliderParam) {
          link.src.links.remove(link);
        }
      }
    }
  }

  sort(): void {
    this.flag &= ~MLGraphFlags.RESORT;

    let sortlist = this.sortlist;
    this.sortlist.length = 0;

    let rec = (gen: MLGenerator) => {
      gen.flag |= MLFlags.VISIT;

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          let srcOwner = link.src instanceof SliderParam ? link.src.owner : undefined
          let dstOwner = link.dst instanceof SliderParam ? link.dst.owner : undefined
          if (dstOwner === gen && srcOwner && !(srcOwner.flag & MLFlags.VISIT)) {
            rec(srcOwner);
          }
        }
      }

      sortlist.push(gen);

      for (let param of gen.sliders.params) {
        for (let link of param.links) {
          let srcOwner = link.src instanceof SliderParam ? link.src.owner : undefined
          let dstOwner = link.dst instanceof SliderParam ? link.dst.owner : undefined
          if (srcOwner === gen && dstOwner && !(dstOwner.flag & MLFlags.VISIT)) {
            rec(dstOwner);
          }
        }
      }
    }

    let varbase = 0;

    for (let gen of this.generators) {
      gen.flag &= ~MLFlags.VISIT;
    }

    let roots: MLGenerator[] = [];

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

  getDefineKey(gen: MLGenerator, k: string): string {
    k = k.replace(/\$/g, "" + gen.id);

    return `${k}_${gen.id}`;
  }

  getUniformKey(gen: MLGenerator, param: SliderParam): string {
    return "p" + param.name + "_" + gen.id;
  }

  setupShader(
    ctx: SetupContext,
    gl: AppGL,
    uniforms: UniformMap,
    defines: DefineMap,
    transformSliders: ArrayLike<number>,
    transformOffsets: OffsetSliders | undefined
  ): void {
    for (let gen of this.sortlist) {
      let us: UniformMap = {};
      let ds: DefineMap = {};

      ;(gen as SetupCallable).setup(ctx, gl, us, ds);

      let id = "" + gen.id;

      for (let k in us) {
        let k2 = k.replace(/\$/g, "" + id);
        uniforms[k2] = us[k];
      }

      for (let k in ds) {
        let k2 = this.getDefineKey(gen, k.replace(/\$/g, "" + id));
        let v2 = ds[k];

        if (typeof v2 === "string") {
          v2 = v2.replace(/\bSLIDERS\b/g, "SLIDERS" + gen.id);
        }

        defines[k2] = v2;
      }
    }

    for (let gen of this.sortlist) {
      let k = 'SLIDERS' + gen.id;

      for (let i = 0; i < gen.sliders.length; i++) {
        uniforms[`${k}[${i}]`] = gen.sliders[i] ?? 0.0;
      }

      let param = gen.sliders.get("_factor");
      let pval = param?.value;
      if (param && typeof pval === "number") {
        uniforms[this.getUniformKey(gen, param)] = pval;
      }
    }

    const x = transformOffsets ? transformSliders[Number(transformOffsets.x)] : 0;
    const y = transformOffsets ? transformSliders[Number(transformOffsets.y)] : 0;
    const scale = transformOffsets ? transformSliders[Number(transformOffsets.scale)] : 1;

    //add transform
    for (let gen of this.sortlist) {
      let transform2 = patternDefOf(gen).offsetSliders;
      if (!transform2) {
        continue;
      }

      let tx = Number(transform2.x);
      let ty = Number(transform2.y);
      let tscale = Number(transform2.scale);
      let k = "SLIDERS" + gen.id;

      let x2 = gen.sliders[tx]/scale + x;
      let y2 = gen.sliders[ty]/scale + y;
      let scale2 = gen.sliders[tscale]*scale;

      uniforms[`${k}[${tx}]`] = x2;
      uniforms[`${k}[${ty}]`] = y2;
      uniforms[`${k}[${tscale}]`] = scale2;
    }

    if (Math.random() > 0.9) {
      //console.error("UNIFORMS", uniforms);
      //console.error("DEFINES", defines);
    }
  }

  /** generate fragment shader code, node this
   *  fits into the pattern shader system
   */
  generate(ctx?: SetupContext): string {
    if (this.flag & MLGraphFlags.RESORT) {
      this.sort();
    }

    let s = '';
    let getName = (gen: MLGenerator) => `layer${gen.id}`;
    let colorvars: Record<number, Record<string, string>> = {};

    for (let gen of this.sortlist) {
      let factor = gen.sliders.get("_factor");
      if (!factor) {
        continue;
      }

      s += `
uniform float SLIDERS${gen.id}[${gen.sliders.length}];
uniform float ${this.getUniformKey(gen, factor)};
`;

    }

    let COLOR_VARS = new Set([
      "VALUE_OFFSET",
      "GAIN",
      "BRIGHTNESS",
      "COLOR_SCALE",
      "COLOR_SHIFT"
    ]);

    let doColorVar = (gen: MLGenerator, k: string, v: string) => {
      if (v.startsWith("SLIDERS[")) {
        v = v.replace(/SLIDERS/, "SLIDERS" + gen.id);
      }

      colorvars[gen.id][k] = v;
    }

    for (let gen of this.sortlist) {
      colorvars[gen.id] = {};

      let code = gen.getFragmentCode();
      let name = getName(gen);

      let defines: DefineMap = {};
      let uniforms: UniformMap = {};
      let setupCtx: SetupContext = {pattern: gen};

      ;(gen as SetupCallable).setup(setupCtx, undefined, uniforms, defines);
      console.log("VARS", patternDefOf(gen).typeName, uniforms, defines);

      for (let k in defines) {
        if (COLOR_VARS.has(k)) {
          doColorVar(gen, k, "" + defines[k]);
        }

        let k2 = this.getDefineKey(gen, k);
        let re = new RegExp("\\b" + k + "\\b", "g");

        code = code.replaceAll(re, k2);
      }

      for (let k in uniforms) {
        if (COLOR_VARS.has(k)) {
          doColorVar(gen, k, "" + uniforms[k]);
        }

        let k2 = k.replace(/\$/g, "" + gen.id);

        code = code.replaceAll(k, k2);
      }

      code = code.replace(/\$/g, "g" + gen.id);
      code = code.replace(/\bpattern\b/g, name).trim();
      code = code.replace(/\bSLIDERS\b/g, "SLIDERS" + gen.id);

      s += "\n" + `
/*---------------${patternDefOf(gen).typeName + ":" + name}--------------*/
${code}
      `.trim() + "\n";
    }

    let mixes: Record<number, (a: string, b: string) => string> = {
      [SliderBlendModes.ADD]: (a, b) => `(${a}) + (${b})`,
      [SliderBlendModes.SUB]: (a, b) => `(${a}) - (${b})`,
      [SliderBlendModes.MUL]: (a, b) => `(${a}) * (${b})`,
      [SliderBlendModes.DIV]: (a, b) => `(${a}) / (${b})`,
      [SliderBlendModes.MIX]: (a, b) => `(${b})`,
    }
    let getMix = (a: string, b: string, mode: number) => {
      return `${mixes[mode](a, b)}`
    };

    let code = '  float f, f2, totw;\n\n';
    let first = true;

    let safeFloat = (f: number | string) => {
      f = "" + f;
      if (f.search(/\./) < 0) {
        return f + ".0";
      }

      return f;
    }

    for (let gen of this.sortlist) {
      let cvars = colorvars[gen.id];

      console.log(gen.constructor.name, cvars);

      //let B = cvars.BRIGHTNESS ?? 1.0;
      //let C = cvars.COLOR_SHIFT ?? 1.0;
      let S = cvars.COLOR_SCALE ?? safeFloat(1.0);
      let G = cvars.GAIN ?? safeFloat(1.0);
      let V = cvars.VALUE_OFFSET ?? safeFloat(0.0);


      code += `  /* ${patternDefOf(gen).typeName + ":" + gen.id} */\n`;
      code += `  f2 = ${getName(gen)}(ix, iy);\n`;
      code += `  f2 = pow(abs(f2+${V}), ${G})*${S};`;

      //let w = gen.sliders._factor;
      let factor = gen.sliders.get("_factor");
      if (!factor) {
        continue;
      }
      let w = this.getUniformKey(gen, factor);
      let mode = ~~(gen.sliders.get("_blend_mode")?.value as number);

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

  genShaderKey(digest: InstanceType<typeof util.HashDigest> = this._update_digest): number {
    for (let gen of this.generators) {
      digest.add(gen.typeName);

      for (let param of gen.sliders.params) {
        digest.add(param.links.length);
      }

      if (gen.shader) {
        digest.add(gen.shader.fragmentSource?.length ?? 0);
      }
    }

    return digest.get();
  }

  genUpdateKey(digest: InstanceType<typeof util.HashDigest> = this._update_digest.reset()): number {
    this.genShaderKey(digest);

    for (let gen of this.generators) {
      for (let v of Object.values(gen)) {
        if (typeof v === "number" || typeof v === "boolean") {
          digest.add(v);
        }
      }

      for (let param of gen.sliders.params) {
        if (param.noReset) {
          //respecting noReset doesn't really make any sense
          //when composing patterns.
          //continue;
        }

        let v = param.value;

        if (typeof v === "number") {
          digest.add(v);
        } else if (typeof v === "object" && Array.isArray(v)) {
          for (let num of v) {
            digest.add(num);
          }
        }
      }
    }

    return digest.get();
  }

  pruneDuplicateLinks(): void {
    let linkMap = new Map<string, SliderLink>();

    for (let gen of this.generators) {
      for (let param of gen.sliders.params) {
        for (let i = 0; i < param.links.length; i++) {
          let link = param.links[i];

          let src = link.src instanceof SliderParam ? link.src : undefined
          let dst = link.dst instanceof SliderParam ? link.dst : undefined

          let key = "" + src?.name + ":" + src?.owner?.id + ":";
          key += dst?.name + ":" + dst?.owner?.id;

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

  loadSTRUCT(reader: nstructjs.StructReader<this>): void {
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
        let links2: SliderLink[] = [];

        //console.warn(param, gen);

        for (let link of param.links) {
          const linkIds = link as SliderLinkIds
          link.src = resolveParam(this.idMap, linkIds.src)
          link.dst = resolveParam(this.idMap, linkIds.dst)

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
