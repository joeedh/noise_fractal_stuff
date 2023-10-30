export class token {
  constructor(type, val, lexpos, lexlen, lineno, lexer, parser) {
    this.type = type;
    this.value = val;
    this.lexpos = lexpos;
    this.lexlen = lexlen;
    this.lineno = lineno;
    this.lexer = lexer;
    this.parser = parser;
  }

  setValue(val) {
    this.value = val;
    return this;
  }

  toString() {
    if (this.value !== undefined)
      return "token(type=" + this.type + ", value='" + this.value + "')"
    else
      return "token(type=" + this.type + ")"
  }
}

//func is optional. it takes a function
//with one parameter, token, and either
//a) returns the token, or b) returns
//undefined, in which case the token
//should be ignored by the lexer
export class tokdef {
  constructor(name, regexpr, func) {
    this.name = name;
    this.re = regexpr
    this.func = func
  }
}

export class PUTLParseError extends Error {
}

//errfunc is optional.  it requires
//a function that takes one param, lexer,
//and returns true if the lexer
//should propegate an error when an error
//has happened
export class lexer {
  constructor(tokdef, errfunc) {
    this.tokdef = tokdef;
    this.tokens = new Array();
    this.lexpos = 0;
    this.lexdata = "";
    this.lineno = 0;
    this.errfunc = errfunc;
    this.tokints = {}
    this.print_tokens = false;
    this.print_debug = false;

    for (let i = 0; i < tokdef.length; i++) {
      this.tokints[tokdef[i].name] = i;
    }

    this.statestack = [["__main__", 0]];
    this.states = {"__main__": [tokdef, errfunc]};
    this.statedata = 0; //public variable
  }

  copy() {
    let ret = new lexer(this.tokdef, this.errfunc);

    for (let k in this.states) {
      let state = this.states[k];

      state = [state[0], state[1]];
      ret.states[k] = state;
    }

    ret.statedata = this.statedata;

    return ret;
  }

//errfunc is optional, defines state-specific error function
  add_state(name, tokdef, errfunc) {
    if (errfunc === undefined) {
      errfunc = function (lexer) {
        return true;
      };
    }

    this.states[name] = [tokdef, errfunc];
  }

  tok_int(name) {

  }

  //statedata is optional.
  //it stores state-specific data in lexer.statedata.
  push_state(state, statedata) {
    this.statestack.push([state, statedata])

    state = this.states[state];
    this.statedata = statedata;

    this.tokdef = state[0];
    this.errfunc = state[1];
  }

  pop_state() {
    let item = this.statestack[this.statestack.length - 1];
    let state = this.states[item[0]];

    this.tokdef = state[0];
    this.errfunc = state[1];
    this.statedata = item[1];
  }

  input(str) {
    //go back to main state
    while (this.statestack.length > 1) {
      this.pop_state();
    }

    this.lexdata = str;
    this.lexpos = 0;
    this.lineno = 0;
    this.tokens = new Array();

    this.peeked_tokens = [];
  }

  error() {
    if (this.errfunc !== undefined && !this.errfunc(this))
      return;

    console.log("Syntax error near line " + this.lineno);
    let next = Math.min(this.lexpos + 8, this.lexdata.length);
    console.log("  " + this.lexdata.slice(this.lexpos, next));

    throw new PUTLParseError("Parse error");
  }

  peek() {
    let tok = this.next(true);

    if (tok === undefined)
      return undefined;

    this.peeked_tokens.push(tok);
    return tok;
  }


  peek_i(i) {
    while (this.peeked_tokens.length <= i) {
      let t = this.peek();
      if (t === undefined)
        return undefined;
    }

    return this.peeked_tokens[i];
  }

  at_end() {
    return this.lexpos >= this.lexdata.length && this.peeked_tokens.length === 0;
  }

  next(ignore_peek) {
    if (ignore_peek !== true && this.peeked_tokens.length > 0) {
      let tok = this.peeked_tokens[0];

      if (this.print_debug) {
        console.log("PEEK_SHIFTING", "" + tok);
      }

      this.peeked_tokens.shift();

      if (this.print_tokens) {
        console.log(tok.toString());
      }

      return tok;
    }

    if (this.lexpos >= this.lexdata.length)
      return undefined;

    let ts = this.tokdef;
    let tlen = ts.length;

    let lexdata = this.lexdata.slice(this.lexpos, this.lexdata.length);

    let results = []

    for (let i = 0; i < tlen; i++) {
      let t = ts[i];

      if (t.re === undefined)
        continue;

      let res = t.re.exec(lexdata);

      if (res !== null && res !== undefined && res.index === 0) {
        results.push([t, res]);
      }
    }

    let max_res = 0;
    let theres = undefined;
    for (let i = 0; i < results.length; i++) {
      let res = results[i];

      if (res[1][0].length > max_res) {
        theres = res;
        max_res = res[1][0].length;
      }
    }

    if (theres === undefined) {
      this.error();
      return;
    }

    let def = theres[0];

    let lexlen = max_res;
    let tok = new token(def.name, theres[1][0], this.lexpos, lexlen, this.lineno, this, undefined);
    this.lexpos += max_res;

    if (def.func) {
      tok = def.func(tok)

      if (tok === undefined) {
        return this.next(ignore_peek);
      }
    }

    if (this.print_tokens) {
      console.log(tok.toString());
    }

    if (!ignore_peek && this.print_debug) {
      console.log("CONSUME", tok.toString(), "\n" + getTraceBack());
    }

    return tok;
  }
}

export function getTraceBack(limit, start) {
  try {
    throw new Error();
  } catch (error) {
    let stack = error.stack.split("\n");
    stack = stack.slice(1, stack.length);

    if (start === undefined) {
      start = 0;
    }

    for (let i = 0; i < stack.length; i++) {
      let l = stack[i];

      let j = l.length - 1;
      while (j > 0 && l[j] !== "/") {
        j--;
      }

      let k = j;
      while (k >= 0 && l[k] !== "(") {
        k--;
      }

      let func = l.slice(0, k).trim();
      let file = l.slice(j + 1, l.length - 1);

      l = `  ${func} (${file})`;

      if (l.search(/parseutil\.js/) >= 0) {
        start = Math.max(start, i);
      }
      stack[i] = l;
    }

    if (limit !== undefined) {
      stack.length = Math.min(stack.length, limit);
    }

    if (start !== undefined) {
      stack = stack.slice(start, stack.length);
    }

    stack = stack.join("\n");
    return stack;
  }
}

export class parser {
  constructor(lexer, errfunc) {
    this.lexer = lexer;
    this.errfunc = errfunc;
    this.start = undefined;
    this.userdata = undefined;
  }

  copy() {
    let ret = new parser(this.lexer.copy(), this.errfunc);
    ret.start = this.start;

    return ret;
  }


  parse(data, err_on_unconsumed) {
    if (err_on_unconsumed === undefined)
      err_on_unconsumed = true;

    if (data !== undefined)
      this.lexer.input(data);

    let ret = this.start(this);

    if (err_on_unconsumed && !this.lexer.at_end() && this.lexer.next() !== undefined) {
      //console.log(this.lexer.lexdata.slice(this.lexer.lexpos-1, this.lexer.lexdata.length));
      this.error(undefined, "parser did not consume entire input");
    }

    return ret;
  }

  input(data) {
    this.lexer.input(data);
  }

  error(tok, msg) {
    if (msg === undefined)
      msg = ""

    let estr;

    if (tok === undefined)
      estr = "Parse error at end of input: " + msg
    else
      estr = "Parse error at line " + (tok.lineno + 1) + ": " + msg;

    let buf = "1| "
    let ld = this.lexer.lexdata;
    let l = 1;
    for (let i = 0; i < ld.length; i++) {
      let c = ld[i];
      if (c === '\n') {
        l++;
        buf += "\n" + l + "| "
      } else {
        buf += c;
      }
    }

    console.log("------------------")
    console.log(buf);
    console.log("==================")
    console.log(estr);

    if (this.errfunc && !this.errfunc(tok)) {
      return;
    }

    throw new PUTLParseError(estr);
  }

  peek() {
    let tok = this.lexer.peek();
    if (tok !== undefined)
      tok.parser = this;

    return tok;
  }

  peek_i(i) {
    let tok = this.lexer.peek_i(i);
    if (tok !== undefined)
      tok.parser = this;

    return tok;
  }

  peeknext() {
    return this.peek_i(0);
  }

  next() {
    let tok = this.lexer.next();

    if (tok !== undefined)
      tok.parser = this;

    return tok;
  }

  optional(type) {
    let tok = this.peek_i(0);

    if (tok && tok.type === type) {
      this.next();

      return true;
    }

    return false;
  }

  at_end() {
    return this.lexer.at_end();
  }

  expect(type, msg) {
    let tok = this.next();

    if (msg === undefined)
      msg = type

    if (tok === undefined || tok.type != type) {
      this.error(tok, "Expected " + msg + ", not " + tok.type);
    }

    return tok.value;
  }
}

function test_parser() {
  let basic_types = new set([
    "int",
    "float",
    "double",
    "vec2",
    "vec3",
    "vec4",
    "mat4",
    "string"]);

  let reserved_tokens = new set([
    "int",
    "float",
    "double",
    "vec2",
    "vec3",
    "vec4",
    "mat4",
    "string",
    "static_string",
    "array"]);

  function tk(name, re, func) {
    return new tokdef(name, re, func);
  }

  let tokens = [
    tk("ID", /[a-zA-Z]+[a-zA-Z0-9_]*/, function (t) {
      if (reserved_tokens.has(t.value)) {
        t.type = t.value.toUpperCase();
      }

      return t;
    }),
    tk("OPEN", /\{/),
    tk("CLOSE", /}/),
    tk("COLON", /:/),
    tk("JSCRIPT", /\|/, function (t) {
      let js = ""
      let lexer = t.lexer;
      while (lexer.lexpos < lexer.lexdata.length) {
        let c = lexer.lexdata[lexer.lexpos];
        if (c === "\n")
          break;

        js += c;
        lexer.lexpos++;
      }

      if (js.endsWith(";")) {
        js = js.slice(0, js.length - 1);
        lexer.lexpos--;
      }

      t.value = js;
      return t;
    }),

    tk("LPARAM", /\(/),
    tk("RPARAM", /\)/),
    tk("COMMA", /,/),
    tk("NUM", /[0-9]/),
    tk("SEMI", /;/),
    tk("NEWLINE", /\n/, function (t) {
      t.lexer.lineno += 1;
    }),
    tk("SPACE", / |\t/, function (t) {
      //throw out non-newline whitespace tokens
    })
  ];

  for (let rt in reserved_tokens) {
    tokens.push(tk(rt.toUpperCase()));
  }

  /*let a =
  Loop {
    eid : int;
    flag : int;
    index : int;
    type : int;

    co : vec3;
    no : vec3;
    loop : int | eid(loop);
    edges : array(e, int) | e.eid;

    loops : array(Loop);
  }
  `;
  */

  function errfunc(lexer) {
    return true; //throw error
  }

  let lex = new lexer(tokens, errfunc)
  console.log("Testing lexical scanner...")

  lex.input(a);

  let tok;
  while (tok = lex.next()) {
    console.log(tok.toString())
  }

  let parser = new parser(lex);
  parser.input(a);

  function p_Array(p) {
    p.expect("ARRAY");
    p.expect("LPARAM");

    let arraytype = p_Type(p);
    let itername = "";

    if (p.optional("COMMA")) {
      itername = arraytype;
      arraytype = p_Type(p);
    }


    p.expect("RPARAM");

    return {type: "array", data: {type: arraytype, iname: itername}};
  }

  function p_Type(p) {
    let tok = p.peek()

    if (tok.type === "ID") {
      p.next();
      return {type: "struct", data: "\"" + tok.value + "\""};
    } else if (basic_types.has(tok.type.toLowerCase())) {
      p.next();
      return {type: tok.type.toLowerCase()};
    } else if (tok.type === "ARRAY") {
      return p_Array(p);
    } else {
      p.error(tok, "invalid type " + tok.type); //(tok.value === "" ? tok.type : tok.value));
    }
  }

  function p_Field(p) {
    let field = {}

    console.log("-----", p.peek().type);

    field.name = p.expect("ID", "struct field name");
    p.expect("COLON");

    field.type = p_Type(p);
    field.set = undefined;
    field.get = undefined;

    let tok = p.peek();
    if (tok.type === "JSCRIPT") {
      field.get = tok.value;
      p.next()
    }

    tok = p.peek();
    if (tok.type === "JSCRIPT") {
      field.set = tok.value;
      p.next();
    }

    p.expect("SEMI");

    return field;
  }

  function p_Struct(p) {
    let st = {}
    st.name = p.expect("ID", "struct name")
    st.fields = [];

    p.expect("OPEN");

    while (1) {
      if (p.at_end()) {
        p.error(undefined);
      } else if (p.optional("CLOSE")) {
        break;
      } else {
        st.fields.push(p_Field(p));
      }
    }

    return st;
  }

  let ret = p_Struct(parser);

  console.log(JSON.stringify(ret));
}
