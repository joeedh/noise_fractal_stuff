let btoa = require('btoa');
let fs = require('fs');

console.log(btoa);

let data = fs.readFileSync("wasm.wasm");
data = btoa(data);

data = `
define([], () => "${data}");
`
fs.writeFileSync("js/wasm_bin.js", data);

