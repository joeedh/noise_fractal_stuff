"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameFunctions = exports.renameTypes = exports.renameBindings = void 0;
var renameBindings = function (scope, preserve, suffix) {
    Object.entries(scope.bindings).forEach(function (_a) {
        var name = _a[0], binding = _a[1];
        binding.references.forEach(function (ref) {
            if (ref.doNotDescope) {
                return;
            }
            if (ref.type === 'declaration') {
                // both are "in" vars expected in vertex shader
                if (!preserve.has(ref.identifier.identifier)) {
                    ref.identifier.identifier = ref.identifier.identifier + "_" + suffix;
                }
            }
            else if (ref.type === 'identifier') {
                // TODO: does this block get called anymore??
                if (!preserve.has(ref.identifier)) {
                    ref.identifier = ref.identifier + "_" + suffix;
                }
            }
            else if (ref.type === 'parameter_declaration') {
                ref.declaration.identifier.identifier = ref.declaration.identifier.identifier + "_" + suffix;
            }
            else {
                console.log(ref);
                throw new Error("Binding for type " + ref.type + " not recognized");
            }
        });
    });
};
exports.renameBindings = renameBindings;
var renameTypes = function (scope, preserve, suffix) {
    Object.entries(scope.types).forEach(function (_a) {
        var name = _a[0], type = _a[1];
        type.references.forEach(function (ref) {
            if (ref.doNotDescope) {
                return;
            }
            if (ref.type === 'struct') {
                if (!preserve.has(ref.typeName.identifier)) {
                    ref.typeName.identifier = ref.typeName.identifier + "_" + suffix;
                }
            }
            else if (ref.type === 'identifier') {
                ref.identifier = ref.identifier + "_" + suffix;
            }
            else if (ref.type === 'function_call') {
                ref.identifier.specifier.identifier = ref.identifier.specifier.identifier + "_" + suffix;
            }
            else {
                console.log(ref);
                throw new Error("Binding for type " + ref.type + " not recognized");
            }
        });
    });
};
exports.renameTypes = renameTypes;
var renameFunctions = function (scope, suffix, map) {
    Object.entries(scope.functions).forEach(function (_a) {
        var name = _a[0], binding = _a[1];
        binding.references.forEach(function (ref) {
            if (ref.type === 'function_header') {
                ref.name.identifier =
                    map[ref.name.identifier] || ref.name.identifier + "_" + suffix;
            }
            else if (ref.type === 'function_call') {
                if (ref.identifier.type === 'postfix') {
                    ref.identifier.expr.identifier.specifier.identifier =
                        map[ref.identifier.expr.identifier.specifier.identifier] ||
                            ref.identifier.expr.identifier.specifier.identifier + "_" + suffix;
                }
                else {
                    ref.identifier.specifier.identifier =
                        map[ref.identifier.specifier.identifier] ||
                            ref.identifier.specifier.identifier + "_" + suffix;
                }
                // Structs type names also become constructors. However, their renaming is
                // handled by bindings
            }
            else if (ref.type !== 'struct') {
                console.log(ref);
                throw new Error("Function for type " + ref.type + " not recognized");
            }
        });
    });
};
exports.renameFunctions = renameFunctions;
