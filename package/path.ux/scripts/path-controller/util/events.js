"use strict";

import * as util from './util.js';
import * as simple_events from './simple_events.js';

export {keymap, reverse_keymap, keymap_latin_1} from './simple_events.js';

export class EventDispatcher {
  constructor() {
    this._cbs = {};
  }

  _fireEvent(type, data) {
    let stop = false;

    data = {
      stopPropagation() {
        stop = true;
      },

      data : data
    };

    if (type in this._cbs) {
      for (let cb of this._cbs[type]) {
        cb(data);
        if (stop) {
          break;
        }
      }
    }
  }

  on(type, cb) {
    if (!(type in this._cbs)) {
      this._cbs[type] = [];
    }

    this._cbs[type].push(cb);
    return this;
  }

  off(type, cb) {
    if (!(type in this._cbs)) {
      console.warn("event handler not in list", type, cb);
      return this;
    }

    let stack = this._cbs[type];
    if (stack.indexOf(cb) < 0) {
      console.warn("event handler not in list", type, cb);
      return this;
    }

    stack.remove(cb);
    return this;
  }
}
export function copyMouseEvent(e) {
  let ret = {};
  
  function bind(func, obj) {
    return function() {
      return this._orig.apply(func, arguments);
    }
  }
  
  let exclude = new Set([
    //"prototype",
    //"constructor",
    "__proto__"
  ]);
  
  ret._orig = e;
  
  for (let k in e) {
    let v = e[k];
    
    if (exclude.has(k)) {
      continue;
    }
    
    if (typeof v == "function") {
      v = bind(v);
    }
    
    ret[k] = v;
  }

  ret.ctrlKey = e.ctrlKey;
  ret.shiftKey = e.shiftKey;
  ret.altKey = e.altKey;

  for (let i=0; i<2; i++) {
    let key = i ? "targetTouches" : "touches";

    if (e[key]) {
      ret[key] = [];

      for (let t of e[key]) {
        let t2 = {};
        ret[key].push(t2);

        for (let k in t) {
          t2[k] = t[k];
        }
      }
    }
  }

  return ret;
}

export const DomEventTypes = {
  on_mousemove   : 'mousemove',
  on_mousedown   : 'mousedown',
  on_mouseup     : 'mouseup',
  on_touchstart  : 'touchstart',
  on_touchcancel : 'touchcanel',
  on_touchmove   : 'touchmove',
  on_touchend    : 'touchend',
  on_mousewheel  : 'mousewheel',
  on_keydown     : 'keydown',
  on_keyup       : 'keyup',
  on_pointerdown : 'pointerdown',
  on_pointermove : 'pointermove',
  on_pointercancel : 'pointercancel',
  on_pointerup   : 'pointerup',

  //on_keypress    : 'keypress'
};

function getDom(dom, eventtype) {
  if (eventtype.startsWith("key"))
    return window;
  return dom;
}

export let modalStack = [];
export function isModalHead(owner) {
  return modalStack.length === 0 ||
         modalStack[modalStack.length-1] === owner;
}

export class EventHandler {
  constructor() {
    this._modalstate = undefined;
  }
  pushPointerModal(dom, pointerId) {
    if (this._modalstate) {
      console.warn("pushPointerModal called twiced!");
      return;
    }
    
    this._modalstate = simple_events.pushPointerModal(this, dom, pointerId);
  }
  pushModal(dom, _is_root) {
    if (this._modalstate) {
      console.warn("pushModal called twiced!");
      return;
    }
    
    this._modalstate = simple_events.pushModalLight(this);
  }
  
  popModal() {
    if (this._modalstate !== undefined) {
      let modalstate = this._modalstate;

      //window.setTimeout(() => {
        simple_events.popModalLight(modalstate);
      //});

      this._modalstate = undefined;
    }
  }
}

export function pushModal(dom, handlers) {
  console.warn("Deprecated call to pathux.events.pushModal; use api in simple_events.js instead");
  let h = new EventHandler();
  
  for (let k in handlers) {
    h[k] = handlers[k];
  }
  
  handlers.popModal = () => {
    return h.popModal(dom);
  }
  
  h.pushModal(dom, false);
  
  return h;
}
