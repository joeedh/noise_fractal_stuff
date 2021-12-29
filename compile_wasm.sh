#!/bin/bash

source ./emsdk_env.sh

emcc wasm.cc -O3 -msimd128 -flto=full -s WASM=1 --emit-symbol-map -s EXPORTED_FUNCTIONS=_newtonFractal,_newtonFractalSimd,_calc_stuff,_main,_getOutMem,_getSliderMem,_getUVMem -o wasm.wasm
#emcc wasm.cc -O0 -g -gsource-map -s WASM=1 --emit-symbol-map -s EXPORTED_FUNCTIONS=_newtonFractal,_newtonFractalSimd,_calc_stuff,_main,_getOutMem,_getSliderMem,_getUVMem -o wasm.wasm

node gen_wasm_text.js
