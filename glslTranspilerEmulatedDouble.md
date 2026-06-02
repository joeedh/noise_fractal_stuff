Plan: GLSL ES 3.0 → GLSL ES 3.0 double-emulation transpiler

 Context

 The app is a WebGL fractal explorer whose patterns (Mandelbrot, Newton, etc.) are
 mantissa-limited: shaders run in fp32 (precision highp float, ~24-bit mantissa, ~7
 decimal digits), so deep zoom — where scale/SLIDERS[6] reaches 1e6 and beyond —
 pixelates because there aren't enough mantissa bits to address pixels. WebGL2 GLSL ES
 has no usable double, and a hardware fp64 path does not exist in the browser.

 The goal is a source-to-source GLSL transpiler that lets pattern authors write
 natural double/dvec2 code and lowers it to double-single (df64) emulation:
 each double is represented as a pair of fp32 (hi + lo), and arithmetic is replaced
 with error-free-transform function calls, yielding ~46–48 effective mantissa bits. This
 buys deep zoom on the existing WebGL2 backend (and transpiles cleanly to WGSL later,
 since WGSL also lacks f64).

 Because GLSL has no operator overloading, the core of the work is a type-driven
 dispatch pass that fakes overloading for one new type family (double/dvec/dmat).
 Everything else (lexer, parser, printer) is conventional and small — GLSL ES 3.0 has no
 user typedefs, so the usual C parsing ambiguity is absent.

 Shaders in this codebase are JS-generated GLSL strings assembled in
 app/pattern/pattern_shaders.ts (buildShader()), already with per-target header
 variants (webgl1/webgl2) and #define-based codegen, and already cached by define-hash
 (ShaderProgram._get_def_shader / Pattern._lastShaderHash). The transpiler runs in
 TS at shader-assembly time and slots in as one more pass over the generated string.

 Module layout

 New self-contained module at app/glsl/ — pure string→string, no app deps, independently
 testable:

 app/glsl/
   token.ts          token kinds + Token type (with line/col)
   lexer.ts          string → Token[]
   ast.ts            AST node interfaces + discriminated-union Node type
   parser.ts         recursive-descent Token[] → AST
   glsltype.ts       GLSL type model (scalar/vector/matrix/struct/array) + helpers
   typeinfer.ts      scoped symbol table + bottom-up expression typing
   lower_df64.ts     double→vec2-pair lowering transform
   runtime_df64.ts   df64 GLSL library (string) + supported-builtin table
   printer.ts        AST → GLSL string
   transpile.ts      top-level entry, options, TranspileError, UniformManifest
   *.test.ts         vitest, colocated (matches vitest.config `app/**/*.test.ts`)

 Conventions (.prettierrc / tsconfig.json): no semicolons, single quotes, 2-space,
 trailingComma: es5, no bracket spacing, relative imports ending .js,
 strict/strictNullChecks, zero any. pnpm typecheck must stay at 0 errors.

 Stage responsibilities

 1. Lexer (token.ts, lexer.ts)
 - Token kinds: identifier, keyword, int/uint/float/double literals (handle lf/LF,
 f, u, hex), full operator set (+= ++ << <<= && == <= …), punctuation, EOF.
 - line/col on every token for error messages; skip // and /* */ comments.
 - Assume input is already preprocessed (the app runs its own #define/#if codegen
 first). If a # directive survives, raise TranspileError with a clear message rather
 than attempting to parse it.

 2. AST (ast.ts)
 - Expressions: IntLit, FloatLit, DoubleLit, BoolLit, Ident, Binary, Unary
 (pre/post), Ternary, Call (constructors + builtins + user funcs), Index,
 Member (incl. swizzles), Assign, Comma.
 - Statements: VarDecl (qualifiers, type, multiple declarators, array spec, init),
 ExprStmt, If, For, While, DoWhile, Return, Break, Continue, Discard,
 Block.
 - Top-level: FunctionDef, FunctionProto, StructDecl, GlobalVarDecl
 (uniform/in/out/const + layout + precision), PrecisionStmt.
 - Every node carries resolvedType?: GLSLType, filled by typeinfer.

 3. Parser (parser.ts)
 - Recursive descent; precedence-climbing for the C-like operator ladder + ternary +
 sequence comma.
 - Decl-vs-expr disambiguation via a known-type-name set (builtins + declared structs) —
 unambiguous since GLSL has no user typedefs.
 - Both array spellings (float a[4] / float[4] a); constructors parse as Call and are
 resolved in typeinfer. Qualifier parsing: const in out uniform, layout(...), flat,
 precision.

 4. Type model + inference (glsltype.ts, typeinfer.ts) — the load-bearing stage
 - GLSLType: base kind (float/int/uint/bool/double), rows/cols, struct ref, array len.
 - Scoped symbol table: global → function params → block → for-init. Function signatures
 with overloads (builtins are overloaded by arg type).
 - Bottom-up expression typing implementing GLSL implicit rules: int→float→double
 promotion, scalar→vector broadcast (dvec2 * double), swizzle arity (.xy/.xz),
 member/index, comparison→bool, ternary join, constructor result types.
 - Output: every expression annotated with resolvedType. This is what tells the lowering
 pass exactly which ops touch a double — a missed promotion silently drops to fp32, so
 this stage gets the heaviest test coverage.

 5. Lowering (lower_df64.ts)
 - Type map: double → vec2 (hi, lo); dvec2/3/4 → struct { vec2 x,y[,z[,w]]; };
 dmatN → struct of df columns. (Structs chosen over packed vec4 for readability; GLSL
 structs can't be swizzled, so df-vector .xy lowers to member access.)
 - Rewrites driven by resolvedType:
   - arithmetic / compare / unary / compound-assign on df operands →
 df_add/df_sub/df_mul/df_neg/df_lt/…
   - mixed df⊕fp32 → wrap the fp32 side in df_fromFloat(x)
   - constructors & literals → compile-time split in JS (hi=Math.fround(x); lo=Math.fround(x-hi)), emitted as vec2(hi,
 lo)
   - df-vector swizzles/indexing → struct member access
   - builtin calls on doubles → df versions; hard-error with source line on any
 unsupported double builtin
 - Interface boundary: uniform double c; → uniform vec2 c_df; (same for in/out
 varyings). Emit a UniformManifest ({originalName, splitName, kind}[]) from
 transpile() so the app's uniform-setter can upload (hi, lo). Splitting only happens
 where a double meets the GPU boundary; locals stay df.

 6. Runtime lib (runtime_df64.ts)
 - Canonical double-float primitives (Thall "Extended-Precision FP for GPU Computation" /
 DSFUN90): twoSum, quickTwoSum, split (2^12+1 = 4097), twoProd (Dekker, no FMA),
 then df_add/sub/mul/div/sqrt/neg/abs/floor/cmp/fromFloat/toFloat, plus df_cmul
 (complex multiply — the fractal inner loops are z = cmul(z,z) + c).
 - A supported-builtin table the lowering pass consults.
 - Injected at top of the fragment string, after a forced precision highp float;.

 7. Printer (printer.ts) — AST → GLSL string, readable output for debugging.

 8. Entry (transpile.ts) —
 transpile(src: string, opts) → {code: string, uniforms: UniformManifest[]};
 TranspileError carrying line/col.

 Integration (after the module stands alone)

 - Hook the pass into the shader assembly in app/pattern/pattern_shaders.ts
 (buildShader()), gated by an opt-in (e.g. a useDouble pattern flag / define) so
 fp32-only patterns are untouched.
 - Cache transpiled output by the existing define-hash so parse/lower cost stays off the
 render loop (reuse _get_def_shader / _lastShaderHash machinery).
 - Teach ShaderProgram.bind (in app/webgl/webgl.ts) — or a thin wrapper — to consume
 the UniformManifest and split JS doubles into (hi, lo) pairs when uploading.

 Scope boundaries (v1)

 - Supported double ops: + - * / unary- == != < <= > >=, and builtins
 abs floor min max mix sqrt length dot + df_cmul.
 - No transcendentals on doubles (sin/cos/exp/log/pow/atan) — error out clearly;
 patterns keep those in fp32.
 - Interface splitting handled for uniforms + varyings; double vertex attributes
 deferred unless a pattern needs them.
 - highp forced. Documented caveat: twoProd uses the Dekker split (no FMA in WebGL),
 which assumes round-to-nearest and no overflow/denormal-flush in 4097.0*a; some mobile
 GPUs that flush denormals or run sub-highp degrade the low word. Effective precision is
 ~46–48 mantissa bits, not a true f64.

 Build order (each milestone independently green)

 1. Lexer + token tests.
 2. AST + parser + parse/print round-trip tests (expressions, decls, functions, control flow).
 3. Type model + inference + typing assertions.
 4. df64 runtime lib + standalone JS numerical-correctness tests (prove the math first).
 5. Lowering pass + golden + end-to-end numerical tests.
 6. Uniform-manifest / interface splitting.
 7. App integration (buildShader hook, define-hash caching, uniform splitting) with the
 Mandelbrot inner loop (app/patterns/mandelbrot.ts) as the real-world proof.

 Critical files

 - New: everything under app/glsl/ (listed above).
 - Modified at integration: app/pattern/pattern_shaders.ts (buildShader),
 app/webgl/webgl.ts (ShaderProgram.bind uniform splitting),
 app/patterns/mandelbrot.ts (first opt-in pattern).
 - Reused machinery: define-hash caching in app/webgl/webgl.ts
 (ShaderProgram._get_def_shader) and app/pattern/pattern.ts
 (shaderNeedsCompile / _lastShaderHash).

 Verification

 - Unit (pnpm test, vitest):
   - Lexer/parser: parse→print round-trip idempotence over a GLSL corpus.
   - Typeinfer: assert resolvedType on targeted expressions (promotion, broadcast,
 swizzle, overload selection).
   - Lowering: golden tests (input GLSL → expected lowered GLSL).
   - Numerical: port twoSum/twoProd/df_* to JS and compare against native f64 over
 randomized inputs for add/sub/mul/div/sqrt/cmul; assert ~46–48-bit agreement.
   - Negative: unsupported double builtin / surviving # directive → TranspileError
 with correct line/col.
 - Typecheck: pnpm typecheck (tsgo) stays at 0 errors.
 - End-to-end (manual / e2e): opt the Mandelbrot pattern into useDouble, run
 pnpm dev, deep-zoom past the fp32 pixelation threshold (large scale) and confirm the
 image stays crisp where the fp32 path breaks down. The existing Playwright pattern spec
 (tests/e2e/patterns.spec.ts) should still pass (renders non-trivial content) for the
 double-enabled pattern.

 Open scope questions (can adjust before build)

 - df-vector representation: struct (readable, chosen) vs packed vec4 (fewer temps,
 messier).
 - Whether to include div/sqrt in v1 (currently yes) and whether any transcendentals
 are needed by target patterns.
 - Note: requested filename was emulatedDoubleTranspilerPlan.md; this content can be
 copied there as the first implementation step (plan mode restricts edits to this plan
 file).