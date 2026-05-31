import {
  util, vectormath, nstructjs, math, Vector2, Vector3,
  Vector4, Matrix4, Quat
} from '../path.ux/scripts/pathux.js';

"use strict";

let DEPTH24_STENCIL8 = 35056;
let RGBA32F = 34836;
let FLOAT = 5126

function debuglog(...args: unknown[]): void {
  console.warn(...args);
}

export class FBO {
  target: number
  layer: number | undefined
  _old_buffer: number
  contextGen: number | undefined
  ctype: number | undefined
  dtype: number | undefined
  gl: AppGL | undefined
  fbo: WebGLFramebuffer | undefined
  regen: boolean | number
  size: Vector2
  texDepth: Texture | undefined
  texColor: Texture | undefined
  extraBuffers: number
  texBuffers: Texture[]
  _last_viewport: Int32Array | undefined

  /*
  To make a cube texture FBO, create an FBO and then
  manually set .texColor.texture and .texDepth.texture,
  also set .target to gl.TEXTURE_CUBE_MAP and .layer
  to the cube map face layer
  */
  constructor(gl?: AppGL, width = 512, height = 512) {
    this.target = gl !== undefined ? gl.TEXTURE_2D : 3553;
    this.layer = undefined; //used if target is not gl.TEXTURE_2D

    this._old_buffer = 0;

    this.contextGen = gl ? gl.contextGen : undefined;

    this.ctype = undefined; //RGBA32F;
    this.dtype = undefined; //DEPTH24_STENCIL8;

    this.gl = gl;
    this.fbo = undefined;
    this.regen = true;
    this.size = new Vector2([width, height]);
    this.texDepth = undefined;
    this.texColor = undefined;
    this.contextGen = gl ? gl.contextGen : 0;

    this.extraBuffers = 0;
    this.texBuffers = [];
  }

  _check(gl: AppGL): void {
    if (this.dtype === undefined) {
      this.dtype = gl.haveWebGL2 ? DEPTH24_STENCIL8 : gl.DEPTH_STENCIL;
    }
    if (this.ctype === undefined) {
      this.ctype = gl.haveWebGL2 ? RGBA32F : gl.RGBA;
    }
  }

  copy(copy_buffers = false): FBO {
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

  create(gl: AppGL): void {
    if (gl.contextBad) {
      this.fbo = undefined;
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.fbo = undefined;
      this.texColor = undefined;
      this.texDepth = undefined;
      this._last_viewport = undefined;
      this.gl = gl;
    }

    this.contextGen = gl.contextGen;

    this._check(gl);

    debuglog("fbo create");

    if (this.fbo && this.gl) {
      this.destroy(this.gl);
    }

    this.regen = 0;

    this.gl = gl;

    this.size[0] = ~~this.size[0];
    this.size[1] = ~~this.size[1];

    //console.trace("framebuffer creation");

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.fbo = gl.createFramebuffer();

    if (this.texDepth) {
      gl.deleteTexture(this.texDepth.texture ?? null);
    }
    if (this.texColor) {
      gl.deleteTexture(this.texColor.texture ?? null);
    }

    for (let tex of this.texBuffers) {
      gl.deleteTexture(tex.texture ?? null);
    }
    this.texBuffers.length = 0;

    this.texDepth = new Texture(gl.createTexture(), gl);
    this.texColor = new Texture(gl.createTexture(), gl);

    for (let i = 0; i < this.extraBuffers; i++) {
      this.texBuffers.push(new Texture(gl.createTexture(), gl));
    }

    let target = this.target;
    let layer = this.layer;

    function texParams(target: number, tex: Texture): void {
      gl.bindTexture(target, tex.texture ?? null);

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

    for (let tex of this.texBuffers) {
      texParams(this.target, tex);
    }

    let initTex = (tex: Texture, dtype: number, dtype2: number, dtype3: number): void => {
      if (this.target !== gl.TEXTURE_2D) {
        console.error("Invalid texture target " + this.target + "!");
        return;
      }

      if (gl.haveWebGL2) {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
        //  gl.texStorage2D(gl.TEXTURE_2D, 1, dtype, this.size[0], this.size[1]);
      } else {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
      }
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    let dtype = this.dtype!;
    let dtype2 = gl.DEPTH_STENCIL;

    //UNSIGNED_INT_24_8
    let dtype3 = gl.haveWebGL2
      ? gl.UNSIGNED_INT_24_8
      : gl.depth_texture!.UNSIGNED_INT_24_8_WEBGL;

    gl.bindTexture(this.target, this.texDepth.texture ?? null);
    initTex(this.texDepth, dtype, dtype2, dtype3);

    let ctype = this.ctype!;
    let ctype2 = gl.RGBA, ctype3 = gl.FLOAT;

    gl.bindTexture(target, this.texColor.texture ?? null);
    initTex(this.texColor, ctype, ctype2, ctype3);

    for (let tex of this.texBuffers) {
      initTex(tex, ctype, ctype2, ctype3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    if (this.target === gl.TEXTURE_2D) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColor.texture ?? null, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.texDepth.texture ?? null, 0);

      let attach = gl.COLOR_ATTACHMENT1;
      for (let tex of this.texBuffers) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attach++, gl.TEXTURE_2D, tex.texture ?? null, 0);
      }
    } else {
      let target2 = target;

      if (target === gl.TEXTURE_CUBE_MAP) {
        target2 = layer ?? target;
      }

      if (window.DEBUG?.fbo) {
        debuglog("TARGET2", target2);
      }

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target2, this.texColor.texture ?? null, 0);
      if (target === gl.TEXTURE_2D) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture ?? null, 0);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture ?? null, 0);
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, target2, this.texDepth.texture, 0);
      }
    }

    let errret = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    if (window.DEBUG?.fbo) {
      debuglog("FBO STATUS:", errret);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(gl: AppGL): void {
    if (gl.contextBad) {
      return;
    }

    this._old_buffer = gl.getParameter(gl.DRAW_BUFFER0);

    if (gl.contextGen !== this.contextGen) {
      console.warn("context loss detected in fbo");

      this.texDepth = undefined;
      this.texColor = undefined;
      this.fbo = undefined;
      this._last_viewport = undefined;

      this.create(gl);
    }

    this._check(gl);

    this._last_viewport = gl.getParameter(gl.VIEWPORT);

    this.gl = gl;

    if (this.regen) {
      this.create(gl);
    }

    //if (gl.drawBuffers) {
    //gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    //}

    let bufs: number[] = [gl.COLOR_ATTACHMENT0];
    for (let i = 0; i < this.extraBuffers; i++) {
      bufs.push(gl.COLOR_ATTACHMENT1 + i);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo ?? null);
    gl.drawBuffers(bufs);
    gl.viewport(0, 0, this.size[0], this.size[1]);
  }

  unbind(gl: AppGL): void {
    if (gl.contextBad || gl.contextGen !== this.contextGen) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let vb = this._last_viewport;
    if (!vb) {
      return;
    }

    gl.drawBuffers([gl.BACK]);
    gl.viewport(vb[0], vb[1], vb[2], vb[3]);
  }

  destroy(gl: AppGL | undefined = this.gl): void {
    if (!gl || gl.contextBad || this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in fbo.destroy()!");

      this.fbo = undefined;
      this.texDepth = undefined;
      this.texColor = undefined;

      return;
    }

    if (!this.gl) {
      this.gl = gl;
    }

    if (this.fbo !== undefined) {
      this.gl.deleteFramebuffer(this.fbo);

      //console.warn(this.target, this.gl.TEXTURE_2D);
      //if (this.target === this.gl.TEXTURE_2D) {
      this.gl.deleteTexture(this.texDepth?.texture ?? null);
      this.gl.deleteTexture(this.texColor?.texture ?? null);
      //}

      if (this.texDepth) {
        this.texDepth.texture = undefined;
      }
      if (this.texColor) {
        this.texColor.texture = undefined;
      }
      this.fbo = undefined;
    }
  }

  update(gl: AppGL | undefined, width: number, height: number): boolean | undefined {
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

    if (!gl) {
      return;
    }

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
export function init_webgl(
  canvas: HTMLCanvasElement,
  params: WebGLContextAttributes,
  webgl2?: boolean
): AppGL {
  //webgl2 = false;

  params.powerPreference = params.powerPreference ?? "high-performance";
  params.premultipliedAlpha = params.premultipliedAlpha ?? false;
  params.antialias = params.antialias ?? false;
  /* Note: desynchronized:true uses a low-latency scanout path that composites
     as black for this accumulating renderer (it stops drawing once all samples
     are taken). Keep it off, and preserve the drawing buffer so the last frame
     stays on screen after drawing stops. */
  params.desynchronized = params.desynchronized ?? false;
  params.preserveDrawingBuffer = params.preserveDrawingBuffer ?? true;

  let gl = canvas.getContext(webgl2 ? "webgl2" : "webgl", params) as AppGL | null;

  if (!gl) {
    gl = canvas.getContext("webgl") as AppGL | null;
    webgl2 = false;
  }

  if (!gl) {
    throw new Error("could not create a WebGL context");
  }

  const glctx: AppGL = gl;

  canvas.addEventListener("webglcontextlost", (e) => {
    glctx.contextBad = true;
    e.preventDefault();
  });

  canvas.addEventListener("webglcontextrestored", (e) => {
    glctx.contextGen++;
    glctx.contextBad = false;

    glctx.disable(glctx.BLEND);
    glctx.disable(glctx.DEPTH_TEST);
    glctx.disable(glctx.SCISSOR_TEST);

    glctx.bindTexture(glctx.TEXTURE_2D, null);
    glctx.bindFramebuffer(glctx.FRAMEBUFFER, null);
    glctx.drawBuffers([glctx.BACK]);
    //e.preventDefault();
  });

  gl.haveWebGL2 = !!webgl2;

  if (webgl2) {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("EXT_color_buffer_float");
  } else {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("WEBGL_color_buffer_float");
  }


  gl.texture_float = gl.getExtension("OES_texture_float");
  gl.texture_float_linear = gl.getExtension("OES_texture_float_linear");
  gl.float_blend = gl.getExtension("EXT_float_blend");
  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("ANGLE_instanced_arrays");
  gl.debugContextLoss = gl.getExtension("WEBGL_lose_context");
  gl.draw_buffers = gl.getExtension("WEBGL_draw_buffers");

  //used by context recovery code; which context "generation" we are on
  gl.contextGen = 0;
  gl.contextBad = false;

  function makeExtForward(k: string, v: unknown): void {
    let k2 = k;

    if (k2.endsWith("WEBGL")) {
      k2 = k2.slice(0, k2.length - 5);
      if (k2.endsWith("_")) {
        k2 = k2.slice(0, k2.length - 1);
      }

      try {
        if (typeof v === "function") {
          const fn = v as (...args: unknown[]) => unknown
          Reflect.set(glctx, k2, function (...args: unknown[]) {
            fn.call(glctx.draw_buffers, ...args);
          })
        } else {
          Reflect.set(glctx, k2, v);
        }
      } catch (error) {
        if (Reflect.get(glctx, k2) !== v) {
          console.warn("failed to bind property", k2);
        }
      }
    }
  }

  if (gl.draw_buffers) {
    const proto = Object.getPrototypeOf(gl.draw_buffers) as Record<string, unknown>
    for (let k in proto) {
      if (typeof k === "symbol") {
        continue;
      }

      makeExtForward(k, proto[k])
    }
  }

  gl.depth_texture = gl.getExtension("WEBGL_depth_texture");

  return gl;
}

function format_lines(script: string, errortext?: string): string {
  let linenr = getShaderErrorLine(errortext);

  var i = 1;

  var lines = script.split("\n")
  var maxcol = Math.ceil(Math.log(lines.length)/Math.log(10)) + 1;

  if (typeof linenr === "number") {
    let a = 0; //Math.max(linenr - 25, 0);
    let b = Math.min(linenr + 5, lines.length);

    i = a + 1;
    lines = lines.slice(a, b);
  }

  var s = "";

  for (var line of lines) {
    s += "" + i + ":";
    while (s.length < maxcol) {
      s += " "
    }

    if (i === linenr) {
      line = util.termColor(line + " ", "red");
    }

    s += line + "\n";
    i++;
  }

  return s;
}

function getShaderErrorLine(error?: string): number | undefined {
  let match = error ? error.match(/.*([0-9]+):([0-9]+): .*/) : null;

  let linenr: number | undefined;
  if (match) {
    linenr = parseInt(match[2]);
  }

  if (linenr === undefined || isNaN(linenr)) {
    linenr = undefined;
  }

  return linenr;
}

//
// loadShader
//
// 'shaderId' is the id of a <script> element containing the shader source string.
// Load this shader and return the WebGLShader object corresponding to it.
//
interface ShaderScript {
  text: string
  type: string | undefined
}

function loadShader(ctx: AppGL, shaderId: string, type?: string): WebGLShader | null {
  let domScript = document.getElementById(shaderId)

  let shaderScript: ShaderScript
  if (domScript instanceof HTMLScriptElement) {
    shaderScript = {text: domScript.text, type: domScript.type}
  } else {
    shaderScript = {text: shaderId, type}
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

  let shaderType: number
  if (shaderScript.type == "vertex")
    shaderType = ctx.VERTEX_SHADER;
  else if (shaderScript.type == "fragment")
    shaderType = ctx.FRAGMENT_SHADER;
  else {
    console.log("*** Error: invalid type " + shaderScript.type, shaderScript);
    return null;
  }

  // Create the shader object
  if (ctx == undefined || ctx == null || ctx.createShader == undefined)
    console.trace();

  var shader = ctx.createShader(shaderType);

  if (!shader) {
    return null;
  }

  // Load the shader source
  ctx.shaderSource(shader, shaderScript.text);

  // Compile the shader
  ctx.compileShader(shader);

  // Check the compile status
  let compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
  if (!compiled && !ctx.isContextLost()) {
    // Something went wrong during compilation; get the error
    let error = ctx.getShaderInfoLog(shader);

    console.log(format_lines(shaderScript.text, error ?? undefined));

    console.log("\nError compiling shader: ", error);

    ctx.deleteShader(shader);
    return null;
  }

  return shader;
}

var _safe_arrays: Float32Array[] = [
  new Float32Array(0),
  new Float32Array(1),
  new Float32Array(2),
  new Float32Array(3),
  new Float32Array(4),
];

export interface ShaderDef {
  vertex: string
  fragment: string
  attributes: string[]
  uniforms?: {[key: string]: ShaderUniform}
}

export type ShaderUniform = number | number[] | Float32Array | Matrix4 | Texture

export class ShaderProgram {
  vertexSource: string | undefined
  fragmentSource: string | undefined
  attrs: (string | number)[]
  rebuild: boolean | number
  uniformlocs: {[key: string]: WebGLUniformLocation | null}
  attrlocs: {[key: string]: number}
  uniforms: {[key: string]: ShaderUniform}
  gl: AppGL | undefined
  defines: {[key: string]: string | number | undefined}
  _def_shaders: {[key: string]: ShaderProgram}
  _use_def_shaders: boolean
  contextGen: number | undefined
  program: WebGLProgram | null | undefined
  vertexShader: WebGLShader | null | undefined
  fragmentShader: WebGLShader | null | undefined
  ready?: boolean
  promise?: Promise<void>
  then?: (...args: Parameters<Promise<void>['then']>) => Promise<unknown>

  constructor(gl: AppGL | undefined, vertex: string | undefined, fragment: string | undefined, attributes: (string | number)[]) {
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

  static fromDef(gl: AppGL | undefined, def: ShaderDef): ShaderProgram {
    let ret = new ShaderProgram(gl, def.vertex, def.fragment, def.attributes);

    if (def.uniforms) {
      for (let k in def.uniforms) {
        ret.uniforms[k] = def.uniforms[k];
      }
    }

    return ret;
  }

  static load_shader(path: string, attrs?: string[]): ShaderProgram {
    var ret = new ShaderProgram(undefined, undefined, undefined, ["position", "normal", "uv", "color", "id"]);
    ret.ready = false;

    ret.init = function (this: ShaderProgram, gl: AppGL) {
      if (!this.ready) {
        return;
      }

      return ShaderProgram.prototype.init.call(this, gl);
    }

    ret.promise = util.fetch_file(path).then(function (text: string) {
      console.log("loaded file");

      var lowertext = text.toLowerCase();
      var vshader = text.slice(0, lowertext.search("//fragment"));
      var fshader = text.slice(lowertext.search("//fragment"), text.length);

      ret.vertexSource = vshader;
      ret.fragmentSource = fshader;
      ret.ready = true;
    });

    ret.then = function (this: ShaderProgram, ...args: Parameters<Promise<void>['then']>) {
      return this.promise!.then(...args);
    }

    return ret;
  }

  _get_def_shader(gl: AppGL, defines?: {[key: string]: string | number | undefined}): ShaderProgram {
    let defs: {[key: string]: string | number | undefined} = {};

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

    function repl(src: string): string {
      let i = src.search("precision");
      let i2 = i + src.slice(i, src.length).search("\n");

      return src.slice(0, i2) + "\n" + s + "\n" + src.slice(i2, src.length) + "\n";
    }

    let vertex = this.vertexSource !== undefined ? repl(this.vertexSource) : undefined;
    let fragment = this.fragmentSource !== undefined ? repl(this.fragmentSource) : undefined;

    let sp = new ShaderProgram(gl, vertex, fragment, this.attrs);

    sp.uniforms = this.uniforms;
    sp._use_def_shaders = false;

    this._def_shaders[s] = sp;

    sp.init(gl);

    return sp;
  }

  init(gl: AppGL): ShaderProgram | null | void {
    if (this._use_def_shaders) {
      return this._get_def_shader(gl).init(gl);
    }

    //clear cached uniforms and attribute locations

    this.gl = gl;
    this.rebuild = false;
    this.contextGen = gl.contextGen;

    var vshader = this.vertexSource, fshader = this.fragmentSource;

    if (vshader === undefined || fshader === undefined) {
      console.warn("ShaderProgram.init: missing shader source");
      return null;
    }

    // create our shaders
    var vertexShader = loadShader(gl, vshader, "vertex");
    var fragmentShader = loadShader(gl, fshader, "fragment");

    // Create the program object
    var program = gl.createProgram();

    if (!program || !vertexShader || !fragmentShader) {
      return null;
    }

    // Attach our two shaders to the program
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    var attribs = this.attrs;

    // Bind attributes
    for (var i = 0; i < attribs.length; ++i) {
      gl.bindAttribLocation(program, i, "" + attribs[i]);
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

  on_gl_lost(newgl: AppGL): void {
    this.rebuild = 1;
    this.gl = newgl;
    this.program = undefined;

    this.uniformlocs = {};
  }

  destroy(gl: AppGL | undefined = this.gl): void {
    if (!gl) {
      if (this.vertexShader || this.fragmentShader || this.program) {
        console.error("Could not destroy a shader: no valid gl reference");
      }

      return;
    }

    for (let k in this._def_shaders) {
      let shader = this._def_shaders[k];
      shader.destroy(gl);
    }

    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
    }

    if (this.fragmentShader) {
      gl.deleteShader(this.fragmentShader);
    }

    if (this.program) {
      gl.deleteProgram(this.program);
    }

    this.program = this.vertexShader = this.fragmentShader = undefined;
    this.rebuild = 1;
  }

  uniformloc(name: string): WebGLUniformLocation | null | undefined {
    this._checkContextGen();

    let gl = this.gl;
    if (!gl) {
      return undefined;
    }

    if (this._use_def_shaders) {
      return this._get_def_shader(gl).uniformloc(name);
    }

    if (!this.program) {
      return undefined;
    }

    if (this.uniformlocs[name] === undefined || this.uniformlocs[name] === null) {
      this.uniformlocs[name] = gl.getUniformLocation(this.program, name);
    }

    return this.uniformlocs[name];
  }

  attrloc(name: string): number | undefined {
    this._checkContextGen();

    if (this._use_def_shaders) {
      let gl = this.gl;
      if (!gl) {
        return undefined;
      }
      return this._get_def_shader(gl).attrloc(name);
    }

    return this.attrlocs[name];
  }

  _checkContextGen(gl: AppGL | undefined = this.gl): void {
    if (!gl) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.rebuild = true;

      this.program = undefined;
      this.vertexShader = undefined;
      this.fragmentShader = undefined;
      this.uniformlocs = {};
      this.attrlocs = {};

      this._def_shaders = {};

      if (!this._use_def_shaders) {
        this.init(gl);
      }
    }
  }

  bind(
    gl: AppGL,
    uniforms?: {[key: string]: ShaderUniform},
    defines?: {[key: string]: string | number | undefined}
  ): ShaderProgram | undefined {
    if (gl.contextBad) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.uniformlocs = {};
      this.attrlocs = {};
      this.program = undefined;
      this.vertexShader = undefined;
      this.fragmentShader = undefined;

      this.rebuild = true;
    }

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

    if (!this.program) {
      if (Math.random() > 0.99) {
        console.error("Shader error!");
      }

      return
    }

    function setv(dst: Float32Array, src: ArrayLike<number>, n: number): void {
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
          if (loc) {
            v.setUniform(gl, loc);
          }
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

export interface GPUVertexAttrArgs {
  target?: number
  type?: number
  perfHint?: number
  elemSize?: number
  normalized?: boolean
}

type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array

export class GPUVertexAttr {
  type: number | undefined
  size: number | undefined
  buf: WebGLBuffer | undefined
  data: TypedArray | undefined
  perfhint: number | undefined
  perfHint: number | undefined
  elemSize: number | undefined
  target: number | undefined
  normalized: boolean
  contextGen: number | undefined

  constructor() {
    this.type = undefined;
    this.size = undefined;
    this.buf = undefined;
    this.data = undefined;
    this.perfhint = undefined;
    this.elemSize = undefined;
    this.normalized = false;
    this.contextGen = undefined;
  }

  upload(
    gl: AppGL,
    args: GPUVertexAttrArgs,
    data: ArrayLike<number> | ArrayBuffer | TypedArray
  ): GPUVertexAttr {
    let {target, type, perfHint, elemSize, normalized} = args;

    if (this.buf && this.contextGen !== gl.contextGen) {
      console.warn("Context loss in GPUVertexAttr detected!", this.data);
      this.buf = undefined;
    }

    this.contextGen = gl.contextGen;

    perfHint = perfHint ?? gl.STATIC_DRAW;
    target = target ?? gl.ARRAY_BUFFER;
    type = type ?? gl.FLOAT;
    normalized = normalized ?? false;
    elemSize = elemSize ?? 1;

    this.elemSize = elemSize;
    this.type = type;
    this.target = target;
    this.perfHint = perfHint;
    this.normalized = normalized;

    type TypedArrayCtor = {
      new (data: ArrayLike<number> | ArrayBuffer): TypedArray
    }
    let cls: TypedArrayCtor = Float32Array
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

    let arr: TypedArray
    if (data instanceof cls) {
      arr = data
    } else {
      arr = new cls(data)
    }

    this.data = new cls(arr)

    if (this.buf && this.size && arr.length / elemSize >= this.size) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    this.size = ~~(arr.length / elemSize);

    if (!this.buf) {
      this.buf = gl.createBuffer();
    }

    gl.bindBuffer(target, this.buf);
    gl.bufferData(target, arr, perfHint);

    return this;
  }

  bind(gl: AppGL, idx: number): void {
    if (gl.contextBad) {
      return;
    }

    if (this.buf && this.contextGen !== gl.contextGen) {
      this.buf = undefined;
      if (this.data) {
        this.upload(gl, this, this.data);
      }
    }

    if (this.target === undefined || this.type === undefined || this.elemSize === undefined) {
      return;
    }

    //console.error(idx, this.elemSize, this.type, this.normalized, this.buf);
    gl.bindBuffer(this.target, this.buf ?? null);

    gl.enableVertexAttribArray(idx);
    gl.vertexAttribPointer(idx, this.elemSize, this.type, this.normalized, 0, 0);
  }

  destroy(gl: AppGL): GPUVertexAttr | undefined {
    if (this.contextGen !== gl.contextGen) {
      return;
    }

    if (this.buf !== undefined) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    return this;
  }
}

export class RenderBuffer {
  _layers: {[name: string]: GPUVertexAttr}

  constructor() {
    this._layers = {};
  }

  get(gl: AppGL | undefined, name: string): GPUVertexAttr {
    let existing = Reflect.get(this, name)
    if (existing instanceof GPUVertexAttr) {
      return existing
    }

    let buf = new GPUVertexAttr();

    this._layers[name] = buf;
    Reflect.set(this, name, buf);

    return buf;
  }

  destroy(gl: AppGL, name?: string): void {
    if (name === undefined) {
      for (var k in this._layers) {
        this._layers[k].destroy(gl);

        delete this._layers[k];
        Reflect.deleteProperty(this, k);
      }
    } else {
      if (this._layers[name] === undefined) {
        console.trace("WARNING: gl buffer no in RenderBuffer!", name, gl);
        return;
      }

      this._layers[name].destroy(gl);

      delete this._layers[name];
      Reflect.deleteProperty(this, name);
    }
  }
}

const TEXTURE_2D = 3553;

export interface TextureCreateParams {
  target?: number
  level?: number
  internalformat?: number
  format?: number
  type?: number
  source?: TexImageSource | WebGLTexture | null
  width?: number
  height?: number
  border?: number
  mipmaps?: boolean
}

export class Texture {
  texture: WebGLTexture | undefined
  target: number
  createParams: TextureCreateParams
  contextGen: number | undefined
  gl: AppGL | undefined
  createParamsList: (number | TexImageSource | WebGLTexture | null | undefined)[]
  _storedTex: ArrayBufferView | TexImageSource | ArrayBuffer | null | undefined
  _params: {[param: number]: number}

  //3553 is gl.TEXTURE_2D
  constructor(texture?: WebGLTexture, gl?: AppGL, target = 3553) {
    //console.warn("new webgl.Texture()", texture, gl !== undefined);

    this.texture = texture;
    this.target = target;

    this.createParams = {
      target: TEXTURE_2D
    };

    this.contextGen = gl ? gl.contextGen : 0;
    this.gl = gl;

    this.createParamsList = [TEXTURE_2D];
    this._storedTex = undefined;
    this.contextGen = gl ? gl.contextGen : undefined;

    this._params = {};
  }

  static load(
    gl: AppGL,
    width: number,
    height: number,
    data: ArrayBufferView | TexImageSource | ArrayBuffer | null,
    format: number = gl.RGBA,
    useMipMaps = true,
    target: number = gl.TEXTURE_2D
  ): Texture {
    let tex = gl.createTexture();

    gl.bindTexture(target, tex);

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, format, width, height, 0, format, gl.FLOAT, data);
    } else if (use_byte_width && ArrayBuffer.isView(data)) {
      gl.texImage2D(target, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    } else if (data === null || ArrayBuffer.isView(data)) {
      gl.texImage2D(target, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    } else if (!(data instanceof ArrayBuffer)) {
      gl.texImage2D(target, 0, format, format, gl.UNSIGNED_BYTE, data);
    }

    if (useMipMaps) {
      gl.generateMipmap(target);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }

    let ret = new Texture(tex ?? undefined, gl, target);

    ret.createParams.target = target;
    ret.createParams.width = width;
    ret.createParams.height = height;
    ret.createParams.mipmaps = true;

    ret.defaultParams(gl, tex ?? undefined, target);

    ret.contextGen = gl.contextGen;
    ret._storedTex = data;

    return ret;
  }

  static defaultParams(gl: AppGL, tex: WebGLTexture, target: number = gl.TEXTURE_2D): void {
    throw new Error("static defaultParams cannot handle context loss; use method instead");
    gl.bindTexture(target, tex);

    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  makeMipMaps(gl: AppGL): void {
    if (!this.gl) {
      this.gl = gl;
    }

    this._checkContextGen(gl);
    this.createParams.mipmaps = true;

    gl.bindTexture(this.target, this.texture ?? null);
    gl.generateMipmap(this.target);
    this.texParameteri(gl, this.target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  texParameteri(gl: AppGL, target: number, param: number, value: number): Texture {
    this._params[param] = value;

    gl.texParameteri(target, param, value);
    return this;
  }

  getParameter(gl: AppGL, param: number): number {
    return this._params[param];
  }

  _checkContextGen(gl: AppGL | undefined = this.gl): void {
    if (!gl) {
      return;
    }

    if (gl.contextGen !== this.contextGen) {
      console.warn("context update in texture detected");

      this.texture = gl.createTexture() ?? undefined;
      gl.bindTexture(this.target, this.texture ?? null);

      this.contextGen = gl.contextGen;

      if (this._storedTex && this.createParams.width !== undefined && this.createParams.height !== undefined) {
        this.load(gl, this.createParams.width, this.createParams.height, this._storedTex, this.target);

        if (this.createParams.mipmaps) {
          this.makeMipMaps(gl);
        }
      }

      for (let k in this._params) {
        gl.texParameteri(this.target, parseInt(k), this._params[k]);
      }
    }
  }

  _texImage2D1(
    gl: AppGL,
    target: number,
    level: number,
    internalformat: number,
    format: number,
    type: number,
    source: TexImageSource | null
  ): Texture {

    gl.bindTexture(target, this.texture ?? null);
    if (source) {
      gl.texImage2D(target, level, internalformat, format, type, source);
    }

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

    if (source) {
      this._storedTex = source;
    }

    return this;
  }

  _texImage2D2(
    gl: AppGL,
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    format: number,
    type: number,
    source: ArrayBufferView | WebGLTexture | null
  ): Texture {
    gl.bindTexture(target, this.texture ?? null);

    //if (source === undefined || source === null) {
    //  gl.texImage2D(target, level, internalformat, width, height, border, format, type, undefined);
    //} else {
    let pixels: ArrayBufferView | null = source === null || ArrayBuffer.isView(source) ? source : null
    gl.texImage2D(target, level, internalformat, width, height, border, format, type, pixels);
    //}

    this.createParams = {
      target, level, internalformat, format, type, source, width, height, border
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source, width, height, border
    ];

    return this;
  }

  texImage2D(
    gl: AppGL,
    target: number,
    level: number,
    internalformat: number,
    a: number | TexImageSource | null,
    b: number | null,
    c?: TexImageSource | number | null,
    d?: number,
    e?: number,
    f?: ArrayBufferView | WebGLTexture | null
  ): Texture {
    this.contextGen = gl.contextGen;

    if (arguments.length === 7) {
      return this._texImage2D1(
        gl,
        target,
        level,
        internalformat,
        a as number,
        b as number,
        c as TexImageSource | null
      );
    } else {
      return this._texImage2D2(
        gl,
        target,
        level,
        internalformat,
        a as number,
        b as number,
        c as number,
        d as number,
        e as number,
        f as ArrayBufferView | WebGLTexture | null
      );
    }
  }

  copy(gl: AppGL, copy_data = false): Texture {
    let tex = new Texture();

    tex.contextGen = this.contextGen;
    tex.texture = gl.createTexture() ?? undefined;
    tex.createParams = Object.assign({}, this.createParams);
    tex.createParamsList = this.createParamsList.concat([]);

    gl.bindTexture(this.createParams.target ?? gl.TEXTURE_2D, tex.texture ?? null);

    if (!copy_data) {
      let p = this.createParams;

      tex.texImage2D(
        gl,
        p.target ?? gl.TEXTURE_2D,
        p.level ?? 0,
        p.internalformat ?? gl.RGBA,
        p.format ?? gl.RGBA,
        p.type ?? gl.UNSIGNED_BYTE,
        null
      );
    } else {
      this.copyTexTo(gl, tex);
    }

    for (let k in this._params) {
      let key = parseInt(k);
      let val = this._params[key];

      gl.texParameteri(this.createParams.target ?? gl.TEXTURE_2D, key, val);
    }

    return tex;
  }

  copyTexTo(gl: AppGL, b: Texture): Texture | undefined {
    if (this.texture === undefined) {
      return;
    }

    let p = this.createParams;

    gl.bindTexture(p.target ?? gl.TEXTURE_2D, b.texture ?? null);
    b.texImage2D(
      gl,
      p.target ?? gl.TEXTURE_2D,
      p.level ?? 0,
      p.internalformat ?? gl.RGBA,
      p.width ?? 0,
      p.height ?? 0,
      p.border ?? 0,
      p.format ?? gl.RGBA,
      p.type ?? gl.UNSIGNED_BYTE,
      this.texture
    );

    return this;
  }

  destroy(gl: AppGL | undefined = this.gl): void {
    if (!gl || gl.contextBad || this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in texture.destroy()!");

      this.texture = undefined;
      return;
    }

    gl.deleteTexture(this.texture ?? null);
  }

  static getInternalFormal(gl: AppGL, format: number, type: number): number {
    if (!gl.haveWebGL2) {
      return format;
    }

    switch (format) {
      case gl.RGBA:
        if (type === gl.UNSIGNED_BYTE) {
          return gl.RGBA8UI;
        } else if (type === gl.FLOAT) {
          return gl.RGBA32F;
        }
        break;
    }

    return format;
  }

  load(
    gl: AppGL,
    width: number,
    height: number,
    data: ArrayBufferView | TexImageSource | ArrayBuffer | null,
    format: number = gl.RGBA,
    useMipMaps = true,
    target: number = gl.TEXTURE_2D
  ): Texture {
    if (this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in texture!");
      this.contextGen = gl.contextGen;
      this.texture = undefined;
    }

    let tex = this.texture !== undefined ? this.texture : gl.createTexture() ?? undefined;

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    this.contextGen = gl.contextGen;
    this.texture = tex;

    this.createParams = {width, height, target, border: 0, level: 0, format: format, internalformat: format};

    gl.bindTexture(target, tex ?? null);

    let type = data instanceof Float32Array ? gl.FLOAT : gl.UNSIGNED_BYTE;
    let internal_format = Texture.getInternalFormal(gl, format, type);

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, internal_format, width, height, 0, format, gl.FLOAT, data);
    } else if (use_byte_width && (data === null || ArrayBuffer.isView(data))) {
      gl.texImage2D(target, 0, internal_format, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    } else if (data === null || ArrayBuffer.isView(data)) {
      gl.texImage2D(target, 0, internal_format, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    } else if (!(data instanceof ArrayBuffer)) {
      gl.texImage2D(target, 0, internal_format, format, gl.UNSIGNED_BYTE, data);
    }

    if (data) {
      this._storedTex = data;
    }

    this.defaultParams(gl, tex, target);

    if (useMipMaps) {
      this.makeMipMaps(gl);
    }

    return this;
  }

  defaultParams(gl: AppGL, tex: WebGLTexture | undefined, target: number = gl.TEXTURE_2D): void {
    gl.bindTexture(target, tex ?? null);

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  bind(gl: AppGL, uniformloc?: WebGLUniformLocation | null, slot = 0): void {
    if (gl.contextBad) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      console.warn("Dead gl texture", this.contextGen, gl.contextGen);
      return;
    }

    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(this.target, this.texture ?? null);

    if (uniformloc !== undefined) {
      gl.uniform1i(uniformloc, slot);
    }
  }
}


export interface DrawMatsJSON {
  cameramat: number[]
  persmat: number[]
  rendermat: number[]
  normalmat: number[]
  icameramat: number[]
  ipersmat: number[]
  irendermat: number[]
  inormalmat: number[]
}

export interface CameraJSON extends DrawMatsJSON {
  fovy: number
  near: number
  far: number
  aspect: number | undefined
  target: number[]
  pos: number[]
  up: number[]
}

//cameras will derive from this class
export class DrawMats {
  cameramat: Matrix4
  persmat: Matrix4
  rendermat: Matrix4
  normalmat: Matrix4
  icameramat: Matrix4
  ipersmat: Matrix4
  irendermat: Matrix4
  inormalmat: Matrix4
  aspect: number | undefined

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

  regen_mats(aspect: number): DrawMats {
    this.aspect = aspect;

    this.normalmat.load(this.cameramat).makeRotationOnly();

    this.icameramat.load(this.cameramat).invert();
    this.ipersmat.load(this.cameramat).invert();
    this.irendermat.load(this.cameramat).invert();
    this.inormalmat.load(this.normalmat).invert();

    return this;
  }

  toJSON(): DrawMatsJSON {
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

  loadJSON(obj: DrawMatsJSON): DrawMats {
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
  fovy: number
  pos: Vector3
  target: Vector3
  up: Vector3
  near: number
  far: number

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

  toJSON(): CameraJSON {
    var base = super.toJSON();

    return {
      ...base,
      fovy: this.fovy,
      near: this.near,
      far: this.far,
      aspect: this.aspect,
      target: Array.from(this.target),
      pos: Array.from(this.pos),
      up: Array.from(this.up),
    }
  }

  loadJSON(obj: CameraJSON): Camera {
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

  regen_mats(aspect: number): DrawMats {
    this.aspect = aspect;

    this.persmat.makeIdentity();
    this.persmat.perspective(this.fovy, aspect, this.near, this.far);

    this.cameramat.makeIdentity();
    this.cameramat.lookat(this.pos, this.target, this.up);    //this.cameramat.translate(this.pos[0], this.pos[1], this.pos[2]);

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    //this.rendermat.load(this.cameramat).multiply(this.persmat);

    return super.regen_mats(aspect); //will calculate iXXXmat for us
  }
}
