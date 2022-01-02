export let config = {
  doubleClickTime : 500,

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
