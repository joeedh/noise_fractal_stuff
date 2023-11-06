export var hasAutoDiff = false;
export var parser = undefined;
export var promise = undefined;


let colormap = {
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

export let termColorMap = {};
for (let k in colormap) {
  termColorMap[k] = colormap[k];
  termColorMap[colormap[k]] = k;
}

export function termColor(s, c) {
  if (typeof s === "symbol") {
    s = s.toString();
  } else {
    s = "" + s;
  }

  if (c in colormap)
    c = colormap[c]

  if (c > 107) {
    let s2 = '\u001b[38;5;' + c + "m"
    return s2 + s + '\u001b[0m'
  }

  return '\u001b[' + c + 'm' + s + '\u001b[0m'
};

promise = new Promise((accept, reject) => {
  import('../extern/shaderfrog/glsl-parser/dist/index.js').then(mod => {
    parser = mod;
    hasAutoDiff = true;

    globalThis._glslMod = mod;

    accept(mod);
    promise = undefined;
  });
});

function traverse(ast, handlers, scope, onArrayPre = undefined) {
  function rec(node, scope) {
    if (!node.type) {
      console.error("Unknown node", node);
      return;
    }

    function isNode(v) {
      let ok = typeof v === "object";
      ok = ok && v !== null;
      ok = ok && "type" in v;
      ok = ok && typeof v.type === "string";
      ok = ok && v.type.length > 0;

      return ok;
    }

    function visit(scope, child = node) {
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

function evalIDLit(node) {
  if (node.type === "identifier") {
    return node.identifier;
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

function evalType(node, scope = new Scope()) {
  if (typeof node === "string") {
    node = {
      type      : "identifier",
      identifier: node,
    }
  } else if (typeof node !== "object") {
    return node;
  } else if (node.type === "function_call") {
    let name = evalIDLit(node.identifier);

    let func = new Func();
    func.name = name;

    let namebase = 0;

    for (let arg of node.args) {
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
    scope.set("$this", node.expr);

    if (node.postfix.type === "quantifier") {
      //[]
      let type = scope.scope[evalIDLit(node.expr)];
      if (type) {
        type = evalType(type);
      }

      if (type && type in VectorSizes) {
        type = "float";
      }

      return type;
    } else {
      return evalType(node.postfix, scope);
    }
  } else if (node.type === "identifier") {
    let id = evalIDLit(node);

    if (id in scope.scope) {
      return evalType(scope.scope[id], scope);
    }
  } else if (node.type === "binary") {
    return evalType(node.right, scope);
  } else if (node.type === "field_selection") {
    let pvar = scope.scope["$this"];

    if (pvar.type === 'identifier') {
      let id = evalIDLit(pvar);
      console.log("ID", id);

      pvar = scope.scope[id];

      console.log("PVAR", pvar, Object.keys(scope.scope));

      let type = evalType(pvar, scope);
      if (type in VectorSizes) {
        let id2 = evalIDLit(node.selection);

        console.log("TYPE0", id2);

        type = id2.length === 1 ? "float" : VectorTypes[id2.length];
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
  constructor(node, scope) {
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

  load(node, scope) {
    this.ast = node;
    this.parameters = [];
    this.paramMap = {};
    this.key = '';

    let h = node.prototype.header;
    this.rtype = h.returnType;

    this.name = evalType(h.name, scope);

    if (!node.prototype.parameters) {
      this.genKey();
      return;
    }

    for (let param of node.prototype.parameters) {
      if (param.type === "literal") {
        continue;
      }

      let k = evalType(param.declaration.identifier, scope);

      this.paramMap[k] = param.declaration.specifier;
      this.parameters.push(param);
    }

    this.genKey();
  }

  genKey() {
    //glsl doesn't allow overloading return types
    //this.key = "__" + evalType(this.rtype) + "_";

    this.key += `__${this.name}`

    for (let k in this.paramMap) {
      let type = this.paramMap[k];
      this.key += "_" + evalType(type);
    }
  }
}

export function printAST(ast) {
  let str = '';
  let t = 0;

  function tab(n, tabchar = '-') {
    let tab = '';

    for (let i = 0; i < n; i++) {
      tab += tabchar;
    }

    return tab;
  }

  function out(s) {
    str += s;
  }

  function varout(k, v) {
    if (typeof v === "object" || typeof v === "function") {
      return;
    }

    out(` ${termColor(k, 'blue')}=${termColor(`"${"" + v}"`, "teal")}`);
  }

  traverse(ast, {
    literal(node, tlvl, visit) {
      let ok = node.parent.type === "binary" || node.parent.type === "unary";

      ok = true;
      if (ok) {
        this.default(node, tlvl, visit);
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
  }, 0, function (node, tlvl, name) {
    out(tab(tlvl) + name + "[] {\n");
    return tlvl + 1;
  });

  return str;
}

function nodeToString() {
  let name = this.type + ":" + this._id;

  if (this.type === "function") {
    name += ":" + evalIDLit(this.name);
  } else if (this.type === "function_call") {
    name += ":" + evalIDLit(this.identifier)
  }

  return name;
}

function nodeReplace(a, b) {
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

function nodeHas(a) {
  for (let k in this) {
    if (this[k] === a) {
      return true;
    }
  }

  return false;
}

export class ASTState {
  constructor(ast) {
    this.ast = ast;
    this.idgen = 0;
    this.idMap = new Map();

    this.rootScope = new Scope();
    this.rootScope.makeBuiltinFuncs(this);
  }

  new(type, args = {}) {
    let node = {
      type
    };

    for (let k in args) {
      node[k] = args[k];
    }

    this.check(node, undefined, false);

    return node;
  }

  add(node, parent, recurse = true) {
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

    this.idMap.set(node._id, node);

    if (recurse) {
      prepareAST(node, this);
    }
  }

  check(node, parent, traverse = true) {
    return this.add(node, parent, traverse);
  }
}

export function prepareAST(ast, astState = new ASTState(ast)) {
  let idmap = new Map();
  let idgen = 0;

  traverse(ast, {
    default(node, parent, visit) {
      astState.add(node, parent, false);
      visit(node);
    },
    float_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = parseFloat(node.token);
    },
    int_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = parseInt(node.token)
    },
    bool_constant(node, parent, visit) {
      astState.add(node, parent, false);

      node.value = node.token;
    }
  });

  return astState;
}

export const VectorSizes = {
  vec2: 2,
  vec3: 3,
  vec4: 4
};

export const VectorTypes = {
  2: "vec2",
  3: "vec3",
  4: "vec4"
};

const axes = {
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

export function substNode(node, key, val) {
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
    } else if (typeof v === "object") {
      substNode(v, key, val);
    }
  }

  return node;
}

let VecSnippets = {
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
  constructor(stack) {
    this.parent = undefined;
    this.scope = {};
    this.stack = stack;
    this.funcs = {};
  }

  makeBuiltinFuncs(astState) {
    function trim(code) {
      code = code.trim();
      if (code.endsWith(",")) {
        code = code.slice(0, code.length - 1);
      }
      return code.trim();
    }

    for (let vec in VecSnippets) {
      for (let code of VecSnippets[vec]) {

        let ast = parser.parser.parse(code);
        astState.add(ast);

        //console.log(printAST(ast));
        if (ast.type !== "function") {
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

  clone() {
    let ret = new Scope(this.stack);

    ret.scope = Object.assign({}, this.scope);
    ret.parent = this;
    ret.funcs = Object.assign({}, this.funcs);

    return ret;
  }

  set(k, v) {
    console.log(termColor("set", "orange"), k);

    this.scope[k] = v;
  }
}

export function scopedTraverse(ast, handlers, scope = new Scope()) {
  function forward(node, scope, visit) {
    if (node.type in handlers) {
      handlers[node.type](node, scope, visit);
    } else {
      visit(scope);
    }
  }

  traverse(ast, {
    declarator_list(node, scope, visit) {
      let type = evalType(node.specified_type, scope);

      if (!type) {
        console.log("=======", node.specified_type);
        printAST(node.specified_type);
        console.error("Could2 not resolve type for ", id);
        process.exit();
      }

      for (let decl of node.declarations) {
        let id = evalIDLit(decl.identifier, scope);
        scope.set(id, type);

        forward(decl, scope, visit);
      }
    },

    declaration(node, scope, visit) {
      if (node.parent && node.parent.type === "declarator_list") {
        return;
      }

      let id = evalIDLit(node.identifier, scope);
      let type = evalType(node, scope);

      if (!type) {
        console.log("=======", node);
        printAST(node);
        console.error("Could not resolve type for ", id);
        process.exit();
      }

      scope.set(id, type);

      forward(node, scope, visit);
    },
    postfix(node, scope, visit) {
      scope = scope.clone();
      scope.set('$this', node.expr);

      forward(node, scope, visit);
    },
    function(node, scope, visit) {
      let func = new Func(node);
      scope.set(func.key, func);
      scope.funcs[func.key] = func;

      let scope2 = scope.clone();

      for (let k in func.paramMap) {
        let type = func.paramMap[k];
        scope2.set(k, type);
      }

      forward(node.body, scope2, function (scope, child = node.body) {
        visit(scope, child);
      });
    },
    default(node, scope, visit) {
      forward(node, scope, visit);
    }
  }, scope);
}

export function cloneNode(node) {
  let ret = {};

  for (let k in node) {
    if (k === "parent") {
      continue;
    }

    let v = node[k];

    if (typeof v === "object" && v !== null) {
      if (Array.isArray(v)) {
        let arr = [];

        for (let item of v) {
          arr.push(cloneNode(item));
        }

        v = arr;
      } else {
        v = cloneNode(v);
      }
    }

    ret[k] = v;
  }

  return ret;
}

export function transformSwizzles(ast, astState) {
  scopedTraverse(ast, {
    postfix(node, scope, visit) {
      visit(scope);
    },
    function_call(node, scope, visit) {
      //console.log(node);
      visit(scope);
    },
    field_selection(node, scope, visit) {
      let id = evalType(node.selection, scope);

      if (id.length === 1) {
        return; //no swizzle
      }

      let v = scope.scope.$this;
      let vname = v;
      let isRef = false;

      if (v.type === "identifier") {
        vname = v.identifier;
        v = scope.scope[v.identifier];

        isRef = true;
      } else {
        //console.log(v);
        //process.exit()
      }

      let type = evalType(v, scope);
      if (!(type in VectorSizes)) {
        //console.error("V", v, evalType(v, scope));
        console.log("------>", printAST(v));
        //console.warn(v.identifier);
        console.error("Unknown type for ", v.toString());
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

      let pvar_base;
      if (isRef) {
        pvar_base = {
          type      : "identifier",
          identifier: vname
        };
      } else {
        pvar_base = v;
      }

      let args = [];

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

        let pvar = {
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

      let node2 = {
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
      console.log("code:", parser.generate(node2));

      console.log(node.parent.type);

      let parent = node.parent.parent;
      astState.check(node2, parent);

      parent.replace(node.parent, node2);

      //node.type = undefined;

      console.log(parser.generate(parent));
    },
  }, astState.rootScope);

  //process.exit();
}

export function transformVectors(ast, astState) {
  let binops = {
    "+" : (a, b) => a + b,
    "-" : (a, b) => a - b,
    "*" : (a, b) => a*b,
    "/" : (a, b) => a/b,
    "**": (a, b) => a**b,
    "&&": (a, b) => a && b,
    "||": (a, b) => a || b,
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

  let stack = [];
  let scope = astState.rootScope;
  scope.stack = stack;

  scopedTraverse(ast, {
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

      if (!type || !(type in VectorSizes)) {
        return;
      }

      let op = evalIDLit(node.operator);
      console.log(Object.keys(scope.scope));

      console.log("Type:", type, op, "Type2:", type2, node.right);

      let namemap = {
        "*": "mul",
        "/": "div",
        "+": "add",
        "-": "sub",
      };

      if (op in namemap) {

      } else {
        throw new Error("unknown op " + op);
      }

      let key = `__v2${namemap[op]}_${type}_${type2}`;

      //console.log(Object.keys(scope.scope));
      console.log("KEY", key);

      let fcall = astState.new("function_call", {
        identifier: astState.new("identifier", {
          identifier: type + namemap[op]
        }),
        lp        : astState.new("literal", {literal: "("}),
        args      : [
          node.left,
          astState.new("literal", {literal: ","}),
          node.right
        ],
        rp        : astState.new("literal", {literal: ")"}),
      });

      astState.check(fcall);

      node.parent.replace(node, fcall);

      console.log(parser.generate(fcall))
    }
  }, scope);

  return ast;
}

function make_builtin_code() {
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

  let opmap = {
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
  constructor(source) {
    source = BuiltinCode + "\n" + source;

    this.source = source;
    this.lines = source.split("\n");
    this.ast = undefined;

    this.funcs = {};
    this.bad = false;
  }

  parse() {
    console.log(parser, parser.parser);
    let ast;

    try {
      ast = this.ast = parser.parser.parse(this.source);
    } catch (error) {
      this.bad = true;

      let loc = error.location;
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

      console.error(`Line ${error.location.start.line + 1}: ${error.message}`);

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

export function autoDiffGLSL(source) {
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