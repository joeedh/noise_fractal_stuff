if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function(pat, repl) {
    let i;

    /* replaceAll doesn't auto-coerce to RegExp */
    if (typeof pat === "string") {
      pat = pat.replace(/[<>|\\{\/}\[\]!@~`#$%^&*()-=\.]/g, '\\$&');
    }

    console.warn("pat", pat);
    pat = new RegExp(pat, "g");

    return this.replace(pat, repl);
  }
}
