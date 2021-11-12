//bind module to global var to get at it in console.
//
//note that require has an api for handling circular 
//module refs, in such cases do not use these vars.

var _ui = undefined;

define([
  'util', 'dat.gui', 'vectormath', 'linear_algebra'
], function ui(util, dat1, vectormath, linear_algebra) {
  'use strict';

  var exports = _ui = {};
  var Class = util.Class;
  var Vector2 = vectormath.Vector2;

  var bin_cache = {};
  window._bin_cache = bin_cache;

  var eval2_rets = util.cachering.fromConstructor(Vector2, 32);

  /*
    I hate these stupid curve widgets.  This horrible one here works by
    root-finding the x axis on a two dimensional b-spline (which works
    surprisingly well).
  */

  function bez3(a, b, c, t) {
    var r1 = a + (b - a)*t;
    var r2 = b + (c - b)*t;

    return r1 + (r2 - r1)*t;
  }

  function bez4(a, b, c, d, t) {
    var r1 = bez3(a, b, c, t);
    var r2 = bez3(b, c, d, t);

    return r1 + (r2 - r1)*t;
  }

  var binomial = exports.binomial = function binomial(n, i) {
    if (i > n) {
      throw new Error("Bad call to binomial(n, i), i was > than n");
    }

    if (i == 0 || i == n) {
      return 1;
    }

    var key = "" + n + "," + i;

    if (key in bin_cache)
      return bin_cache[key];

    var ret = binomial(n - 1, i - 1) + bin(n - 1, i);
    bin_cache[key] = ret;

    return ret;
  }
  window.bin = binomial;

  var TangentModes = {
    SMOOTH: 1,
    BREAK : 2
  };

  var CurveFlags = {
    SELECT: 1
  };

  var CurvePoint = exports.CurvePoint = class CurvePoint extends Vector2 {
    constructor(co) {
      super()

      this.deg = 3;
      this.rco = new Vector2(co);
      this.sco = new Vector2(co);

      //for transform
      this.startco = new Vector2();
      this.eid = -1;
      this.flag = 0;

      this.tangent = TangentModes.SMOOTH;
    }

    static fromJSON(obj) {
      var ret = new CurvePoint(obj);

      ret.eid = obj.eid;
      ret.flag = obj.flag;
      ret.deg = obj.deg;
      ret.tangent = obj.tangent;

      return ret;
    }

    copy() {
      var ret = new CurvePoint(this);

      ret.tangent = this.tangent;
      ret.rco.load(this.rco);
      ret.sco.load(this.sco);
      ret.startco.load(this.startco);
      ret.deg = this.deg;

      return ret;
    }

    toJSON() {
      return {
        0      : this[0],
        1      : this[1],
        eid    : this.eid,
        flag   : this.flag,
        deg    : this.deg,
        tangent: this.tangent
      };
    }

    basis(t, kprev, knext, is_end, totp, pi) {
      var wid = (knext - kprev)*0.5;
      var k = this.rco[0];

      throw new Error();

      this.deg = 3;

      kprev -= (this.deg)*wid;
      knext += (this.deg)*wid;

      if (is_end != 1) {
        kprev = Math.max(kprev, 0.0);
      }
      if (is_end != 2) {
        knext = Math.min(knext, 1.0);
      }

      if (t <= kprev || t > knext) {
        //return 0;
      }

      var w;
      if (t > k) {
        w = 1.0 + (k - t)/(knext - k + 0.00001);
        w = 2.0 - w;
      } else {
        w = (t - kprev)/(k - kprev + 0.00001);
      }
      w *= 0.5;

      var w = (t - kprev)/(knext - kprev);
      var n = totp;
      var v = pi;

      w = Math.min(Math.max(w, 0.0), 1.0);
      var bernstein = binomial(n, v)*Math.pow(w, v)*Math.pow(1.0 - w, n - v);
      return bernstein;

      if (w == 0) return 0;

      w *= w*w;
      w = 1.0 - Math.pow(1.0 - w, 2.0);

      return w;
    }
  }

  var Curve = exports.Curve = class Curve extends Array {
    constructor(widget) {
      super();

      this._nocache = 0;
      this.widget = widget;
      this._ps = [];
      this.hermite = [];

      this.deg = 3;
      this.recalc = 1;
      this.basis_tables = [];
      this.eidgen = new util.IDGen();
    }

    add(x, y) {
      var p = new CurvePoint();
      this.recalc = 1;

      p.eid = this.eidgen.next();

      p[0] = x;
      p[1] = y;

      p.sco.load(p);
      p.rco.load(p);

      this.push(p);
      this.update();

      return p;
    }

    update() {
      this.recalc = 1;

      for (var i = 0; i < this.length; i++) {
        this[i].rco.load(this[i]);
      }

      this.sort(function (a, b) {
        return a[0] - b[0];
      });

      this._ps = [];
      if (this.length < 2) return;

      var a = this[0][0], b = this[this.length - 1][0];

      for (var i = 0; i < this.length - 1; i++) {
        this._ps.push(this[i]);
      }

      if (this.length < 3) return;

      var l1 = this[this.length - 3];
      var l2 = this[this.length - 1];

      var p = l2.copy();
      var dx = (l2[0] - l1[0]);
      var dy = (l2[1] - l1[1]);

      //p[0] += dx/3 
      //p[1] += dy/3

      p.rco.load(p);
      p.sco.load(p);

      this._ps.push(p);
      this._ps.push(p.copy());

      //this._ps.push(
      //this.optimize();

      for (var i = 0; i < this.length; i++) {
        var p = this[i];
        var x = p[0], y = p[1];

        p.sco[0] = x;
        p.sco[1] = y;
      }
    }

    derivative(t) {
      var df = 0.001;

      if (t > df*2) {
        return (this.evaluate(t + df) - this.evaluate(t - df))/(df*2);
      } else if (t > 0.5) {
        return (this.evaluate(t) - this.evaluate(t - df))/df;
      } else {
        return (this.evaluate(t + df) - this.evaluate(t))/df;
      }
    }

    destroy_all_settings() {
      delete localStorage[this.widget.setting_id];
    }

    derivative2(t) {
      var df = 0.0003;

      if (t > df*2) {
        return (this.derivative(t + df) - this.derivative(t - df))/(df*2);
      } else if (t > 0.5) {
        return (this.derivative(t) - this.derivative(t - df))/df;
      } else {
        return (this.derivative(t + df) - this.derivative(t))/df;
      }
    }

    optimize() {
      return;
      var steps = 75;
      var ps = this._ps;

      this._nocache = true;

      function err(p) {
        var val = this.evaluate(p[0]);

        return Math.abs(val - p[1]);
      }

      function err2(p) {
        var dv = this.derivative(p[0]);
        var i = ps.indexOf(p);

        var prev = i > 0 ? ps[i - 1] : p;
        var next = i < ps.length - 1 ? ps[i + 1] : p;

        var div = next[0] - prev[0];

        var df = div == 0.0 ? 0.0 : (next[1] - prev[1])/div;

        return Math.abs(dv - df);
      }

      err = err.bind(this);
      err2 = err2.bind(this);

      function meaderror(p, mp) {
        var dv2 = this.derivative2(p[0]);

        var e1 = err(p);
        var e2;

        var i = this._ps.indexOf(mp);
        if (i < 0) throw new Error("out of bounds");

        var mp_prev = i > 0 ? this._ps[i - 1] : mp;
        var mp_next = i < this._ps.length - 1 ? this._ps[i + 1] : mp;

        e2 = mp_prev.vectorDistance(mp) + mp_next.vectorDistance(mp);
        //e2 *= 0.1;

        e2 = Math.abs(this.derivative2(p[0]));
        //if (si > 55) return e2;

        var d = e1*e1 + e2*e2;

        if (Math.random() > 0.999) {
          console.log("e1", e1, "e2", e2);
        }

        d = d != 0.0 ? Math.sqrt(d) : 0.0;
        return e1 + e2;
      }

      meaderror = meaderror.bind(this);

      var cs = [err];

      var error = 0;
      var gs = [0, 0];

      var mat = new linear_algebra.Matrix(ps.length*cs.length, ps.length*cs.length);

      for (var si = 0; si < steps; si++) {
        error = 0;

        for (var i2 = 0; i2 < ps.length; i2++) {
          var i = i2;

          for (var j = 0; j < this.length; j++) {
            //var i = ~~(Math.random()*ps.length*0.99999999);
            var tstp = this[j];
            var p = ps[i];

            var df = 0.01;

            var x = p.rco[0], y = p.rco[1];
            var e1 = meaderror(tstp, p);

            p.rco[1] += df;

            var e2 = meaderror(tstp, p);

            p.rco[0] += df;
            var e3 = meaderror(tstp, p);

            p.rco[0] = x, p.rco[1] = y;

            /*
             e2
             |  \
             |    \
             e1-----e3
            */

            //nelder-mead simplex optimization method
            if (e1 >= e2 && e1 > e3) {
              p.rco[0] = x + df;
              p.rco[1] = y + df;
            } else if (e2 > e1 && e2 >= e3) {
              p.rco[0] = x + df*0.5;
              p.rco[1] = y - df*0.75;
            } else if (e3 > e1 && e3 > e2) {
              p.rco[0] = x - df*0.75;
              p.rco[1] = y + df*0.5;
            }
          }

          error += e1;
          continue;

          for (var ci = 0; ci < cs.length; ci++) {
            var r1 = cs[ci](p);

            if (r1 < 0.00002) continue;
            error += r1;

            var df = 0.0001;
            var totg = 0;

            for (var j = 0; j < 2; j++) {
              var orig = p.rco[j];

              p.rco[j] -= df;
              var r0 = cs[ci](p);

              p.rco[j] = orig + df;
              var r3 = cs[ci](p);

              gs[j] = (r3 - r0)/(2*df);
              totg += gs[j]*gs[j];

              var x = i*2 + j;
              var y = i*2 + ci;

              mat[x*mat.m + y] = gs[j];

              p.rco[j] = orig;
            }

            if (totg == 0) continue;

            r1 /= totg;
            var fac = 1.0;

            for (var j = 0; j < 2; j++) {
              //if (j == 1) fac *= 0.5;

              p.rco[j] += -r1*gs[j]*fac;
            }
          }
        }

        //console.log(""+mat.toString());
        //console.log("DET", mat.determinant());
      }
      console.log("error:", error);

      this._nocache = false;
    }

    toJSON() {
      var ps = [];
      for (var i = 0; i < this.length; i++) {
        ps.push(this[i].toJSON());
      }

      var ret = {
        points: ps,
        deg   : this.deg,
        eidgen: this.eidgen.toJSON()
      };

      return ret;
    }

    loadJSON(obj) {
      this.length = 0;
      this.hightlight = undefined;
      this.eidgen = util.IDGen.fromJSON(obj.eidgen);
      this.recalc = 1;

      if (obj.deg != undefined)
        this.deg = obj.deg;

      for (var i = 0; i < obj.points.length; i++) {
        this.push(CurvePoint.fromJSON(obj.points[i]));
      }

      return this;
    }

    basis(t, i) {
      if (this.recalc) {
        this.regen_basis();
      }

      i = Math.min(Math.max(i, 0), this._ps.length - 1);
      t = Math.min(Math.max(t, 0.0), 1.0)*0.999999999;

      var table = this.basis_tables[i];

      var s = t*(table.length/4)*0.99999;

      var j = ~~s;
      s -= j;

      j *= 4;
      return table[j] + (table[j + 3] - table[j])*s;

      return bez4(table[j], table[j + 1], table[j + 2], table[j + 3], s);
    }

    reset() {
      this.length = 0;
      this.add(0, 0);
      this.add(0.5, 0.5);
      this.add(1, 1);
    }

    regen_hermite(steps) {
      console.log("building spline approx");

      steps = steps == undefined ? 370 : steps;

      this.hermite = new Array(steps);
      var table = this.hermite;

      var eps = 0.00001;
      var dt = (1.0 - eps*8)/(steps - 1);
      var t = eps*4;
      var lastdv1, lastf3;

      for (var j = 0; j < steps; j++, t += dt) {
        var f1 = this._evaluate(t - eps*2);
        var f2 = this._evaluate(t - eps);
        var f3 = this._evaluate(t);
        var f4 = this._evaluate(t + eps);
        var f5 = this._evaluate(t + eps*2);

        var dv1 = (f4 - f2)/(eps*2);
        dv1 /= steps;

        if (j > 0) {
          var j2 = j - 1;

          table[j2*4] = lastf3;
          table[j2*4 + 1] = lastf3 + lastdv1/3.0;
          table[j2*4 + 2] = f3 - dv1/3.0;
          table[j2*4 + 3] = f3;
        }

        lastdv1 = dv1;
        lastf3 = f3;
      }
    }

    regen_basis() {
      console.log("building basis functions");
      this.recalc = 0;

      var steps = 70;

      this.basis_tables = new Array(this._ps.length);

      for (var i = 0; i < this._ps.length; i++) {
        var table = this.basis_tables[i] = new Array((steps - 1)*4);

        var eps = 0.00001;
        var dt = (1.0 - eps*8)/(steps - 1);
        var t = eps*4;
        var lastdv1, lastf3;

        for (var j = 0; j < steps; j++, t += dt) {
          var f1 = this._basis(t - eps*2, i);
          var f2 = this._basis(t - eps, i);
          var f3 = this._basis(t, i);
          var f4 = this._basis(t + eps, i);
          var f5 = this._basis(t + eps*2, i);

          var dv1 = (f4 - f2)/(eps*2);
          dv1 /= steps;

          if (j > 0) {
            var j2 = j - 1;

            table[j2*4] = lastf3;
            table[j2*4 + 1] = lastf3 + lastdv1/3.0;
            table[j2*4 + 2] = f3 - dv1/3.0;
            table[j2*4 + 3] = f3;
          }

          lastdv1 = dv1;
          lastf3 = f3;
        }
      }

      this.regen_hermite();
    }

    _basis(t, i) {
      var len = this._ps.length;
      var ps = this._ps;

      function safe_inv(n) {
        return n == 0 ? 0 : 1.0/n;
      }

      function bas(s, i, n) {
        var kp = Math.min(Math.max(i - 1, 0), len - 1);
        var kn = Math.min(Math.max(i + 1, 0), len - 1);
        var knn = Math.min(Math.max(i + n, 0), len - 1);
        var knn1 = Math.min(Math.max(i + n + 1, 0), len - 1);
        var ki = Math.min(Math.max(i, 0), len - 1);

        if (n == 0) {
          return s >= ps[ki].rco[0] && s < ps[kn].rco[0] ? 1 : 0;
        } else {

          var a = (s - ps[ki].rco[0])*safe_inv(ps[knn].rco[0] - ps[ki].rco[0] + 0.0001);
          var b = (ps[knn1].rco[0] - s)*safe_inv(ps[knn1].rco[0] - ps[kn].rco[0] + 0.0001);

          var ret = a*bas(s, i, n - 1) + b*bas(s, i + 1, n - 1);

          if (isNaN(ret)) {
            console.log(a, b, s, i, n, len);
            throw new Error();
          }

          if (Math.random() > 0.99) {
            //console.log(ret, a, b, n, i);
          }
          return ret;
        }
      }

      var p = this._ps[i].rco, nk, pk;
      var deg = this.deg;

      var b = bas(t, i - deg + 1, deg);

      return b;
    }

    evaluate(t) {
      if (this._nocache)
        return this._evaluate(t);

      var a = this[0].rco, b = this[this.length - 1].rco;
      if (t < a[0]) return a[1];
      if (t > b[0]) return b[1];

      if (this.length == 2) {
        t = (t - a[0])/(b[0] - a[0]);
        return a[1] + (b[1] - a[1])*t;
      }

      if (this.recalc) {
        this.regen_basis();
      }

      t *= 0.999999;

      var table = this.hermite;
      var s = t*(table.length/4);

      var i = ~~s;
      s -= i;

      i *= 4;

      return table[i];// + (table[i+3] - table[i])*s; 
    }

    /*
          var start_t = t;

          var swid = 0.05;
          var start = t - swid;

          for (var i=0; i<435; i++) {
            var t2 = Math.min(Math.max(t-swid, 0.0000001), 0.999999999);
            if (this._evaluate2(t2)[0] < t) {
              break;
            }
            swid *= 1.5;
          }

          var ewid=0.05;
          for (var i=0; i<435; i++) {
            var t2 = Math.min(Math.max(t+ewid, 0.0000001), 0.999999999);
            if (this._evaluate2(t2)[0] > t) {
              break;
            }
            ewid *= 1.5;
          }

          var t1 = Math.min(Math.max(t-swid, 0.0000001), 0.99999999);
          var t2 = Math.min(Math.max(t+ewid, 0.0000001), 0.99999999);

          var mid = (t1+t2)*0.5;
          for (var i=0; i<15; i++) {
            var x1 = this._evaluate2(t1), x2 = this._evaluate2(t2);
            var x = this._evaluate2(mid);
            var d1 = Math.abs(x1-t), d2 = Math.abs(x-t), d3=Math.abs(x2-t);

            if (d1 < t) {
              t2 = mid;
            } else {
              t1 = mid;
            }

            var mid = (t1+t2)*0.5;
          }

          t = (t1+t2)*0.5;

          return this._evaluate2(mid)[0];
    */
    _evaluate(t) {
      var start_t = t;

      if (this.length > 1) {
        var a = this[0], b = this[this.length - 1];

        if (t < a[0]) return a[1];
        if (t >= b[0]) return b[1];
      }

      for (var i = 0; i < 35; i++) {
        var df = 0.0001;
        var ret1 = this._evaluate2(t < 0.5 ? t : t - df);
        var ret2 = this._evaluate2(t < 0.5 ? t + df : t);

        var f1 = Math.abs(ret1[0] - start_t);
        var f2 = Math.abs(ret2[0] - start_t);
        var g = (f2 - f1)/df;

        if (f1 == f2) break;

        //if (f1 < 0.0005) break;

        if (f1 == 0.0 || g == 0.0)
          return this._evaluate2(t)[1];

        var fac = -(f1/g)*0.5;

        if (fac == 0.0) {
          fac = 0.01;
        } else if (Math.abs(fac) > 0.1) {
          fac = 0.1*Math.sign(fac);
        }

        t += fac;
        var eps = 0.00001;
        t = Math.min(Math.max(t, eps), 1.0 - eps);
      }

      return this._evaluate2(t)[1];
    }

    _evaluate2(t) {
      var ret = eval2_rets.next();

      t *= 0.9999999;

      var totbasis = 0;
      var sumx = 0;
      var sumy = 0;

      for (var i = 0; i < this._ps.length; i++) {
        var p = this._ps[i].rco;
        var b = this.basis(t, i);

        sumx += b*p[0];
        sumy += b*p[1];

        totbasis += b;
      }

      if (totbasis != 0.0) {
        sumx /= totbasis;
        sumy /= totbasis;
      }

      ret[0] = sumx;
      ret[1] = sumy;

      return ret;
    }
  };

  var CurveWidget = exports.CurveWidget = Class([
    function constructor(bind_obj, setting_id, trigger_redraw) {
      this.curve = new Curve(this);
      this.setting_id = setting_id;
      this.bind_obj = bind_obj;
      this.trigger_redraw = trigger_redraw;

      this.curve.add(0, 0);
      this.curve.add(1, 1);
      this._closed = false;

      this.start_mpos = new Vector2();
      this.transpoints = this.transforming = this.transmode = undefined;

      this.domparent = undefined;
      this.canvas = undefined;
      this.g = undefined;
    },

    function save() {
      localStorage[this.setting_id] = JSON.stringify(this.curve);
      this.bind_obj[this.setting_id.toUpperCase()] = this.curve;
    },

    //default_preset is optional, undefined
    function load(default_preset) {
      if (this.setting_id in localStorage) {
        this.curve.loadJSON(JSON.parse(localStorage[this.setting_id]));
      } else if (default_preset != undefined) {
        this.curve.loadJSON(default_preset);
      }

      this.curve.update();
      this.bind_obj[this.setting_id.toUpperCase()] = this.curve;
    },

    function on_mousedown(e) {
      console.log("canvas mdown");

      this.start_mpos.load(this.transform_mpos(e.x, e.y));

      if (this.curve.highlight != undefined) {
        for (var i = 0; i < this.curve.length; i++) {
          this.curve[i].flag &= ~CurveFlags.SELECT;
        }
        this.curve.highlight.flag |= CurveFlags.SELECT;

        this.transforming = true;
        this.transpoints = [this.curve.highlight];
        this.transpoints[0].startco.load(this.transpoints[0]);

        this.draw();
        return;
      } else {
        var p = this.curve.add(this.start_mpos[0], this.start_mpos[1]);
        this.curve.highlight = p;

        this.curve.update();
        this.draw();

        this.curve.highlight.flag |= CurveFlags.SELECT;
        this.transforming = true;
        this.transpoints = [this.curve.highlight];
        this.transpoints[0].startco.load(this.transpoints[0]);

        this
      }
    },

    function do_highlight(x, y) {
      var trans = this.draw_transform();
      var mindis = 1e17, minp = undefined;
      var limit = 19/trans[0], limitsqr = limit*limit;

      for (var i = 0; i < this.curve.length; i++) {
        var p = this.curve[i];
        var dx = x - p.sco[0], dy = y - p.sco[1], dis = dx*dx + dy*dy;

        if (dis < mindis && dis < limitsqr) {
          mindis = dis;
          minp = p;
        }
      }

      if (this.curve.highlight != minp) {
        this.curve.highlight = minp;
        this.draw();
      }
      //console.log(x, y, minp);
    },

    function do_transform(x, y) {
      var off = new Vector2([x, y]).sub(this.start_mpos);
      this.curve.recalc = 1;

      for (var i = 0; i < this.transpoints.length; i++) {
        var p = this.transpoints[i];
        p.load(p.startco).add(off);

        p[0] = Math.min(Math.max(p[0], 0), 1);
        p[1] = Math.min(Math.max(p[1], 0), 1);
      }

      this.curve.update();
      this.draw();
    },

    function transform_mpos(x, y) {
      var r = this.canvas.getClientRects()[0];

      x -= parseInt(r.left);
      y -= parseInt(r.top);

      var trans = this.draw_transform();

      x = x/trans[0] - trans[1][0];
      y = -y/trans[0] - trans[1][1];

      return [x, y];
    },

    function on_mousemove(e) {
      var mpos = this.transform_mpos(e.x, e.y);
      var x = mpos[0], y = mpos[1];

      if (this.transforming) {
        this.do_transform(x, y);

        if (this.trigger_redraw) {
          redraw_all();
        }
        this.save();
      } else {
        this.do_highlight(x, y);
      }
    },

    function on_mouseup(e) {
      this.transforming = false;
    },

    function on_keydown(e) {
      console.log(e.keyCode);

      switch (e.keyCode) {
        case 88: //xkeey
        case 46: //delete
          console.log(this.curve.highlight);
          if (this.curve.highlight != undefined) {
            this.curve.remove(this.curve.highlight);
            this.recalc = 1;

            this.curve.highlight = undefined;
            this.curve.update();

            this.save();

            if (this.trigger_redraw) {
              redraw_all();
            }

            redraw_all();
          }
          break;
      }
    },

    function bind(dom) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 200;
      this.canvas.height = 200;
      this.g = this.canvas.getContext("2d");

      this.domparent = dom;

      this.canvas.addEventListener("mousedown", this.on_mousedown.bind(this));
      this.canvas.addEventListener("mousemove", this.on_mousemove.bind(this));
      this.canvas.addEventListener("mouseup", this.on_mouseup.bind(this));
      this.canvas.addEventListener("keydown", this.on_keydown.bind(this));

      this.canvas["class"] = "closed";
      this.canvas.style["class"] = "closed";

      dom.appendChild(this.canvas);

      var button = document.createElement("button")

      button.innerHTML = "x";

      dom.appendChild(button);
      this.button = button;

      var this2 = this;
      button.addEventListener("click", function (e) {
        console.log("delete point");

        for (var i = 0; i < this2.curve.length; i++) {
          var p = this2.curve[i];

          if (p.flag & CurveFlags.SELECT) {
            this2.curve.remove(p);
            i--;
          }
        }

        this2.curve.update();
        this2.draw();
        this2.save();
        if (this2.trigger_redraw) {
          redraw_all();
        }
      });
    },

    function draw_transform(g) {
      var sz = Math.min(this.canvas.width, this.canvas.height);
      sz *= 0.8;

      var pan = [0.1, -1.1];

      if (g != undefined) {
        g.lineWidth /= sz;
        g.scale(sz, -sz);
        g.translate(pan[0], pan[1]);
      }

      return [sz, pan];
    },

    Class.getter(function closed() {
      return this._closed;
    }),

    Class.setter(function closed(val) {
      //this.canvas.style["visibility"] = val ? "collapse" : "visible"
      if (val && !this._closed) {
        this.canvas.remove();
        this.button.remove();
      } else if (!val && this._closed) {
        this.domparent.appendChild(this.canvas);
        this.domparent.appendChild(this.button);
      }

      this._closed = val;
    }),

    function draw() {
      var g = this.g;
      var w = this.canvas.width, h = this.canvas.height;

      g.clearRect(0, 0, w, h);

      g.save();
      var sz = this.draw_transform(g)[0];

      g.beginPath();
      g.rect(0, 0, 1, 1);
      g.fillStyle = "rgb(50, 50, 50)";
      g.fill();

      var f = 0, steps = 64;
      var df = 1/(steps - 1);
      var w = 6.0/sz;

      g.beginPath();
      for (var i = 0; i < steps; i++, f += df) {
        var val = this.curve.evaluate(f);

        //var xy = this.curve._evaluate2(f);
        //(i==0 ? g.moveTo : g.lineTo).call(g, xy[0], xy[1], w, w);
        (i == 0 ? g.moveTo : g.lineTo).call(g, f, val, w, w);
      }

      g.strokeStyle = "grey";
      //g.lineWidth *= 3.0;
      g.stroke();
      //g.lineWidth /= 3.0;

      g.lineWidth *= 3.0;
      for (var ssi = 0; ssi < 2; ssi++) {
        //comment out to draw basis functions
        break;

        for (var si = 0; si < this.curve.length; si++) {
          g.beginPath();

          var f = 0;
          for (var i = 0; i < steps; i++, f += df) {
            var totbasis = 0;

            for (var j = 0; j < this.curve.length; j++) {
              totbasis += this.curve.basis(f, j);
            }

            var val = this.curve.basis(f, si);

            if (ssi)
              val /= (totbasis == 0 ? 1 : totbasis);

            (i == 0 ? g.moveTo : g.lineTo).call(g, f, ssi ? val : val*0.5, w, w);
          }

          var color, alpha = this.curve[si] === this.curve.highlight ? 1.0 : 0.3;

          if (ssi) {
            color = "rgba(105, 25, 5," + alpha + ")";
          } else {
            color = "rgba(25, 145, 45," + alpha + ")";
          }
          g.strokeStyle = color;
          g.stroke();
        }
      }
      g.lineWidth /= 3.0;

      g.beginPath();
      for (var i = 0; i < this.curve.length; i++) {
        var p = this.curve[i];
        //console.log(p);

        g.beginPath();

        g.fillStyle = "orange";
        if (p == this.curve.highlight) {
          g.fillStyle = "green";
        } else if (p.flag & CurveFlags.SELECT) {
          g.fillStyle = "red";
        }

        g.rect(p.sco[0] - w/2, p.sco[1] - w/2, w, w);
        g.fill();
      }

      g.lineWidth /= 2;
      g.stroke();
      g.restore();
    }
  ]);

  var destroy_all_settings = exports.destroy_all_settings = function destroy_all_settings() {
    delete localStorage.startup_file_bn9;
  }

  var save_setting = exports.save_setting = function save_setting(key, val) {
    window._appstate.save();
  }

  var load_setting = exports.load_setting = function load_setting(key) {
  }

  var last_update = util.time_ms();
  exports.ui_update_timer = window.setInterval(function () {
    if (util.time_ms() - last_update < 700) {
      return;
    }

    if (window._appstate == undefined) return;
    window._appstate.on_tick();

    last_update = util.time_ms();
  }, 200);

  var UI = exports.UI = class UI {
    constructor(bind_obj, dat_obj) {
      this.dat = dat_obj == undefined ? new dat.GUI() : dat_obj;
      this.bind_obj = bind_obj;

      this.folders = [];
      this.curve_widgets = [];
    }

    listen() {
      //return this.dat.listen({});
    }

    on_tick() {
      if (this.dat == undefined) {
        console.log("warning, dead ui panel");
        return;
      }

      for (var i = 0; i < this.folders.length; i++) {
        this.folders[i].on_tick();
      }

      //update visibility of curve widgets
      var closed = this.dat.closed;
      for (var i = 0; i < this.curve_widgets.length; i++) {
        var cvw = this.curve_widgets[i];

        cvw.closed = closed;
      }
    }

    curve(id, name, default_preset, trigger_redraw) {
      var cw = new CurveWidget(this.bind_obj, id, trigger_redraw);
      cw.load(default_preset);

      var l = this.dat.add({bleh: "name"}, "bleh");

      var parent = l.domElement.parentElement.parentElement.parentElement;

      parent["class"] = parent.style["class"] = "closed";

      cw.bind(parent);
      cw.draw();

      l.remove();

      this.curve_widgets.push(cw);

      return cw;
    }

    panel(name) {
      var f = this.dat.addFolder(name);
      f.open();

      var ui = new UI(this.bind_obj, f);
      this.folders.push(ui);

      return ui;
    }

    close() {
      this.dat.close();
    }

    open() {
      this.dat.open();
    }

    button(id, label, cb, thisvar) {
      return this.dat.add({
        cb: function () {
          if (thisvar != undefined)
            cb.call(thisvar);
          else
            cb();
        }
      }, 'cb').name(label);
    }

    destroy() {
      this.dat.destroy();
      this.dat = undefined;
    }

    listenum(id, list, defaultval, callback, thisvar) {
      var ret = {};
      ret[id] = defaultval;

      var option = this.dat.add(ret, id, list);

      option.onChange(function (value) {
        if (thisvar !== undefined) {
          callback.call(thisvar, value);
        } else {
          callback(value);
        }
      });
    }

    check(id, name, is_param) {
      var ret = {};

      var upperid = id.toUpperCase();

      var val = load_setting(upperid);
      if (val != undefined) {
        this.bind_obj[upperid] = val;
      }

      var this2 = this;

      Object.defineProperty(ret, id, {
        get: function () {
          return !!this2.bind_obj[upperid];
        },

        set: function (val) {
          if (!!this2.bind_obj[upperid] != !!val) {
            this2.bind_obj[upperid] = val;
            save_setting(upperid, val);
            window.redraw_all();
          }
        }
      });

      return this.dat.add(ret, id).name(name).listen();
    }

    slider(id, name, defval, min, max, step, is_int, do_redraw) {
      var ret = {};

      var upperid = id.toUpperCase();

      var val = load_setting(upperid);
      if (val != undefined) {
        this.bind_obj[upperid] = val;
      }

      var this2 = this;
      Object.defineProperty(ret, id, {
        get: function () {
          return Number(this2.bind_obj[upperid]);
        },

        set: function (val) {
          if (do_redraw && this2.bind_obj[upperid] != val) {
            window.redraw_all();
          }

          this2.bind_obj[upperid] = val;
          save_setting(upperid, val);
        }
      });

      return this.dat.add(ret, id).name(name).min(min).max(max).step(step).name(name).listen();
    }
  };

  return exports;
});
