if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function(
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: unknown[]) => string)
  ) {
    let pat: string | RegExp = searchValue

    /* replaceAll doesn't auto-coerce to RegExp */
    if (typeof pat === "string") {
      pat = pat.replace(/[<>|\\{\/}\[\]!@~`#$%^&*()-=\.]/g, '\\$&');
    }

    console.warn("pat", pat);
    pat = new RegExp(pat, "g");

    if (typeof replaceValue === "function") {
      return this.replace(pat, replaceValue);
    }

    return this.replace(pat, replaceValue);
  }
}
