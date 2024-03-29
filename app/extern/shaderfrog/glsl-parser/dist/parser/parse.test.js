"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var peggy_1 = __importDefault(require("peggy"));
var util_1 = __importDefault(require("util"));
var generator_1 = __importDefault(require("./generator"));
var utils_1 = require("./utils");
var preprocessor_1 = require("../preprocessor/preprocessor");
var generator_2 = __importDefault(require("../preprocessor/generator"));
var fileContents = function (filePath) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, filePath)).toString();
};
// Preprocessor setup
var preprocessorGrammar = fileContents('../preprocessor/preprocessor-grammar.pegjs');
var preprocessParser = peggy_1.default.generate(preprocessorGrammar, { cache: true });
var preprocess = function (program) {
    var ast = preprocessParser.parse(program);
    (0, preprocessor_1.preprocessAst)(ast);
    return (0, generator_2.default)(ast);
};
var debugEntry = function (bindings) {
    return Object.entries(bindings).map(function (_a) {
        var k = _a[0], v = _a[1];
        return "\"" + k + "\": (" + v.references.length + " references): " + v.references
            .map(function (r) { return r.type; })
            .join(', ');
    });
};
var debugScopes = function (scopes) {
    return scopes.map(function (s) { return ({
        name: s.name,
        bindings: debugEntry(s.bindings),
        functions: debugEntry(s.functions),
    }); });
};
var grammar = fileContents('./glsl-grammar.pegjs');
var testFile = fileContents('../glsltest.glsl');
var parser = peggy_1.default.generate(grammar, { cache: true });
var middle = /\/\* start \*\/((.|[\r\n])+)(\/\* end \*\/)?/m;
var debugProgram = function (program) {
    var ast = parser.parse(program);
    console.log(util_1.default.inspect(ast.program, false, null, true));
};
var debugAst = function (ast) {
    console.log(util_1.default.inspect(ast.program, false, null, true));
};
var debugStatement = function (stmt) {
    var program = "void main() {/* start */" + stmt + "/* end */}";
    var ast = parser.parse(program);
    console.log(util_1.default.inspect(ast.program[0].body.statements[0], false, null, true));
};
var expectParsedStatement = function (src, options) {
    if (options === void 0) { options = {}; }
    var program = "void main() {/* start */" + src + "/* end */}";
    var ast = parser.parse(program, options);
    var glsl = (0, generator_1.default)(ast);
    if (glsl !== program) {
        console.log(util_1.default.inspect(ast.program[0], false, null, true));
        // @ts-ignore
        expect(glsl.match(middle)[1]).toBe(src);
    }
};
var parseStatement = function (src, options) {
    if (options === void 0) { options = {}; }
    var program = "void main() {" + src + "}";
    return parser.parse(program, options);
};
var expectParsedProgram = function (sourceGlsl, options) {
    if (options === void 0) { options = {}; }
    var ast = parser.parse(sourceGlsl, options);
    var glsl = (0, generator_1.default)(ast);
    if (glsl !== sourceGlsl) {
        console.log(util_1.default.inspect(ast, false, null, true));
        expect(glsl).toBe(sourceGlsl);
    }
};
test('scope bindings and type names', function () {
    var ast = parser.parse("\nfloat a, b = 1.0, c = a;\nvec2 texcoord1, texcoord2;\nvec3 position;\nvec4 myRGBA;\nivec2 textureLookup;\nbvec3 less;\nfloat arr1[5] = float[5](3.4, 4.2, 5.0, 5.2, 1.1);\nvec4[2] arr2[3]; \nvec4[3][2] arr3;\nvec3 fnName() {}\nstruct light {\n  float intensity;\n  vec3 position;\n};\ncoherent buffer Block {\n  readonly vec4 member1;\n  vec4 member2;\n};");
    // debugAst(ast);
    expect(Object.keys(ast.scopes[0].bindings)).toEqual([
        'a',
        'b',
        'c',
        'texcoord1',
        'texcoord2',
        'position',
        'myRGBA',
        'textureLookup',
        'less',
        'arr1',
        'arr2',
        'arr3',
        'Block',
    ]);
    expect(Object.keys(ast.scopes[0].functions)).toEqual(['fnName']);
    expect(Object.keys(ast.scopes[0].types)).toEqual(['light']);
});
test('scope references', function () {
    var ast = parser.parse("\nfloat a, b = 1.0, c = a;\nmat2x2 myMat = mat2( vec2( 1.0, 0.0 ), vec2( 0.0, 1.0 ) );\nstruct {\n  float s;\n  float t;\n} structArr[];\nstruct structType {\n  float s;\n  float t;\n};\nstructType z;\n\nfloat shadowed;\nfloat reused;\nfloat unused;\nvoid useMe() {}\nvec3 fnName(float arg1, vec3 arg2) {\n  float shadowed = arg1;\n  structArr[0].x++;\n\n  if(true) {\n    float x = shadowed + 1 + reused;\n  }\n\n  {\n    float compound;\n    compound = shadowed + reused;\n  }\n\n  {\n    float compound;\n    compound = shadowed + reused + compound;\n  }\n\n  useMe();\n}");
    expect(ast.scopes[0].bindings.a.references).toHaveLength(2);
    expect(ast.scopes[0].bindings.b.references).toHaveLength(1);
    expect(ast.scopes[0].bindings.c.references).toHaveLength(1);
    expect(ast.scopes[0].bindings.myMat.references).toHaveLength(1);
    expect(ast.scopes[0].bindings.structArr.references).toHaveLength(2);
    expect(ast.scopes[0].bindings.shadowed.references).toHaveLength(1);
    expect(ast.scopes[0].types.structType.references).toHaveLength(2);
    expect(ast.scopes[0].functions.useMe.references).toHaveLength(2);
    expect(ast.scopes[2].bindings.arg1.references).toHaveLength(2);
    expect(ast.scopes[2].bindings.arg2.references).toHaveLength(1);
    expect(ast.scopes[2].bindings.shadowed.references).toHaveLength(4);
    // reused - used in inner scope
    expect(ast.scopes[0].bindings.reused.references).toHaveLength(4);
    // compound - used in first innermost scope only
    expect(ast.scopes[4].bindings.compound.references).toHaveLength(2);
    // compound - used in last innermost scope only
    expect(ast.scopes[5].bindings.compound.references).toHaveLength(3);
});
test('declarations', function () {
    expectParsedProgram("\n    float a, b = 1.0, c = a;\n    vec2 texcoord1, texcoord2;\n    vec3 position;\n    vec4 myRGBA;\n    ivec2 textureLookup;\n    bvec3 less;\n  ");
});
test('headers', function () {
    // The following includes the varying/attribute case which only works in GL
    // ES 1.00, and will need to be updated when the switch is implemented
    expectParsedProgram("\n    precision mediump float;\n    precision highp int;\n\n    in vec4 varName;\n    out vec4 varName;\n\n    varying vec4 varName, blarName;\n    uniform vec4 varName;\n    attribute vec4 varName;\n  ");
});
test('if statement', function () {
    expectParsedStatement("\n    if(i != 0) { aFunction(); }\n    else if(i == 2) { bFunction(); }\n    else { cFunction(); }\n  ", { quiet: true });
});
test('do while loop', function () {
    expectParsedStatement("\n    do {\n      aFunction();\n      break;\n      continue;\n      return;\n    } while(i <= 99);\n  ", { quiet: true });
});
test('standard while loop', function () {
    expectParsedStatement("\n    while(i <= 99) {\n      aFunction();\n      break;\n      continue;\n      return;\n    }\n  ", { quiet: true });
});
test('for loops', function () {
    // Infinite for loop
    expectParsedStatement("\n    for(;;) {\n    }\n  ");
    // For loop with jump statements
    expectParsedStatement("\n    for(int a = 0; b <= 99; c++) {\n      break;\n      continue;\n      return;\n      aFunction();\n    }\n  ", { quiet: true });
    // Loop with condition variable declaration (GLSL ES 3.00 only)
    expectParsedStatement("\n    for(int i = 0; bool x = false; i++) {}\n  ");
});
test('switch error', function () {
    // Test the semantic analysis case
    expect(function () {
        return parseStatement("\n    switch (easingId) {\n      result = cubicIn();\n    }\n  ", { quiet: true });
    }).toThrow(/must start with a case or default label/);
});
test('switch statement', function () {
    expectParsedStatement("\n    switch (easingId) {\n      case 0:\n          result = cubicIn();\n          break;\n      case 1:\n          result = cubicOut();\n          break;\n      }\n  ", { quiet: true });
});
test('qualifier declarations', function () {
    // The expected node here is "qualifier_declarator", which would be nice to
    // test for at some point, maybe when doing more AST analysis
    expectParsedProgram("\n    invariant precise in a, b,c;\n  ");
});
test('layout', function () {
    expectParsedProgram(" \n    layout(location = 4, component = 2) in vec2 a;\n    layout(location = 3) in vec4 normal;\n    layout(location = 9) in mat4 transforms[2];\n    layout(location = 3) in vec4 normal;\n\n    const int start = 6;\n    layout(location = start + 2) in vec4 p;\n\n    layout(location = 3) in struct S\n    {\n      vec3 a; // gets location 3\n      mat2 b; // gets locations 4 and 5\n      vec4 c[2]; // gets locations 6 and 7\n      layout(location = 8) vec2 A; // ERROR, can't use on struct member\n    } s;\n\n    layout(location = 4) in block\n    {\n      vec4 d; // gets location 4\n      vec4 e; // gets location 5\n      layout(location = 7) vec4 f; // gets location 7\n      vec4 g; // gets location 8\n      layout(location = 1) vec4 h; // gets location 1\n      vec4 i; // gets location 2\n      vec4 j; // gets location 3\n      vec4 k; // ERROR, location 4 already used\n    };\n\n    // From the grammar but I think it's a typo\n    // https://github.com/KhronosGroup/GLSL/issues/161\n    // layout(location = start + 2) int vec4 p;\n  ");
});
test('comments', function () {
    expectParsedProgram("\n    /* starting comment */\n    // hi\n    void main() {\n      /* comment */// hi\n      /* comment */ // hi\n      statement(); // hi\n      /* start */ statement(); /* end */\n    }\n  ", { quiet: true });
});
test('functions', function () {
    expectParsedProgram("\n    // Prototypes\n    vec4 f(in vec4 x, out vec4 y);\n    int newFunction(in bvec4 aBvec4,   // read-only\n      out vec3 aVec3,                  // write-only\n      inout int aInt);                 // read-write\n    highp float rand( const in vec2 uv ) {}\n    highp float otherFn( const in vec3 rectCoords[ 4 ]  ) {}\n  ");
});
test('parses function_call . postfix_expression', function () {
    expectParsedStatement('texture().rgb;', { quiet: true });
});
test('parses postfix_expression as function_identifier', function () {
    expectParsedStatement('a().length();', { quiet: true });
});
test('postfix, unary, binary expressions', function () {
    expectParsedStatement('x ++ + 1.0 + + 2.0;');
});
test('parses a test file', function () {
    // console.log(debugProgram(preprocess(testFile)));
    expectParsedProgram(preprocess(testFile));
});
test('operators', function () {
    expectParsedStatement('1 || 2 && 2 ^^ 3 >> 4 << 5;');
});
test('declaration', function () {
    expectParsedStatement('const float x = 1.0, y = 2.0;');
});
test('assignment', function () {
    expectParsedStatement('x |= 1.0;');
});
test('ternary', function () {
    expectParsedStatement('float y = x == 1.0 ? x == 2.0 ? 1.0 : 3.0 : x == 3.0 ? 4.0 : 5.0;');
});
test('structs', function () {
    expectParsedProgram("\n    struct light {\n      float intensity;\n      vec3 position, color;\n    } lightVar;\n    light lightVar2;\n\n    struct S { float f; };\n  ");
});
test('buffer variables', function () {
    expectParsedProgram("\n    buffer b {\n      float u[];\n      vec4 v[];\n    } name[3]; \n  ");
});
test('arrays', function () {
    expectParsedProgram("\n    float frequencies[3];\n    uniform vec4 lightPosition[4];\n    struct light { int a; };\n    light lights[];\n    const int numLights = 2;\n    light lights[numLights];\n\n    buffer b {\n      float u[]; \n      vec4 v[];\n    } name[3];\n\n    // Array initializers\n    float array[3] = float[3](1.0, 2.0, 3.0);\n    float array[3] = float[](1.0, 2.0, 3.0);\n\n    // Function with array as return type\n    float[5] foo() { }\n  ");
});
test('initializer list', function () {
    expectParsedProgram("\n    vec4 a[3][2] = {\n      vec4[2](vec4(0.0), vec4(1.0)),\n      vec4[2](vec4(0.0), vec4(1.0)),\n      vec4[2](vec4(0.0), vec4(1.0))\n    };\n  ");
});
test('subroutines', function () {
    expectParsedProgram("\n    subroutine vec4 colorRedBlue();\n\n    // option 1\n    subroutine (colorRedBlue ) vec4 redColor() {\n        return vec4(1.0, 0.0, 0.0, 1.0);\n    }\n\n    // // option 2\n    subroutine (colorRedBlue ) vec4 blueColor() {\n        return vec4(0.0, 0.0, 1.0, 1.0);\n    }\n  ");
});
test('struct constructor', function () {
    var ast = parser.parse("\nstruct light {\n  float intensity;\n  vec3 position;\n};\nlight lightVar = light(3.0, vec3(1.0, 2.0, 3.0));\n");
    expect(ast.scopes[0].types.light.references).toHaveLength(3);
});
test('overloaded scope test', function () {
    var ast = parser.parse("\nvec4 overloaded(vec4 x) {\n  return x;\n}\nfloat overloaded(float x) {\n    return x;\n}");
    expect(ast.scopes[0].functions.overloaded.references).toHaveLength(2);
});
test('rename binding test (does nothing fixme)', function () {
    var ast = parser.parse("\nfloat a, b = 1.0, c = a;\nmat2x2 myMat = mat2( vec2( 1.0, 0.0 ), vec2( 0.0, 1.0 ) );\nstruct {\n  float s;\n  float t;\n} structArr[];\nstruct structType {\n  float s;\n  float t;\n};\nstructType z;\n\nfloat shadowed;\nfloat reused;\nfloat unused;\nvec3 fnName(float arg1, vec3 arg2) {\n  float shadowed = arg1;\n  structArr[0].x++;\n\n  if(true) {\n    float x = shadowed + 1 + reused;\n  }\n\n  {\n    float compound;\n    compound = shadowed + reused;\n  }\n\n  {\n    float compound;\n    compound = shadowed + reused + compound;\n  }\n}\nvec4 LinearToLinear( in vec4 value ) {\n\treturn value;\n}\nvec4 mapTexelToLinear( vec4 value ) { return LinearToLinear( value ); }\nvec4 linearToOutputTexel( vec4 value ) { return LinearToLinear( value ); }\n");
    // ast.scopes.forEach((s, i) => renameBindings(s, i));
    (0, utils_1.renameBindings)(ast.scopes[0], new Set(), 'x');
    (0, utils_1.renameFunctions)(ast.scopes[0], 'x', {});
    // console.log('scopes:', debugScopes(ast.scopes));
    // console.log(generate(ast));
});
test('detecting struct scope and usage', function () {
    var ast = parser.parse("\nstruct StructName {\n  vec3 color;\n};\nStructName reflectedLight = StructName(vec3(0.0));\nvoid main() {\n  struct StructName {\n    vec3 color;\n  };\n  StructName ref = StructName();\n}\n");
    (0, utils_1.renameBindings)(ast.scopes[0], new Set(), 'x');
    (0, utils_1.renameTypes)(ast.scopes[0], new Set(), 'y');
    expect(Object.keys(ast.scopes[0].functions)).toEqual(['main']);
    expect(Object.keys(ast.scopes[0].bindings)).toEqual(['reflectedLight']);
    expect(Object.keys(ast.scopes[0].types)).toEqual(['StructName']);
    expect(ast.scopes[0].types.StructName.references).toHaveLength(3);
    expect(Object.keys(ast.scopes[1].types)).toEqual(['StructName']);
    // console.log(generate(ast));
});
