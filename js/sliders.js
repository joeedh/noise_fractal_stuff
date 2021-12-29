var _sliders = undefined;
define(['util'], function sliders(util) {
  'use strict';
  
  var exports = _sliders = {};

  var gsb_rets = new util.cachering(function() {
    return [[0, 0], [0, 0]];
  }, 32);
  
  exports.SliderManager = class SliderManager {
    constructor(x, y, slidwid, slidheight, sliders, names) {
      this.names = [];
      this.sliderdef = [];
      
      this.correctForDPI = false;
      this.localStorageKey = undefined;
      
      for (let def of names) {
        if (typeof def === "string") {
          def = {
            name  : def,
            range : [-1e17, 1e17],
            decimalPlaces : 2,
            integer : false
          }
        }
        
        if (!("decimalPlaces" in def)) {
          def.decimalPlaces = 2;
        }
        if (!("integer") in def) {
          def.integer = false;
        }
        if (!("range" in def)) {
          def.range = [-1e17, 1e17];
        }
        
        this.names.push(def.name);
        this.sliderdef.push(def);
      }
      
      this.slidesize = [slidwid, slidheight];
      this.x = x;
      this.y = y;
      this.sliders = sliders;
      this.sliders_start = undefined;
      this.pad = 15;
      
      this._visible = true;
      
      this.last_mpos = [0, 0];
      this.actslider = -1;
      this.mdown = false;
      
      this.locked = {};
      this.load();
      
      this.onchange = null;
      this.onchange_end = null;
    }
    
    set visible(val) {
      let update = !!val !== this._visible;
      
      this._visible = !!val;
      
      if (update) {
        redraw_all();
      }
    }
    
    get visible() {
      return this._visible;
    }
    
    bind_events(dom=window) {
      var this2 = this;
      
      var this2 = this;
      
      dom.addEventListener("touchstart", (e) => {
        if (!this.visible) {
          return;
        }
        
        //console.log(e.touches[0]);
        e.touches[0].stopPropagation = function() {
           e.stopPropagation()
        }
        e.touches[0].preventDefault = function() {
           e.preventDefault()
        }
        
        this.mdown = false;
        this2.on_mousemove(e.touches[0]);
        
        if (this.actslider < 0) return;
        
        this2.on_mousedown(e.touches[0]);
       // e.stopPropagation();
       // e.preventDefault()
      }, true);
      
      dom.addEventListener("touchmove", (e) => {
        if (!this.visible) {
          return;
        }

        var mdown = this.mdown;
        //this.mdown = true;
        
        e.touches[0].stopPropagation = function() {
           e.stopPropagation()
        }
        e.touches[0].preventDefault = function() {
           e.preventDefault()
        }
        
        //console.log(e.touches[0]);
        this2.on_mousemove(e.touches[0]);
        this.mdown = mdown;
        
        if (this.actslider < 0) return;
        
    //    e.stopPropagation();
    //    e.preventDefault()
        
      }, true);
      dom.addEventListener("touchcancel", (e) => {
        if (!this.visible) {
          return;
        }

        if (this.actslider < 0) return;
        
        e.touches[0].stopPropagation = function() {
           e.stopPropagation()
        }
        e.touches[0].preventDefault = function() {
           e.preventDefault()
        }
        
        //console.log(e.touches[0]);
        this2.on_mouseup(e.touches[0]);
      //  e.stopPropagation();
      //  e.preventDefault()
      }, true);
      
      dom.addEventListener("touchend", (e) => {
        if (!this.visible) {
          return;
        }

        if (this.actslider < 0) return;
        
        if (e.touches.length > 0) {
          e.touches[0].stopPropagation = function() {
             e.stopPropagation()
          }
          e.touches[0].preventDefault = function() {
             e.preventDefault()
          }
          //console.log(e.touches[0]);
          this2.on_mouseup(e.touches[0]);
       } else {
         this2.on_mouseup(e);
       }
       // e.stopPropagation();
       // e.preventDefault()
      }, true);
      
      dom.addEventListener("mousedown", (e) => {
        if (!this.visible) {
          return;
        }

        this2.on_mousedown(e);
      }, true);
      dom.addEventListener("mousemove", (e) => {
        if (!this.visible) {
          return;
        }

        this2.on_mousemove(e);
      }, true);
      dom.addEventListener("mouseup", (e) => {
        if (!this.visible) {
          return;
        }

        this2.on_mouseup(e);
      }, true);
    }
    
    reset() {
    }
    
    getDPI() {
      return this.correctForDPI ? devicePixelRatio : 1.0;
    }
    
    on_mousedown(e) {
      this.mdown = true;
      
      this.last_mpos[0] = e.pageX*this.getDPI();
      this.last_mpos[1] = e.pageY*this.getDPI();
      
      if (this.actslider >= 0) {        
        if (this.onchange_start) {
          this.onchange_start(this.actslider);
        }
        
        e.stopPropagation();
        this.sliders_start = this.sliders.concat([]);
      }
    }
    
    load() {
      //XXX
      //return;
      if (!(this.localStorageKey in localStorage)) {
        return;
      }
      
      var sliders = JSON.parse(localStorage[this.localStorageKey]);
      var len = Math.min(this.sliders.length, sliders.length);
      
      for (var i=0; i<len; i++) {
        this.sliders[i] = sliders[i];
      }
    }
    
    lock(slider) {
      this.locked[slider] = 1;
    }
    
    unlock(slider) {
      this.locked[slider] = 0;
    }
    
    save() {
      if (this.localStorageKey) {
        localStorage[this.localStorageKey] = JSON.stringify(this.sliders);
      }
    }
    
    on_mousemove(e) {
      let sliders = this.sliders;
      let act = this.actslider;
      let def = this.sliderdef[act];
      
      if (!this.mdown) {
        
        this.actslider = -1;
        
        for (let i=0; i<sliders.length; i++) {
          let box = this.get_slider_box(i);
          let x = e.pageX*this.getDPI(), y = e.pageY*this.getDPI();
          
          if (x >= box[0][0] && x <= box[0][0]+box[1][0]*1.5 && 
              y >= box[0][1] && y <= box[0][1]+box[1][1]*1.5)
          {
            this.actslider = i;
          }
        }
        
        if (this.actslider != act) {
          redraw_all();
        }
      } else if (this.actslider >= 0) {
        if (this.actslider >= 0 && this.locked[this.actslider]) {
          return;
        }
        
        let dy = -(e.pageY*this.getDPI() - this.last_mpos[1]) / 700.0;
        
        //*
        if ("speed" in def) {
          dy *= def.speed;
        }
        
        if ("exp" in def) {
          let dv = Math.abs(this.sliders[this.actslider] - this.sliders_start[this.actslider]);
          
          if (dv > 0.0) {
            dy *= Math.pow(dv, def.exp) / dv;
          }
        }//*/
        
        if (def.integer) {
          if (def.range[0] > -10000 && def.range[1] < 10000) {
            dy *= (def.range[1] - def.range[0])*0.5;
          } else {
            dy *= 10.0;
          }
        }
        if (e.shiftKey)
          dy *= 0.05;
        if (e.ctrlKey)
          dy *= 0.05;
        if (e.altKey)
          dy *= 0.01025;
        
        let val = sliders[this.actslider] + dy;
        val = Math.min(Math.max(val, def.range[0]), def.range[1]);
        sliders[this.actslider] = val;
        
        if (def.integer) {
          val = Math.floor(val);
        }
        
        //console.warn(def.range, val)
        console.log("SLIDERS=[" + sliders + "];");
        
        this.save();
        
        if (this.onchange) {
          this.onchange(this.actslider);
        }
        
        window.redraw_all();
        e.stopPropagation();
        e.preventDefault()
      }

      this.last_mpos[0] = e.pageX*this.getDPI();
      this.last_mpos[1] = e.pageY*this.getDPI();
    }

    on_mouseup(e) {
      this.mdown = false;
      
      if (this.onchange_end) {
        this.onchange_end(this.actslider);
      }
    }
      
    get_slider_box(i) {
      var pad=this.pad, swid=this.slidesize[0];
      var ret = gsb_rets.next();
      
      ret[0][0] = this.x + (swid+pad)*i;
      ret[0][1] = this.y;
      ret[1][0] = swid;
      ret[1][1] = this.slidesize[1];
      
      return ret;
    }

    draw(canvas, g) {
      if (!this.visible) {
        return;
      }
      
      var sliders = this.sliders;
      
      var w = this.slidesize[0], h = this.slidesize[1];
      var pad=11, swid=40
      let totalw = swid+pad;
      
      var x = this.x + w + 7;
      var y = this.y;;
      g.fillStyle = "rgba(0, 0, 0, 1.0)";
      
      let fontsize = (12 * devicePixelRatio).toFixed(2);
      g.font = `${fontsize}px Georgia`;
      
      for (var i=0; i<sliders.length; i++) {
        g.beginPath();
        
        var b = this.get_slider_box(i);
        
        g.rect(b[0][0], b[0][1], b[1][0], b[1][1]);
        
        if (this.locked[i]) {
          g.fillStyle = "rgba(255, 0, 0, 0.5)";
        } else if (i == this.actslider) {
          g.fillStyle =  "rgba(50, 135, 230, 0.5)";
        } else {
          g.fillStyle = "rgba(200, 200, 200, 0.5)";
        }
        g.stroke();
        g.fill();
        
        let twid = g.measureText(this.names[i]).width;
        let txoff = ((totalw*0.5-twid)*0.5);
        
        g.beginPath();
        
        function drawTextShadow(text, x, y) {
          for (let i=0; i<15; i++) {
            g.shadowBlur = 3.0;
            g.shadowColor = "black";
            //g.font = "16px bold courier";
            g.fillStyle = "black";
            g.fillText(text, x, y);
          }
          
          g.beginPath();
          g.shadowBlur = 0.0;
          g.shadowColor = "rgba(0,0,0,0)";
          //g.font = "16px bold courier";
          g.fillStyle = "white";
          g.fillText(text, x, y);
        }
        
        let def = this.sliderdef[i];
        
        drawTextShadow(this.names[i], txoff+b[0][0], b[0][1]+b[1][1]+20);
        
        let val = def.integer ? ""+Math.floor(this.sliders[i]) : this.sliders[i].toFixed(def.decimalPlaces);
        let oddy = i % 2 == 0 ? 18 : 0
        
        drawTextShadow(val, b[0][0], b[0][1]+b[1][1]+40+oddy);
 
        x += swid+pad;
      }
    }
  }
  
  return exports;
});
