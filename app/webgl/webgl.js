import {
  util, vectormath, nstructjs, math, Vector2, Vector3,
  Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

"use strict";

let DEPTH24_STENCIL8 = 35056;
let RGBA32F = 34836;
let FLOAT = 5126

function debuglog() {
  console.warn(...arguments);
}

export class FBO {
  /*
  To make a cube texture FBO, create an FBO and then
  manually set .texColor.texture and .texDepth.texture,
  also set .target to gl.TEXTURE_CUBE_MAP and .layer
  to the cube map face layer
  */
  constructor(gl, width = 512, height = 512) {
    this.target = gl !== undefined ? gl.TEXTURE_2D : 3553;
    this.layer = undefined; //used if target is not gl.TEXTURE_2D

    this.ctype = undefined; //RGBA32F;
    this.dtype = undefined; //DEPTH24_STENCIL8;

    this.gl = gl;
    this.fbo = undefined;
    this.regen = true;
    this.size = new Vector2([width, height]);
    this.texDepth = undefined;
    this.texColor = undefined;
    this.contextGen = gl ? gl.contextGen : 0;
  }

  _check(gl) {
    if (this.dtype === undefined) {
      this.dtype = gl.haveWebGL2 ? DEPTH24_STENCIL8 : gl.DEPTH_STENCIL;
    }
    if (this.ctype === undefined) {
      this.ctype = gl.haveWebGL2 ? RGBA32F : gl.RGBA;
    }
  }

  copy(copy_buffers = false) {
    let ret = new FBO();

    ret.size = new Vector2(this.size);
    ret.gl = this.gl;

    if (!copy_buffers || !this.gl || !this.fbo) {
      return ret;
    }

    ret.create(this.gl);

    let gl = this.gl;

    //ret.texColor = this.texColor.copy(gl, true);
    //ret.texDepth = this.texDepth.copy(gl, true);

    return ret;
  }

  create(gl) {
    this._check(gl);

    debuglog("fbo create");

    if (this.fbo && this.gl) {
      this.destroy();
    }

    this.regen = 0;

    gl = this.gl = gl === undefined ? this.gl : gl;

    this.size[0] = ~~this.size[0];
    this.size[1] = ~~this.size[1];

    //console.trace("framebuffer creation");

    this.fbo = gl.createFramebuffer();

    if (this.texDepth) {
      gl.deleteTexture(this.texDepth.texture);
    }
    if (this.texColor) {
      gl.deleteTexture(this.texColor.texture);
    }

    this.texDepth = new Texture(gl.createTexture(), gl);
    this.texColor = new Texture(gl.createTexture(), gl);

    let target = this.target;
    let layer = this.layer;

    function texParams(target, tex) {
      gl.bindTexture(target, tex.texture);

      tex.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (target !== gl.TEXTURE_2D) {
        tex.texParameteri(gl, target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      }
    }

    texParams(this.target, this.texDepth);
    if (gl.haveWebGL2) {
      this.texDepth.texParameteri(gl, this.target, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, gl.ALWAYS);
    }

    texParams(this.target, this.texColor);

    let initTex = (tex, dtype, dtype2, dtype3) => {
      if (this.target !== gl.TEXTURE_2D)
        return;

      if (gl.haveWebGL2) {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
        //  gl.texStorage2D(gl.TEXTURE_2D, 1, dtype, this.size[0], this.size[1]);
      } else {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
      }
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    let dtype = this.dtype;
    let dtype2 = gl.DEPTH_STENCIL;

    //UNSIGNED_INT_24_8
    let dtype3 = gl.haveWebGL2 ? gl.UNSIGNED_INT_24_8 : gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;

    gl.bindTexture(this.target, this.texDepth.texture);
    initTex(this.texDepth, dtype, dtype2, dtype3);

    let ctype = this.ctype;
    let ctype2 = gl.RGBA, ctype3 = gl.FLOAT;

    gl.bindTexture(target, this.texColor.texture);
    initTex(this.texColor, ctype, ctype2, ctype3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    if (this.target === gl.TEXTURE_2D) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColor.texture, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.texDepth.texture, 0);
    } else {
      let target2 = target;

      if (target === gl.TEXTURE_CUBE_MAP) {
        target2 = layer;
      }

      if (DEBUG.fbo) {
        debuglog("TARGET2", target2);
      }

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target2, this.texColor.texture, 0);
      if (target === gl.TEXTURE_2D) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, target2, this.texDepth.texture, 0);
      }
    }

    let errret = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    if (DEBUG.fbo) {
      debuglog("FBO STATUS:", errret, webgl.constmap[errret]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(gl) {
    this._check(gl);

    this._last_viewport = gl.getParameter(gl.VIEWPORT);

    if (gl) {
      this.gl = gl;
    } else {
      gl = this.gl;
    }

    if (this.regen) {
      this.create(gl);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size[0], this.size[1]);
  }

  unbind(gl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let vb = this._last_viewport;
    if (!vb) {
      return;
    }

    gl.viewport(vb[0], vb[1], vb[2], vb[3]);
  }

  destroy(gl) {
    if (!this.gl) {
      this.gl = gl;
    }

    if (this.fbo !== undefined) {
      this.gl.deleteFramebuffer(this.fbo);

      //console.warn(this.target, this.gl.TEXTURE_2D);
      //if (this.target === this.gl.TEXTURE_2D) {
      this.gl.deleteTexture(this.texDepth.texture);
      this.gl.deleteTexture(this.texColor.texture);
      //}

      this.texDepth.texture = this.texColor.texture = undefined;
      this.fbo = undefined;
    }
  }

  update(gl, width, height) {
    width = ~~width;
    height = ~~height;

    /*
    function get2(f) {
      let f2 = Math.ceil(Math.log(f) / Math.log(2.0));
      return Math.pow(2.0, f2);
    }

    width = ~~get2(width);
    height = ~~get2(height);
    //*/

    gl = this.gl = gl === undefined ? this.gl : gl;

    if (width !== this.size[0] || height !== this.size[1] || gl !== this.gl) {
      debuglog("fbo update", width, height);

      this.size[0] = width;
      this.size[1] = height;

      if (this.gl === undefined || gl === this.gl) {
        this.destroy(gl);
      }

      this.texDepth = this.texColor = undefined;
      this.create(gl);

      return true;
    }
  }
}


//params are passed to canvas.getContext as-is
export function init_webgl(canvas, params, webgl2) {
//  webgl2 = false;

  params.powerPreference = params.powerPreference ?? "high-performance";
  params.premultipliedAlpha = params.premultipliedAlpha ?? false;
  params.antialias = params.antialias ?? false;
  params.desynchronized = params.desynchronized ?? true;

  var gl = canvas.getContext(webgl2 ? "webgl2" : "webgl", params);
  
  if (!gl) {
    gl = canvas.getContext("webgl");
    webgl2 = false;
  }

  gl.haveWebGL2 = !!webgl2;

  if (webgl2) {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("EXT_color_buffer_float");
  } else {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("WEBGL_color_buffer_float");
  }


  gl.texture_float = gl.getExtension("OES_texture_float");
  gl.texture_float = gl.getExtension("OES_texture_float_linear");
  gl.float_blend = gl.getExtension("EXT_float_blend");
  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("ANGLE_instanced_arrays");
  gl.debugContextLoss = gl.getExtension("WEBGL_lose_context");
  gl.draw_buffers = gl.getExtension("WEBGL_draw_buffers");

  function makeExtForward(k, v) {
    let k2 = k;

    if (k2.endsWith("WEBGL")) {
      k2 = k2.slice(0, k2.length - 5);
      if (k2.endsWith("_")) {
        k2 = k2.slice(0, k2.length - 1);
      }

      try {
        if (typeof v === "function") {
          gl[k2] = function () {
            v(...arguments);
          }
        } else {
          gl[k2] = v;
        }
      } catch (error) {
        if (gl[k2] !== v) {
          console.warn("failed to bind property", k2);
        }
      }
    }
  }

  if (gl.draw_buffers) {
    for (let k in gl.draw_buffers.__proto__) {
      if (typeof k === "symbol") {
        continue;
      }

      makeExtForward(k, gl.draw_buffers.__proto__[k])
    }
  }

  gl.depth_texture = gl.getExtension("WEBGL_depth_texture");

  return gl;
}

function format_lines(script) {
  var i = 1;

  var lines = script.split("\n")
  var maxcol = Math.ceil(Math.log(lines.length)/Math.log(10)) + 1;

  var s = "";

  for (var line of lines) {
    s += "" + i + ":";
    while (s.length < maxcol) {
      s += " "
    }

    s += line + "\n";
    i++;
  }

  return s;
}

//
// loadShader
//
// 'shaderId' is the id of a <script> element containing the shader source string.
// Load this shader and return the WebGLShader object corresponding to it.
//
function loadShader(ctx, shaderId, type) {
  var shaderScript = document.getElementById(shaderId);

  if (!shaderScript) {
    shaderScript = {text: shaderId, type};
  }

  if (!type) {
    if (shaderId.contains("//vertex\n")) {
      shaderScript.type = "x-shader/x-vertex";
    } else if (shaderId.contains("//fragment\n")) {// in shaderId) { //.trim().toLowerCase().startsWith("//fragment")) {
      shaderScript.type = "x-shader/x-fragment";
    } else {
      console.trace();
      console.log("Invalid shader type");
      console.log("================");
      console.log(format_lines(shaderScript.text));
      console.log("================");
      throw new Error("Invalid shader type for shader script;\n script must start with //vertex or //fragment");
    }
  }

  if (shaderScript.type == "vertex")
    var shaderType = ctx.VERTEX_SHADER;
  else if (shaderScript.type == "fragment")
    var shaderType = ctx.FRAGMENT_SHADER;
  else {
    console.log("*** Error: invalid type " + shaderScript.type, shaderScript);
    return null;
  }

  // Create the shader object
  if (ctx == undefined || ctx == null || ctx.createShader == undefined)
    console.trace();

  var shader = ctx.createShader(shaderType);

  // Load the shader source
  ctx.shaderSource(shader, shaderScript.text);

  // Compile the shader
  ctx.compileShader(shader);

  // Check the compile status
  var compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
  if (!compiled && !ctx.isContextLost()) {
    // Something went wrong during compilation; get the error
    var error = ctx.getShaderInfoLog(shader);

    console.log(format_lines(shaderScript.text));
    console.log("\nError compiling shader: ", error);

    ctx.deleteShader(shader);
    return null;
  }

  return shader;
}

var _safe_arrays = [
  0,
  0,
  new Float32Array(2),
  new Float32Array(3),
  new Float32Array(4),
];

export class ShaderProgram {
  constructor(gl, vertex, fragment, attributes) {
    this.vertexSource = vertex;
    this.fragmentSource = fragment;
    this.attrs = [];

    for (var a of attributes) {
      this.attrs.push(a);
    }

    this.rebuild = 1;

    this.uniformlocs = {};
    this.attrlocs = {};

    this.uniforms = {};
    this.gl = gl;

    this.defines = {};
    this._def_shaders = {};
    this._use_def_shaders = true;
  }

  static fromDef(gl, def) {
    let ret = new ShaderProgram(gl, def.vertex, def.fragment, def.attributes);

    if (def.uniforms) {
      for (let k in def.uniforms) {
        ret.uniforms[k] = def.uniforms[k];
      }
    }

    return ret;
  }

  static load_shader(path, attrs) {
    var ret = new ShaderProgram(undefined, undefined, undefined, ["position", "normal", "uv", "color", "id"]);
    ret.ready = false;

    ret.init = function (gl) {
      if (!this.ready) {
        return;
      }

      return ShaderProgram.prototype.init.call(this, gl);
    }

    ret.promise = util.fetch_file(path).then(function (text) {
      console.log("loaded file");

      var lowertext = text.toLowerCase();
      var vshader = text.slice(0, lowertext.search("//fragment"));
      var fshader = text.slice(lowertext.search("//fragment"), text.length);

      ret.vertexSource = vshader;
      ret.fragmentSource = fshader;
      ret.ready = true;
    });

    ret.then = function () {
      return this.promise.then.apply(this.promise, arguments);
    }

    return ret;
  }

  _get_def_shader(gl, defines) {
    let defs = {};

    if (defines) {
      defs = Object.assign(defs, this.defines, defines);
    } else {
      defs = Object.assign(defs, this.defines);
    }

    let s = '';

    for (let k in defs) {
      let v = defs[k];

      if (v !== undefined) {
        s += `#define ${k} ${v}\n`
      } else {
        s += `#define ${k}\n`;
      }
    }
    s = s.trim();

    if (s in this._def_shaders) {
      return this._def_shaders[s];
    }

    function repl(src) {
      let i = src.search("precision");
      let i2 = i + src.slice(i, src.length).search("\n");

      return src.slice(0, i2) + "\n" + s + "\n" + src.slice(i2, src.length) + "\n";
    }

    let vertex = repl(this.vertexSource);
    let fragment = repl(this.fragmentSource);

    let sp = new ShaderProgram(gl, vertex, fragment, this.attrs);

    sp.uniforms = this.uniforms;
    sp._use_def_shaders = false;

    this._def_shaders[s] = sp;

    sp.init(gl);

    return sp;
  }

  init(gl) {
    if (this._use_def_shaders) {
      return this._get_def_shader(gl).init(gl);
    }

    this.gl = gl;
    this.rebuild = false;

    var vshader = this.vertexSource, fshader = this.fragmentSource;

    // create our shaders
    var vertexShader = loadShader(gl, vshader, "vertex");
    var fragmentShader = loadShader(gl, fshader, "fragment");

    // Create the program object
    var program = gl.createProgram();

    // Attach our two shaders to the program
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    var attribs = this.attrs;

    // Bind attributes
    for (var i = 0; i < attribs.length; ++i) {
      gl.bindAttribLocation(program, i, attribs[i]);
    }

    // Link the program
    gl.linkProgram(program);

    // Check the link status
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked && !gl.isContextLost()) {
      // something went wrong with the link
      var error = gl.getProgramInfoLog(program);
      console.log("Error in program linking:" + error);

      //do nothing
      //gl.deleteProgram(program);
      //gl.deleteProgram(fragmentShader);
      //gl.deleteProgram(vertexShader);

      return null;
    }

    console.log("created shader", program);

    this.program = program;

    this.gl = gl;
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.attrs = [];

    this.attrlocs = {};
    this.uniformlocs = {};

    this.uniforms = {}; //default uniforms

    for (var i = 0; i < attribs.length; i++) {
      this.attrs.push(i);
      this.attrlocs[attribs[i]] = i;
    }
  }

  on_gl_lost(newgl) {
    this.rebuild = 1;
    this.gl = newgl;
    this.program = undefined;

    this.uniformlocs = {};
  }

  uniformloc(name) {
    if (this._use_def_shaders) {
      return this._get_def_shader(this.gl).uniformloc(name);
    }

    if (this.uniformlocs[name] === undefined || this.uniformlocs[name] === null) {
      this.uniformlocs[name] = this.gl.getUniformLocation(this.program, name);
    }

    return this.uniformlocs[name];
  }

  attrloc(name) {
    if (this._use_def_shaders) {
      return this._get_def_shader(this.gl).attrloc(name);
    }

    return this.attrlocs[name];
  }

  bind(gl, uniforms, defines) {
    if (this._use_def_shaders) {
      return this._get_def_shader(gl, defines).bind(gl, uniforms);
    }

    this.gl = gl;

    if (this.rebuild) {
      this.init(gl);

      if (this.rebuild) {
        console.warn("fbo error");
        return; //failed to initialize
      }
    }

    function setv(dst, src, n) {
      for (var i = 0; i < n; i++) {
        dst[i] = src[i];
      }
    }

    gl.useProgram(this.program);

    this.gl = gl;
    let texSlotBase = 0;

    for (var i = 0; i < 2; i++) {
      var us = i ? uniforms : this.uniforms;

      for (var k in us) {
        var v = us[k];
        var loc = this.uniformloc(k)

        if (loc === undefined) {
          //stupid gl returns null if it optimized away the uniform,
          //so we must silently accept this
          //console.log("Warning, could not locate uniform", k, "in shader");
          continue;
        }

        if (v instanceof Texture) {
          v.bind(gl, this.uniformloc(k), texSlotBase++);
        } else if (v instanceof Array) {
          switch (v.length) {
            case 2:
              var arr = _safe_arrays[2];
              setv(arr, v, 2);
              gl.uniform2fv(loc, arr);
              break;
            case 3:
              var arr = _safe_arrays[3];
              setv(arr, v, 3);
              gl.uniform3fv(loc, arr);
              break;
            case 4:
              var arr = _safe_arrays[4];
              setv(arr, v, 4);
              gl.uniform4fv(loc, arr);
              break;
          }
        } else if (v instanceof Matrix4) {
          v.setUniform(gl, loc);
        } else if (typeof v == "number") {
          gl.uniform1f(loc, v);
        } else {
          console.warn(k, v);
          throw new Error("Invalid uniform for " + k);
        }
      }
    }

    return this;
  }
}

export class GPUVertexAttr {
  constructor() {
    this.type = undefined;
    this.size = undefined;
    this.buf = undefined;
    this.perfhint = undefined;
    this.elemSize = undefined;
    this.normalized = false;
  }

  upload(gl, args, data) {
    let {target, type, perfHint, elemSize, normalized} = args;

    perfHint = perfHint ?? gl.STATIC_DRAW;
    target = target ?? gl.ARRAY_BUFFER;
    type = type ?? gl.FLOAT;
    normalized = normalized ?? false;

    this.elemSize = elemSize;
    this.type = type;
    this.target = target;
    this.perfHint = perfHint;
    this.normalized = normalized;

    let cls;
    switch (type) {
      case gl.FLOAT:
        cls = Float32Array;
        break;
      case gl.BYTE:
        cls = Int8Array;
        break;
      case gl.UNSIGNED_BYTE:
        cls = data instanceof Uint8ClampedArray ? Uint8ClampedArray : Uint8Array;
        break;
      case gl.SHORT:
        cls = Int16Array;
        break;
      case gl.UNSIGNED_SHORT:
        cls = Uint16Array;
        break;
      case gl.INT:
        cls = Int32Array;
        break;
      case gl.UNSIGNED_INT:
        cls = Uint32Array;
        break;
    }

    if (!(data instanceof cls)) {
      data = new cls(data);
    }

    if (this.buf && this.size && data.length/elemSize >= this.size) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    this.size = ~~(data.length/elemSize);

    if (!this.buf) {
      this.buf = gl.createBuffer();
    }

    gl.bindBuffer(target, this.buf);
    gl.bufferData(target, data, perfHint);

    return this;
  }

  bind(gl, idx) {
    //console.error(idx, this.elemSize, this.type, this.normalized, this.buf);
    gl.bindBuffer(this.target, this.buf);

    gl.enableVertexAttribArray(idx);
    gl.vertexAttribPointer(idx, this.elemSize, this.type, this.normalized, 0, 0);
  }

  destroy(gl) {
    if (this.buf !== undefined) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    return this;
  }
}

export class RenderBuffer {
  constructor() {
    this._layers = {};
  }

  get(gl, name) {
    if (this[name] !== undefined) {
      return this[name];
    }

    let buf = new GPUVertexAttr();

    this._layers[name] = buf;
    this[name] = buf;

    return buf;
  }

  destroy(gl, name) {
    if (name === undefined) {
      for (var k in this._layers) {
        this._layers[k].destroy(gl);

        delete this._layers[k];
        delete this[k];
      }
    } else {
      if (this._layers[name] === undefined) {
        console.trace("WARNING: gl buffer no in RenderBuffer!", name, gl);
        return;
      }

      this._layers[name].destroy(gl);

      delete this._layers[name];
      delete this[name];
    }
  }
}

const TEXTURE_2D = 3553;

export class Texture {
  //3553 is gl.TEXTURE_2D
  constructor(texture, gl, target = 3553) {
    //console.warn("new webgl.Texture()", texture, gl !== undefined);

    this.texture = texture;
    this.texture_slot = undefined;
    this.target = target;

    this.createParams = {
      target: TEXTURE_2D
    };

    this.contextGen = gl ? gl.contextGen : 0;
    this.gl = gl;

    this.createParamsList = [TEXTURE_2D];

    this._params = {};
  }

  static load(gl, width, height, data, target = gl.TEXTURE_2D) {
    let tex = gl.createTexture();

    gl.bindTexture(target, tex);

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else if (use_byte_width) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    Texture.defaultParams(gl, tex, target);

    gl.generateMipmap(target);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    let ret = new Texture(undefined, tex, undefined, gl);

    ret.createParams.target = target;
    ret.createParams.width = width;
    ret.createParams.height = height;

    return ret;
  }

  static defaultParams(gl, tex, target = gl.TEXTURE_2D) {
    gl.bindTexture(target, tex);

    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.REPEAT);

  }

  texParameteri(gl, target, param, value) {
    this._params[param] = value;

    gl.texParameteri(target, param, value);
    return this;
  }

  getParameter(gl, param) {
    return this._params[param];
  }

  _texImage2D1(gl, target, level, internalformat, format, type, source) {
    gl.bindTexture(target, this.texture);
    gl.texImage2D(target, level, internalformat, format, type, source);

    this.createParams = {
      target, level, internalformat, format, type, source
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source
    ];

    if (source instanceof Image || source instanceof ImageData) {
      this.createParams.width = source.width;
      this.createParams.height = source.height;
    }

    return this;
  }

  _texImage2D2(gl, target, level, internalformat, width, height, border, format, type, source) {
    gl.bindTexture(target, this.texture);

    //if (source === undefined || source === null) {
    //  gl.texImage2D(target, level, internalformat, width, height, border, format, type, undefined);
    //} else {
    gl.texImage2D(target, level, internalformat, width, height, border, format, type, source);
    //}

    this.createParams = {
      target, level, internalformat, format, type, source, width, height, border
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source, width, height, border
    ];

    return this;
  }

  texImage2D() {
    this.contextGen = arguments[0].contextGen;

    if (arguments.length === 7) {
      return this._texImage2D1(...arguments);
    } else {
      return this._texImage2D2(...arguments);
    }
  }

  copy(gl, copy_data = false) {
    let tex = new Texture();

    tex.contextGen = this.contextGen;
    tex.texture = gl.createTexture();
    tex.createParams = Object.assign({}, this.createParams);
    tex.createParamsList = this.createParamsList.concat([]);
    tex.texture_slot = this.texture_slot;

    gl.bindTexture(this.createParams.target, tex.texture);

    if (!copy_data) {
      let p = this.createParams;

      tex.texImage2D(p.target, p.level, p.internalformat, p.format, p.type, null);
    } else {
      this.copyTexTo(gl, tex);
    }

    for (let k in this._params) {
      let key = parseInt(k);
      let val = this._params[key];

      gl.texParameteri(this.createParams.target, key, val);
    }

    return tex;
  }

  copyTexTo(gl, b) {
    if (this.texture === undefined) {
      return;
    }

    let p = this.createParams;

    gl.bindTexture(p.target, b.texture);
    b.texImage2D(gl, p.target, p.level, p.internalformat, p.width, p.height, p.border, p.format, p.type, this.texture);

    return this;
  }

  destroy(gl) {
    gl.deleteTexture(this.texture);
  }

  load(gl, width, height, data, target = gl.TEXTURE_2D) {
    let tex = this.texture !== undefined ? this.texture : gl.createTexture();

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    this.contextGen = gl.contextGen;
    this.texture = tex;

    gl.bindTexture(target, tex);

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else if (use_byte_width) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    Texture.defaultParams(gl, tex, target);

    gl.generateMipmap(target);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    return this;
  }

  defaultParams(gl, tex, target = gl.TEXTURE_2D) {
    gl.bindTexture(target, tex);

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.REPEAT);

  }

  bind(gl, uniformloc, slot = this.texture_slot) {
    if (this.contextGen !== gl.contextGen) {
      console.warn("Dead gl texture", this.contextGen, gl.ContextGen);
      return;
    }

    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(this.target, this.texture);
    gl.uniform1i(uniformloc, slot);
  }
}


//cameras will derive from this class
export class DrawMats {
  constructor() {
    this.cameramat = new Matrix4();
    this.persmat = new Matrix4();
    this.rendermat = new Matrix4();
    this.normalmat = new Matrix4();

    this.icameramat = new Matrix4();
    this.ipersmat = new Matrix4();
    this.irendermat = new Matrix4();
    this.inormalmat = new Matrix4();
  }

  regen_mats(aspect) {
    this.aspect = aspect;

    this.normalmat.load(this.cameramat).makeRotationOnly();

    this.icameramat.load(this.cameramat).invert();
    this.ipersmat.load(this.cameramat).invert();
    this.irendermat.load(this.cameramat).invert();
    this.inormalmat.load(this.normalmat).invert();

    return this;
  }

  toJSON() {
    return {
      cameramat: this.cameramat.getAsArray(),
      persmat  : this.persmat.getAsArray(),
      rendermat: this.rendermat.getAsArray(),
      normalmat: this.normalmat.getAsArray(),

      icameramat: this.icameramat.getAsArray(),
      ipersmat  : this.ipersmat.getAsArray(),
      irendermat: this.irendermat.getAsArray(),
      inormalmat: this.inormalmat.getAsArray()
    }
  }

  loadJSON(obj) {
    this.cameramat.load(obj.cameramat);
    this.persmat.load(obj.persmat);
    this.rendermat.load(obj.rendermat);
    this.normalmat.load(obj.normalmat);

    this.icameramat.load(obj.icameramat);
    this.ipersmat.load(obj.ipersmat);
    this.irendermat.load(obj.irendermat);
    this.inormalmat.load(obj.inormalmat);

    return this;
  }
}

//simplest camera
export class Camera extends DrawMats {
  constructor() {
    super();

    this.fovy = 35;
    this.aspect = 1.0;

    this.pos = new Vector3([0, 0, 5]);
    this.target = new Vector3();
    this.up = new Vector3([1, 3, 0]);
    this.up.normalize();

    this.near = 0.01;
    this.far = 10000.0;
  }

  toJSON() {
    var ret = super.toJSON();

    ret.fovy = this.fovy;
    ret.near = this.near;
    ret.far = this.far;
    ret.aspect = this.aspect;

    ret.target = this.target.slice(0);
    ret.pos = this.pos.slice(0);
    ret.up = this.up.slice(0);

    return ret;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.fovy = obj.fovy;

    this.near = obj.near;
    this.far = obj.far;
    this.aspect = obj.aspect;

    this.target.load(obj.target);
    this.pos.load(obj.pos);
    this.up.load(obj.up);

    return this;
  }

  regen_mats(aspect) {
    this.aspect = aspect;

    this.persmat.makeIdentity();
    this.persmat.perspective(this.fovy, aspect, this.near, this.far);

    this.cameramat.makeIdentity();
    this.cameramat.lookat(this.pos, this.target, this.up);    //this.cameramat.translate(this.pos[0], this.pos[1], this.pos[2]);

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    //this.rendermat.load(this.cameramat).multiply(this.persmat);

    super.regen_mats(aspect); //will calculate iXXXmat for us
  }
}
