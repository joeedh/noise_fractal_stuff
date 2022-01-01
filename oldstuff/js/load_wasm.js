let _load_wasm = undefined;

define([], function () {
  let exports = _load_wasm = {};

  exports.Wasm = class Wasm {
    constructor(memsize = 16777216) {
      this.HEAP8 = this.HEAP16 = this.HEAP32 = this.HEAPU8 = this.HEAPU16 = this.HEAPU32 = undefined;
      this.HEAPF32 = this.HEAPF64 = undefined;
      this.bin = undefined;
      this.instance = undefined;
      this.mem = undefined;

      this.ready = false;
      this.memsize = memsize;
    }

    load(bin) {
      if (typeof bin === "string") {
        bin = atob(bin);
        let data = new Uint8Array(bin.length);

        for (let i = 0; i < bin.length; i++) {
          data[i] = bin.charCodeAt(i);
        }

        bin = data.buffer;
      }

      let imports = {
       // imports: {
          /*"a": new WebAssembly.Memory({
            initial: 512,
            maximum: 2048,
            shared : true
          })*/
          proc_exit : function() {
            debugger;
          },
          wasi_snapshot_preview1 : {
            proc_exit : function() {
              debugger;
            }
          }
        //}
      };

      return new Promise((accept, reject) => {
        /*
        WebAssembly.compile(bin).then(arg => {
          console.log("compiled", arg);
        });//*/
        //return;
        WebAssembly.instantiate(bin, imports).then((arg) => {
          console.log("loaded!", arg);

          this.instance = arg.instance;
          this.bin = arg.module;
          this.mem = arg.instance.exports.memory;

          this.instance.exports.main();
          this.exports = this.instance.exports;

          this.HEAP8 = new Int8Array(this.mem.buffer);
          this.HEAP16 = new Int16Array(this.mem.buffer);
          this.HEAP32 = new Int32Array(this.mem.buffer);
          this.HEAPU8 = new Uint8Array(this.mem.buffer);
          this.HEAPU16 = new Uint16Array(this.mem.buffer);
          this.HEAPU32 = new Uint32Array(this.mem.buffer);
          this.HEAPF32 = new Float32Array(this.mem.buffer);
          this.HEAPF64 = new Float64Array(this.mem.buffer);

          this.ready = true;

          accept(this);
        });
      });
    }
  }
  return exports;
});
