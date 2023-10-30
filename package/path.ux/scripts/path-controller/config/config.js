export let config = {
  doubleClickTime : 500,

  //auto load 1d bspline templates, can hurt startup time
  autoLoadSplineTemplates : true,

  //timeout for press-and-hold (touch) version of double clicking
  doubleClickHoldTime : 750,
  DEBUG : {

  }
};

export function setConfig(obj) {
  for (let k in obj) {
    config[k] = obj[k];
  }
}

export default config;
