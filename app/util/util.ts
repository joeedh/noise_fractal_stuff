declare global {
  interface Window {
    _getSearchOff: typeof getSearchOff
  }
}

type SearchOffset = [number, number, number]

let ncache: SearchOffset[][] = new Array(1024)

export function getSearchOff(n: number): SearchOffset[] {
  if (ncache[n]) {
    return ncache[n];
  }

  //console.warn("Creating search offsets of radius", n);

  let list: SearchOffset[] = ncache[n] = [];

  for (let i=-n; i<=n; i++) {
    for (let j=-n; j<=n; j++) {
      if (i*i + j*j >= n*n) {
        continue;
      }

      let w = 1.0 - Math.sqrt(i*i + j*j) / Math.sqrt(2.0*n);
      list.push([i, j, w]);
    }
  }

  return list;
}

window._getSearchOff = getSearchOff;