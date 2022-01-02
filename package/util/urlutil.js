export function resolveURL(path) {
  if (window.haveElectron) {
    path = path.trim();

    while (path.startsWith("/")) {
      path = path.slice(1, path.length).trim();
    }

    return "../" + path;
  }

  let url = location.href;
  if (url.endsWith(".html")) {
    url = url.slice(0, url.length - 5);

    while (url.length > 0 && url[url.length-1] !== "/") {
      url = url.slice(0, url.length-1);
    }
  }

  url = url.trim();
  while (url.endsWith("/")) {
    url = url.slice(0, url.length-1).trim();
  }

  while (path.startsWith("/")) {
    path = path.slice(1, path.length).trim();
  }

  url = url + "/" + path;

  return url;
}