// Values stored on AST node fields. The shaderfrog parser produces deeply
// dynamic, mutable nodes (keyed by arbitrary strings), so we model a node as a
// recursive record whose values are nodes, arrays of nodes, primitives, or the
// helper functions this module attaches at runtime.
type ASTValue =
  | ASTNode
  | ASTNode[]
  | string
  | number
  | boolean
  | undefined
  | ((...args: ASTNode[]) => unknown)

interface ASTNode {
  type: string
  _id?: number
  parent?: ASTNode
  identifier?: ASTNode | string
  literal?: string
  token?: string
  value?: number | string
  name?: ASTNode | string
  specifier?: ASTNode
  specified_type?: ASTNode
  selection?: ASTNode
  expr?: ASTNode
  postfix?: ASTNode
  left?: ASTNode
  right?: ASTNode
  operator?: ASTNode
  body?: ASTNode
  declarations?: ASTNode[]
  declaration?: ASTNode
  args?: ASTNode[]
  program?: ASTNode[]
  replace?: (a: ASTNode, b: ASTNode) => void
  has?: (a: ASTNode) => boolean
  // The parser represents function declarations with a `prototype` field
  // holding a header (return type + name) and a parameter list.
  prototype?: FunctionProto
  // Catch-all for the dynamic property access this module performs.
  [key: string]: ASTValue | FunctionProto
}

interface FunctionProto {
  header?: {returnType?: ASTNode; name?: ASTNode | string}
  parameters?: ASTNode[]
}

// The shaderfrog module's own AST/Generator types are far stricter than the
// mutable, dynamically-keyed node model this module manipulates, so `parse`
// returns and `generate` accepts our loose ASTNode view. The two members are
// declared with their widest compatible signatures so the imported module is
// structurally assignable to this interface.
interface GLSLParserModule {
  parser: {parse(code: string): ASTNode}
  generate(node: ASTNode): string
}

// Values that can be bound in a Scope: an AST node, a resolved function, or a
// resolved GLSL type name / constant.
type ScopeValue = ASTNode | Func | string | number | boolean

// Shape of the SyntaxError the shaderfrog parser throws on bad input.
interface ParseError {
  message: string
  location: {start: {line: number}; end: {line: number}}
}

// The "scope" payload threaded through traversal is generic: scopedTraverse
// uses a Scope, while printAST uses a numeric indentation level.
type VisitFn<S> = (scope: S, child?: ASTNode) => void
type TraverseHandler<S> = (this: Handlers<S>, node: ASTNode, scope: S, visit: VisitFn<S>) => void
type Handlers<S> = {[type: string]: TraverseHandler<S>} & {default?: TraverseHandler<S>}

export var hasAutoDiff = false;
export var parser: GLSLParserModule | undefined = undefined;
export var promise: Promise<GLSLParserModule> | undefined = undefined;


let colormap: {[name: string]: number} = {
  "black"   : 30,
  "red"     : 31,
  "green"   : 32,
  "yellow"  : 33,
  "blue"    : 34,
  "magenta" : 35,
  "cyan"    : 36,
  "teal"    : 36,
  "white"   : 37,
  "reset"   : 0,
  "grey"    : 2,
  "gray"    : 2,
  "orange"  : 202,
  "pink"    : 198,
  "brown"   : 314,
  "lightred": 91,
  "peach"   : 210
}

export let termColorMap: {[key: string]: string | number} = {};
for (let k in colormap) {
  termColorMap[k] = colormap[k];
  termColorMap[colormap[k]] = k;
}

export function termColor(s: string | symbol, c: string | number): string {
  if (typeof s === "symbol") {
    s = s.toString();
  } else {
    s = "" + s;
  }

  if (typeof c === "string" && c in colormap)
    c = colormap[c]

  if (typeof c === "number" && c > 107) {
    let s2 = '\u001b[38;5;' + c + "m"
    return s2 + s + '\u001b[0m'
  }

  return '\u001b[' + c + 'm' + s + '\u001b[0m'
};

// The shaderfrog module's own AST/Generator types are far stricter than the
// mutable, dynamically-keyed node model this file uses, so the imported module
// is not directly assignable to GLSLParserModule. This runtime guard checks for
// the two members we use and narrows the (otherwise opaque) import to our view
// without constructing a new object, so the runtime value is unchanged.
function isParserModule(mod: unknown): mod is GLSLParserModule {
  if (typeof mod !== "object" || mod === null) {
    return false
  }
  const m = mod as {parser?: {parse?: unknown}; generate?: unknown}
  return typeof m.parser?.parse === "function" && typeof m.generate === "function"
}

promise = new Promise<GLSLParserModule>((accept, reject) => {
  import('../extern/shaderfrog/glsl-parser/dist/index.js').then(mod => {
    globalThis._glslMod = mod;

    if (!isParserModule(mod)) {
      reject(new Error("glsl-parser module shape unexpected"))
      return
    }

    parser = mod;
    hasAutoDiff = true;

    accept(mod);
    promise = undefined;
  });
});

function traverse<S>(
  ast: ASTNode,
  handlers: Handlers<S>,
  scope: S,
  onArrayPre: ((node: ASTNode, scope: S, k: string) => S) | undefined = undefined
): void {
  function rec(node: ASTNode, scope: S): void {
    if (!node.type) {
      console.error("Unknown node", node);
      return;
    }

    function isNode(v: unknown): v is ASTNode {
      return (
        typeof v === "object" &&
        v !== null &&
        !Array.isArray(v) &&
        typeof (v as {type?: unknown}).type === "string" &&
        (v as {type: string}).type.length > 0
      );
    }

    function visit(scope: S, child: ASTNode = node): void {
      //console.warn("visit!", node);

      let keys = Object.keys(child).filter(f => f !== "parent" && f !== "replace" && f !== "has" && f !== "toString");

      for (let k of keys) {
        if (k === "parent") {
          continue;
        }

        let v = child[k];

        //console.log("  ", k, v);

        if (typeof v === "object" && Array.isArray(v)) {
          if (onArrayPre) {
            scope = onArrayPre(node, scope, k);
          }

          for (let item of v) {
            if (isNode(item)) {
              rec(item, scope);
            }
          }
        } else if (isNode(v)) {
          rec(v, scope);
        }
      }
    }

    if (!(node.type in handlers)) {
      //console.warn("Node not in handlers:", node.type, node);

      if (handlers.default) {
        handlers.default(node, scope, visit);
      } else {
        visit(scope);
      }
    } else {
      handlers[node.type](node, scope, visit);
    }
  }

  if (ast.program && Array.isArray(ast.program)) {
    for (let st of ast.program) {
      rec(st, scope);
    }
  } else {
    rec(ast, scope);
  }
}

function evalIDLit(node: ASTValue): string | number | undefined {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return undefined
  }

  if (node.type === "identifier") {
    return typeof node.identifier === "string" ? node.identifier : evalIDLit(node.identifier)
  } else if (node.type === "literal") {
    return node.literal;
  } else if (node.type === "keyword") {
    return node.token;
  } else if (node.type === "float_constant" || node.type === "int_constant") {
    return node.value;
  } else if (node.type === "bool_constant") {
    return node.value;
  } else if (node.type === "type_specifier") {
    return evalIDLit(node.specifier);
  } else if (node.type === "fully_specified_type") {
    return evalIDLit(node.specifier);
  }
}

function evalType(
  nodeArg: ASTValue | Func,
  scope: Scope = new Scope()
): string | number | undefined {
  let node: ASTValue | Func

  if (typeof nodeArg === "string") {
    node = {
      type      : "identifier",
      identifier: nodeArg,
    }
  } else if (typeof nodeArg !== "object" || nodeArg === null) {
    return typeof nodeArg === "number" ? nodeArg : undefined
  } else {
    node = nodeArg
  }

  // A Func or array carries no resolvable GLSL type name on its own.
  if (node instanceof Func || Array.isArray(node)) {
    return undefined
  }

  if (node.type === "function_call") {
    let name = evalIDLit(node.identifier);

    let func = new Func();
    func.name = name;

    let namebase = 0;

    for (let arg of node.args ?? []) {
      if (arg.type === "literal") {
        continue;
      }

      let k = "param" + (namebase++);

      func.paramMap[k] = evalType(arg, scope);
      console.log("ARG", arg.type, func.paramMap[k]);
    }

    func.genKey()
    if (func.key in scope.funcs) {
      func = scope.funcs[func.key];
    }

    console.log("Function call!", func.key, Object.keys(scope.funcs), evalType(func.rtype));

    return evalType(func.rtype);
  } else if (node.type === "postfix") {
    scope = scope.clone();
    if (node.expr) {
      scope.set("$this", node.expr);
    }

    if (node.postfix && node.postfix.type === "quantifier") {
      //[]
      let id = evalIDLit(node.expr)
      let type: ASTValue | Func = id !== undefined ? scope.scope[id] : undefined;
      let resolved: string | number | undefined
      if (type) {
        resolved = evalType(type);
      }

      if (resolved && resolved in VectorSizes) {
        resolved = "float";
      }

      return resolved;
    } else {
      return evalType(node.postfix, scope);
    }
  } else if (node.type === "identifier") {
    let id = evalIDLit(node);

    if (id !== undefined && id in scope.scope) {
      return evalType(scope.scope[id], scope);
    }
  } else if (node.type === "binary") {
    return evalType(node.right, scope);
  } else if (node.type === "field_selection") {
    let pvar: ASTValue | Func = scope.scope["$this"];

    if (pvar && typeof pvar === "object" && !(pvar instanceof Func) && !Array.isArray(pvar) && pvar.type === 'identifier') {
      let id = evalIDLit(pvar);
      console.log("ID", id);

      pvar = id !== undefined ? scope.scope[id] : undefined;

      console.log("PVAR", pvar, Object.keys(scope.scope));

      let type = evalType(pvar, scope);
      if (type !== undefined && type in VectorSizes) {
        let id2 = evalIDLit(node.selection);

        console.log("TYPE0", id2);

        let len = typeof id2 === "string" ? id2.length : 0
        type = len === 1 ? "float" : VectorTypes[len];
      }

      console.log(id, "TYPE", type);
      //process.exit();
      return type;
    }

    return pvar ? evalType(pvar, scope) : undefined;
  } else if (node.type === "float_constant") {
    return "float";
  } else if (node.type === "int_constant") {
    return "int";
  } else if (node.type === "bool_constant") {
    return "bool";
  }

  return evalIDLit(node);
}

class Func {
  ast: ASTNode | undefined
  parameters: ASTNode[]
  paramMap: {[key: string]: ASTValue}
  isBuiltin: boolean
  key: string
  name: string | number | undefined
  rtype: ASTNode | undefined

  constructor(node?: ASTNode, scope?: Scope) {
    this.ast = undefined;
    this.parameters = [];
    this.paramMap = {};
    this.isBuiltin = false;
    this.key = '';
    this.name = '';
    this.rtype = undefined;

    if (node) {
      this.load(node, scope);
    }
  }

  load(node: ASTNode, scope?: Scope): void {
    this.ast = node;
    this.parameters = [];
    this.paramMap = {};
    this.key = '';

    let h = node.prototype?.header;
    this.rtype = h?.returnType;

    this.name = evalType(h?.name, scope);

    if (!node.prototype?.parameters) {
      this.genKey();
      return;
    }

    for (let param of node.prototype.parameters) {
      if (param.type === "literal") {
        continue;
      }

      let decl = param.declaration
      let k = evalType(decl?.identifier, scope);

      if (k !== undefined) {
        this.paramMap[k] = decl?.specifier;
      }
      this.parameters.push(param);
    }

    this.genKey();
  }

  genKey(): void {
    //glsl doesn't allow overloading return types
    //this.key = "__" + evalType(this.rtype) + "_";

    this.key += `__${this.name}`

    for (let k in this.paramMap) {
      let type = this.paramMap[k];
      this.key += "_" + evalType(type);
    }
  }
}

export function printAST(ast: ASTNode): string {
  let str = '';
  let t = 0;

  function tab(n: number, tabchar = '-'): string {
    let tab = '';

    for (let i = 0; i < n; i++) {
      tab += tabchar;
    }

    return tab;
  }

  function out(s: string): void {
    str += s;
  }

  function varout(k: string, v: ASTValue): void {
    if (typeof v === "object" || typeof v === "function") {
      return;
    }

    out(` ${termColor(k, 'blue')}=${termColor(`"${"" + v}"`, "teal")}`);
  }

  const handlers: Handlers<number> = {
    literal(node, tlvl, visit) {
      let ok = node.parent?.type === "binary" || node.parent?.type === "unary";

      ok = true;
      if (ok) {
        this.default?.(node, tlvl, visit);
      }

      //do nothing
    },

    default(node, tlvl, visit) {
      let indent = tab(tlvl);

      let prefix = '';

      if (node.parent) {
        for (let k in node.parent) {
          if (node.parent[k] === node) {
            k += ":" + node._id;

            prefix = termColor(k, 'orange') + ": ";
          }
        }
      }

      out(indent + prefix + termColor(node.type, 'green'));

      if (node.type === 'literal') {
        varout("literal", node.literal);
      }

      if ("identifier" in node && typeof node.identifier === "string") {
        varout("ident", node.identifier);
      }

      if (node.type === "type_specifier") {
        varout("specifier", node.specifier);
      }

      if (node.type === "keyword") {
        varout("token", node.token);
      }

      out(" {\n");

      if (node.type === "binary") {
        //console.log(node);
      }

      visit(tlvl + 1);
      out(indent + "}\n");
    }
  }

  traverse(ast, handlers, 0, function (node, tlvl, name) {
    out(tab(tlvl) + name + "[] {\n");
    return tlvl + 1;
  });

  return str;
}

function nodeToString(this: ASTNode): string {
  let name = this.type + ":" + this._id;

  if (this.type === "function") {
    name += ":" + evalIDLit(this.name);
  } else if (this.type === "function_call") {
    name += ":" + evalIDLit(this.identifier)
  }

  return name;
}

function nodeReplace(this: ASTNode, a: ASTNode, b: ASTNode): void {
  for (let k in this) {
    if (this[k] === a) {
      this[k] = b;
      return;
    }

    let v = this[k];
    if (typeof v === "object" && v && Array.isArray(v)) {
      let i = v.indexOf(a);

      if (i >= 0) {
        v[i] = b;
        return;
      }
    }
  }

  console.error("Item not in node: " + a.type + ":" + a._id + ", replacement: " + b.type + ":" + b._id);
  throw new Error("item not in node");
}

function nodeHas(this: ASTNode, a: ASTNode): boolean {
  for (let k in this) {
    if (this[k] === a) {
      return true;
    }
  }

  return false;
}

export class ASTState {
  ast: ASTNode
  idgen: number
  // Keyed by node id; the legacy `get(node)` identity probe (which never hits)
  // means the key type must also admit a node object.
  idMap: Map<number | ASTNode, ASTNode>
  rootScope: Scope

  constructor(ast: ASTNode) {
    this.ast = ast;
    this.idgen = 0;
    this.idMap = new Map();

    this.rootScope = new Scope();
    this.rootScope.makeBuiltinFuncs(this);
  }

  new(type: string, args: {[key: string]: ASTNode | string | ASTNode[]} = {}): ASTNode {
    let node: ASTNode = {
      type
    };

    for (let k in args) {
      node[k] = args[k];
    }

    this.check(node, undefined, false);

    return node;
  }

  add(node: ASTNode, parent?: ASTNode, recurse = true): void {
    if (parent) {
      node.parent = parent;
    }

    node.replace = nodeReplace;
    node.has = nodeHas;
    node.toString = nodeToString;

    let bad = node._id === undefined;
    bad = bad || ("_id" in node && this.idMap.get(node) !== node);

    if (bad) {
      node._id = this.idgen++;
    }

    this.idMap.set(node._id!, node);

    if (recurse) {
      prepareAST(node, this);
    }
  }

  check(node: ASTNode, parent?: ASTNode, traverse = true): void {
    return this.add(node, parent, traverse);
  }
}

export function prepareAST(ast: ASTNode, astState: ASTState = new ASTState(ast)): ASTState {
  let idmap = new Map();
  let idgen = 0;

  const handlers: Handlers<ASTNode | undefined> = {
    default(node, parent, visit) {
      astState.add(node, parent, false);
      visit(node);
    },
    float_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = parseFloat(node.token ?? "");
    },
    int_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = parseInt(node.token ?? "")
    },
    bool_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = node.token;
    }
  }

  traverse(ast, handlers, undefined);

  return astState;
}

export const VectorSizes: {[type: string]: number} = {
  vec2: 2,
  vec3: 3,
  vec4: 4
};

export const VectorTypes: {[size: number]: string} = {
  2: "vec2",
  3: "vec3",
  4: "vec4"
};

const axes: {[axis: string]: number} = {
  x: 0,
  y: 1,
  z: 2,
  w: 3,
  r: 0,
  g: 1,
  b: 2,
  u: 0,
  v: 1,
  s: 0,
  t: 1
};

export function substNode(node: ASTNode, key: string, val: string): ASTNode {
  for (let k in node) {
    if (k === 'parent') {
      continue;
    }

    let v = node[k];

    if (v === key) {
      node[k] = val;
    } else if (Array.isArray(v)) {
      for (let item of v) {
        substNode(item, key, val);
      }
    } else if (typeof v === "object" && v !== null) {
      substNode(v as ASTNode, key, val);
    }
  }

  return node;
}

let VecSnippets: {[vec: string]: string[]} = {
  vec2   : [
    "vec2 VEC() {}",
    "vec2 VEC(float a, float b) {}",
    "vec2 VEC(vec2 v) {}",
  ], vec3: [
    "vec3 VEC(float a, float b, float c) {}",
    "vec3 VEC(vec2 a, float c) {}",
    "vec3 VEC(float a, vec2 b) {}",
    "vec3 VEC(vec4 a) {}"
  ], vec4: [
    "vec4 VEC(float a, float b, float c, float d) {}",
    "vec4 VEC(vec2 a, float c, float d) {}",
    "vec4 VEC(float a, vec2 b, float d) {}",
    "vec4 VEC(float a, float b, vec2 c) {}",
    "vec4 VEC(vec2 a, vec2 b) {}",

    "vec4 VEC(vec3 a, float b) {}",
    "vec4 VEC(float a, vec3 b) {}",
    "vec4 VEC(vec4 a) {}"
  ]
};

export class Scope {
  parent: Scope | undefined
  scope: {[key: string]: ScopeValue}
  stack: ASTNode[] | undefined
  funcs: {[key: string]: Func}

  constructor(stack?: ASTNode[]) {
    this.parent = undefined;
    this.scope = {};
    this.stack = stack;
    this.funcs = {};
  }

  makeBuiltinFuncs(astState: ASTState): void {
    function trim(code: string): string {
      code = code.trim();
      if (code.endsWith(",")) {
        code = code.slice(0, code.length - 1);
      }
      return code.trim();
    }

    if (!parser) {
      return
    }

    for (let vec in VecSnippets) {
      for (let code of VecSnippets[vec]) {

        let ast = parser.parser.parse(code);
        astState.add(ast);

        //console.log(printAST(ast));
        if (ast.type !== "function" && ast.program) {
          ast = ast.program[0]
        }

        ast = substNode(ast, "VEC", vec);

        let func = new Func(ast, this);
        func.isBuiltin = true;

        this.funcs[func.key] = func;
        this.scope[func.key] = func;
      }
    }
  }

  clone(): Scope {
    let ret = new Scope(this.stack);

    ret.scope = Object.assign({}, this.scope);
    ret.parent = this;
    ret.funcs = Object.assign({}, this.funcs);

    return ret;
  }

  set(k: string, v: ScopeValue): void {
    console.log(termColor("set", "orange"), k);

    this.scope[k] = v;
  }
}

export function scopedTraverse(ast: ASTNode, handlers: Handlers<Scope>, scope: Scope = new Scope()): void {
  function forward(node: ASTNode, scope: Scope, visit: VisitFn<Scope>): void {
    if (node.type in handlers) {
      handlers[node.type](node, scope, visit);
    } else {
      visit(scope);
    }
  }

  const localHandlers: Handlers<Scope> = {
    declarator_list(node, scope, visit) {
      let type = evalType(node.specified_type, scope);

      if (!type) {
        console.log("=======", node.specified_type);
        if (node.specified_type) {
          printAST(node.specified_type);
        }
        console.error("Could2 not resolve type for ", node.specified_type);
        process.exit();
      }

      for (let decl of node.declarations ?? []) {
        let id = evalIDLit(decl.identifier);
        if (id !== undefined) {
          scope.set(String(id), type);
        }

        forward(decl, scope, visit);
      }
    },

    declaration(node, scope, visit) {
      if (node.parent && node.parent.type === "declarator_list") {
        return;
      }

      let id = evalIDLit(node.identifier);
      let type = evalType(node, scope);

      if (!type) {
        console.log("=======", node);
        printAST(node);
        console.error("Could not resolve type for ", id);
        process.exit();
      }

      if (id !== undefined) {
        scope.set(String(id), type);
      }

      forward(node, scope, visit);
    },
    postfix(node, scope, visit) {
      scope = scope.clone();
      if (node.expr) {
        scope.set('$this', node.expr);
      }

      forward(node, scope, visit);
    },
    function(node, scope, visit) {
      let func = new Func(node);
      scope.set(func.key, func);
      scope.funcs[func.key] = func;

      let scope2 = scope.clone();

      for (let k in func.paramMap) {
        let type = func.paramMap[k];
        if (type !== undefined && !Array.isArray(type) && typeof type !== "function") {
          scope2.set(k, type);
        }
      }

      if (node.body) {
        forward(node.body, scope2, function (scope, child = node.body) {
          visit(scope, child);
        });
      }
    },
    default(node, scope, visit) {
      forward(node, scope, visit);
    }
  }

  traverse(ast, localHandlers, scope);
}

export function cloneNode(node: ASTNode): ASTNode {
  let ret: ASTNode = {type: node.type};

  for (let k in node) {
    if (k === "parent") {
      continue;
    }

    let v = node[k];
    let out: ASTValue | FunctionProto = v;

    if (typeof v === "object" && v !== null) {
      if (Array.isArray(v)) {
        let arr: ASTNode[] = [];

        for (let item of v) {
          arr.push(cloneNode(item));
        }

        out = arr;
      } else {
        out = cloneNode(v as ASTNode);
      }
    }

    ret[k] = out;
  }

  return ret;
}

export function transformSwizzles(ast: ASTNode, astState: ASTState): void {
  const handlers: Handlers<Scope> = {
    postfix(node, scope, visit) {
      visit(scope);
    },
    function_call(node, scope, visit) {
      //console.log(node);
      visit(scope);
    },
    field_selection(node, scope, visit) {
      let id = evalType(node.selection, scope);

      if (typeof id !== "string" || id.length === 1) {
        return; //no swizzle
      }

      let v: ScopeValue | undefined = scope.scope.$this;
      let vname: ScopeValue | undefined = v;
      let isRef = false;

      if (v && typeof v === "object" && !(v instanceof Func) && v.type === "identifier") {
        vname = typeof v.identifier === "string" ? v.identifier : undefined;
        v = typeof vname === "string" ? scope.scope[vname] : undefined;

        isRef = true;
      } else {
        //console.log(v);
        //process.exit()
      }

      let type = evalType(v, scope);
      if (typeof type !== "string" || !(type in VectorSizes)) {
        //console.error("V", v, evalType(v, scope));
        if (v && typeof v === "object" && !(v instanceof Func)) {
          console.log("------>", printAST(v));
        }
        //console.warn(v.identifier);
        console.error("Unknown type for ", String(v));
        process.exit(-1);

        return;
      }

      let size = VectorSizes[type];
      let params = new Array(size);

      for (let i = 0; i < id.length; i++) {
        let j = axes[id[i]];
        params[j] = i;
      }
      for (let i = 0; i < size; i++) {
        if (params[i] === undefined) {
          params[i] = i;
        }
      }

      let pvar_base: ASTNode;
      if (isRef) {
        pvar_base = {
          type      : "identifier",
          identifier: typeof vname === "string" ? vname : undefined
        };
      } else {
        pvar_base = v && typeof v === "object" && !(v instanceof Func) ? v : {type: "identifier"};
      }

      let args: ASTNode[] = [];

      for (let i = 0; i < size; i++) {
        if (i > 0) {
          args.push({
            type   : "literal",
            literal: ","
          });
        }

        let sel = ("xyzw")[params[i]];

        if (sel === undefined) {
          throw new Error("sel was corrupted");
        }

        let pvar: ASTNode = {
          type   : "postfix",
          expr   : cloneNode(pvar_base),
          postfix: {
            type     : "field_selection",
            dot      : {
              type   : "literal",
              literal: "."
            },
            selection: {
              type      : "identifier",
              identifier: sel
            }
          }
        }

        args.push(pvar);
      }

      let node2: ASTNode = {
        type      : "function_call",
        lp        : '(',
        rp        : ')',
        identifier: {
          type     : "type_specifier",
          specifier: {
            type : "keyword",
            token: type
          },
        },
        args
      }

      console.log("============id===>", id, evalType(v, scope), node2);
      if (parser) {
        console.log("code:", parser.generate(node2));
      }

      console.log(node.parent?.type);

      let parent = node.parent?.parent;
      astState.check(node2, parent);

      if (node.parent && parent) {
        parent.replace?.(node.parent, node2);

        //node.type = undefined;

        if (parser) {
          console.log(parser.generate(parent));
        }
      }
    },
  }

  scopedTraverse(ast, handlers, astState.rootScope);

  //process.exit();
}

export function transformVectors(ast: ASTNode, astState: ASTState): ASTNode {
  let binops: {[op: string]: (a: number, b: number) => number | boolean} = {
    "+" : (a, b) => a + b,
    "-" : (a, b) => a - b,
    "*" : (a, b) => a*b,
    "/" : (a, b) => a/b,
    "**": (a, b) => a**b,
    "&&": (a, b) => Boolean(a && b),
    "||": (a, b) => Boolean(a || b),
    "&" : (a, b) => a & b,
    "|" : (a, b) => a | b,
    "^" : (a, b) => a ^ b,
    "!=": (a, b) => a !== b,
    "==": (a, b) => a === b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    ">" : (a, b) => a > b,
    "<" : (a, b) => a < b,
  };


  transformSwizzles(ast, astState);

  let stack: ASTNode[] = [];
  let scope = astState.rootScope;
  scope.stack = stack;

  const namemap: {[op: string]: string} = {
    "*": "mul",
    "/": "div",
    "+": "add",
    "-": "sub",
  };

  const handlers: Handlers<Scope> = {
    postfix(node, scope, visit) {
      visit(scope);
    },
    field_selection(node, scope, visit) {
      visit(scope);
    },
    binary(node, scope, visit) {
      visit(scope);

      let type = evalType(node.left, scope);
      let type2 = evalType(node.right, scope);

      if (typeof type !== "string" || !(type in VectorSizes)) {
        return;
      }

      let op = evalIDLit(node.operator);
      console.log(Object.keys(scope.scope));

      console.log("Type:", type, op, "Type2:", type2, node.right);

      if (op !== undefined && op in namemap) {

      } else {
        throw new Error("unknown op " + op);
      }

      let key = `__v2${namemap[op]}_${type}_${type2}`;

      //console.log(Object.keys(scope.scope));
      console.log("KEY", key);

      let fcallArgs: ASTNode[] = []
      if (node.left) {
        fcallArgs.push(node.left)
      }
      fcallArgs.push(astState.new("literal", {literal: ","}))
      if (node.right) {
        fcallArgs.push(node.right)
      }

      let fcall = astState.new("function_call", {
        identifier: astState.new("identifier", {
          identifier: type + namemap[op]
        }),
        lp        : astState.new("literal", {literal: "("}),
        args      : fcallArgs,
        rp        : astState.new("literal", {literal: ")"}),
      });

      astState.check(fcall);

      node.parent?.replace?.(node, fcall);

      if (parser) {
        console.log(parser.generate(fcall))
      }
    }
  }

  scopedTraverse(ast, handlers, scope);

  return ast;
}

function make_builtin_code(): string {
  let s = '';

  for (let i = 2; i <= 4; i++) {
    let vec = 'vec' + i;

    let dot_code = '';
    for (let j = 0; j < i; j++) {
      if (j > 0) {
        dot_code += "+";
      }
      dot_code += `a[${j}]*b[${j}]`;
    }

    s += `
float dot(vec a, vec b) {
  return ${dot_code};
}

float length(vec a) {
  return sqrt(dot(a, a));
}

vec normalize(vec a) {
  float l = length(a);
  
  return l > 0.0 ? a / l : a; 
}

    `.replace(/\bvec\b/g, vec);
  }

  let opmap: {[op: string]: string} = {
    '*': 'mul',
    '/': 'div',
    '+': 'add',
    '-': 'sub'
  };

  for (let i = 2; i <= 4; i++) {
    let vec = 'vec' + i;
    for (let op in opmap) {
      let name = `vec${i}${opmap[op]}`;

      s += `${vec} ${name}(${vec} a, ${vec} b) {\n`;
      s += `  return ${vec}(\n`;
      for (let j = 0; j < i; j++) {
        s += `    a[${j}] ${op} b[${j}]`;
        if (j < i - 1) {
          s += ',';
        }
        s += '\n';
      }
      s += "  );\n}\n"

      s += `${vec} ${name}(float a, ${vec} b) {\n`;
      s += `  return ${vec}(\n`;
      for (let j = 0; j < i; j++) {
        s += `    a ${op} b[${j}]`;
        if (j < i - 1) {
          s += ',';
        }
        s += '\n';
      }
      s += "  );\n}\n"

      s += `${vec} ${name}(${vec} a, float b) {\n`;
      s += `  return ${vec}(\n`;
      for (let j = 0; j < i; j++) {
        s += `    a[${j}] ${op} b`;
        if (j < i - 1) {
          s += ',';
        }
        s += '\n';
      }
      s += "  );\n}\n"
    }
  }

  //console.warn(s);
  return s;
}

export const BuiltinCode = make_builtin_code();

export class AutoDiff {
  source: string
  lines: string[]
  ast: ASTNode | undefined
  funcs: {[key: string]: Func}
  bad: boolean

  constructor(source: string) {
    source = BuiltinCode + "\n" + source;

    this.source = source;
    this.lines = source.split("\n");
    this.ast = undefined;

    this.funcs = {};
    this.bad = false;
  }

  parse(): void {
    if (!parser) {
      return
    }

    console.log(parser, parser.parser);
    let ast: ASTNode;

    try {
      ast = this.ast = parser.parser.parse(this.source);
    } catch (error) {
      this.bad = true;

      // The parser throws a SyntaxError carrying a source location.
      let perr = error as ParseError
      let loc = perr.location;
      let istart = loc.start.line - 4;
      let iend = loc.end.line + 4;

      istart = Math.max(istart, 0);
      iend = Math.max(iend, this.lines.length - 1);

      let buf = "";

      console.log(this.lines);
      for (let i = istart; i <= iend; i++) {
        let s = `${i + 1}:`

        while (s.length < 4) {
          s += " ";
        }
        s += " " + this.lines[i];
        buf += s + "\n";
      }

      console.error(`Line ${perr.location.start.line + 1}: ${perr.message}`);

      return;
    }

    let astState = prepareAST(ast);

    console.log("AST", ast);

    let buf = printAST(ast);
    console.log(buf);

    transformVectors(ast, astState);

    let ret = parser.generate(ast);
    console.log(ret);
  }
}

export function autoDiffGLSL(source: string): void {
  let ad = new AutoDiff(source);
  ad.parse();

}

globalThis._testAutoDiffGLSL = function testAutoDiffGLSL() {
  let source = `
  
  vec2 cmul(vec2 a, vec2 b) {
    return vec2(
      a[0]*b[0] - a[1]*b[0],
      a[1]*b[0] + a[0]*b[1]
    );
  }
  
  float func(vec2 p, float i, int u, bool c) {
    //float f = cmul(p, vec2(2.0, 3.0)), g = 1.0;
    //float dp = df(f, p.x);
    
    p += vec2(p.x, p.y);
    return normalize(p.xy).yx + p*p; //length(p.yx) + p*p);
  }
  
  `;

  function finish() {
    console.log("===Test===");
    autoDiffGLSL(source);
  }

  if (promise) {
    promise.then(finish);
  } else {
    finish();
  }
}

//_testAutoDiffGLSL();