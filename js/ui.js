//bind module to global var to get at it in console.
//
//note that require has an api for handling circular 
//module refs, in such cases do not use these vars.

var _ui = undefined;

define([
  'util', 'dat.gui', 'vectormath', 'linear_algebra'
], function ui(util, dat, vectormath, linear_algebra) {
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

    if (i === 0 || i === n) {
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

      if (obj.deg !== undefined)
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

  var CurveWidget = exports.CurveWidget = class CurveWidget {
    constructor(bind_obj, setting_id, trigger_redraw) {
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
    }

    get closed() {
      return this._closed;
    }

    set closed(val) {
      //this.canvas.style["visibility"] = val ? "collapse" : "visible"
      if (val && !this._closed) {
        this.canvas.remove();
        this.button.remove();
      } else if (!val && this._closed) {
        this.domparent.appendChild(this.canvas);
        this.domparent.appendChild(this.button);
      }

      this._closed = val;
    }

    save() {
      localStorage[this.setting_id] = JSON.stringify(this.curve);
      this.bind_obj[this.setting_id.toUpperCase()] = this.curve;
    }

    //default_preset is optional, undefined
    load(default_preset) {
      if (this.setting_id in localStorage) {
        this.curve.loadJSON(JSON.parse(localStorage[this.setting_id]));
      } else if (default_preset != undefined) {
        this.curve.loadJSON(default_preset);
      }

      this.curve.update();
      this.bind_obj[this.setting_id.toUpperCase()] = this.curve;
    }

    on_mousedown(e) {
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
    }

    do_highlight(x, y) {
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
    }

    do_transform(x, y) {
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
    }

    transform_mpos(x, y) {
      var r = this.canvas.getClientRects()[0];

      x -= parseInt(r.left);
      y -= parseInt(r.top);

      var trans = this.draw_transform();

      x = x/trans[0] - trans[1][0];
      y = -y/trans[0] - trans[1][1];

      return [x, y];
    }

    on_mousemove(e) {
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
    }

    on_mouseup(e) {
      this.transforming = false;
    }

    on_keydown(e) {
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
    }

    bind(dom) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 200;
      this.canvas.height = 200;
      this.g = this.canvas.getContext("2d");

      this.domparent = dom;

      this.canvas.addEventListener("mousedown", this.on_mousedown.bind(this), {capture: true});
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
    }

    draw_transform(g) {
      var sz = Math.min(this.canvas.width, this.canvas.height);
      sz *= 0.8;

      var pan = [0.1, -1.1];

      if (g != undefined) {
        g.lineWidth /= sz;
        g.scale(sz, -sz);
        g.translate(pan[0], pan[1]);
      }

      return [sz, pan];
    }

    draw() {
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
        (i === 0 ? g.moveTo : g.lineTo).call(g, f, val, w, w);
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
              val /= (totbasis === 0 ? 1 : totbasis);

            (i === 0 ? g.moveTo : g.lineTo).call(g, f, ssi ? val : val*0.5, w, w);
          }

          let color, alpha = this.curve[si] === this.curve.highlight ? 1.0 : 0.3;

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
        if (p === this.curve.highlight) {
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
  };

  var destroy_all_settings = exports.destroy_all_settings = function destroy_all_settings() {
    delete localStorage.startup_file_bn9;
  }

  var save_setting = exports.save_setting = function save_setting(key, val) {
    if (window._appstate) {
      window._appstate.save();
    }
  }

  var load_setting = exports.load_setting = function load_setting(key) {
  }

  var last_update = util.time_ms();
  exports.ui_update_timer = window.setInterval(function () {
    if (util.time_ms() - last_update < 700) {
      return;
    }

    if (window._appstate === undefined) return;
    window._appstate.on_tick();

    last_update = util.time_ms();
  }, 200);

  const GradFlags = exports.GradFlags = {
    SELECT: 1
  };

  const GradTypes = exports.GradTypes = {
    CONSTANT: 0,
    LINEAR  : 1,
    SMOOTH  : 2
  };

  let GradPoint = exports.GradPoint = class GradPoint {
    constructor(color, t) {
      this.color = [0, 0, 0, 1];
      this.t = t !== undefined ? t : 0.0;
      this.flag = 0;
      this.type = GradTypes.SMOOTH;
      this.id = -1;

      if (color) {
        this.color[0] = color[0];
        this.color[1] = color[1];
        this.color[2] = color[2];
        this.color[3] = color[3];
      }
    }

    copy() {
      let gp = new GradPoint(this.color);
      
      gp.t = this.t;
      gp.flag = this.flag;
      gp.id = this.id;
      gp.type = this.type;
      
      return gp;
    }
    
    toJSON() {
      return {
        color: this.color,
        t    : this.t,
        flag : this.flag,
        type : this.type,
        id   : this.id
      }
    }

    loadJSON(json) {
      this.color = json.color;
      this.t = json.t;
      this.type = json.type;
      this.flag = json.flag;
      this.id = json.id;

      return this;
    }
  }

  let grets = new util.cachering(() => [0, 0, 0, 0], 512);

  let Gradient = exports.Gradient = class Gradient extends Array {
    constructor() {
      super();

      this.cyclic = true;

      this.brightness = 0.0;
      this.contrast = 1.0;
      this.postBrightness = 0.0;
      this.postContrast = 1.0;

      this.satOffset = 1.0;
      this.hueOffset = 0.0;
      
      this.active = undefined;
      this.highlight = undefined;
      this.idgen = 1;

      this.tableSteps = 255;
      this.tables = undefined;

      this.regen = 0;

      this.idMap = new Map();

      this.addStop([0, 0, 0, 1], 0.0);
      this.addStop([1, 1, 1, 1], 1.0);
    }

    copy() {
      let g = new Gradient();
      
      g.regen = 1;
      
      g.idgen = this.idgen;
     
      g.cyclic = this.cyclic;
      g.tableSteps = this.tableSteps;
      
      g.postBrightness = this.postBrightness;
      g.postContrast = this.postContrast;
      g.contrast = this.contrast;
      g.brightness = this.brightness;
      
      for (let gp of this) {
        let gp2 = gp.copy();
        
        g.idMap.set(gp2.id, gp2);
        g.push(gp2);
        
        if (gp === this.active) {
          g.active = gp2;
        }
        
        if (gp === this.highlight) {
          g.highlight = gp2;
        }
      }
      g.resort();
      
      return g;
    }
    
    getTables() {
      if (!this.tables || this.regen) {
        let steps = this.tableSteps;

        this.tables = [new Array(steps), new Array(steps), new Array(steps), new Array(steps)];

        let t = 0, dt = 1.0/(steps - 1);
        for (let i = 0; i < steps; i++, t += dt) {
          let color = this.evaluate(t);

          for (let j = 0; j < 4; j++) {
            this.tables[j][i] = color[j];
          }
        }

        this.regen = 0;
      }

      return this.tables;
    }

    reset() {
      this.length = 0;
      
      this.addStop([0, 0, 0, 1], 0);
      this.addStop([1, 1, 1, 1], 1);
      this.regen = 1;
    }
    
    removeStop(gp) {
      this.idMap.delete(gp.id);
      
      gp.id = -1;
      this.regen = 1;

      this.remove(gp);
    }

    addStop(color, t, setActive = false) {
      let gp = new GradPoint(color, t);

      gp.id = this.idgen++;
      this.idMap.set(gp.id, gp);

      this.push(gp);
      this.resort();
      this.regen = 1;

      if (setActive) {
        this.active = gp;
      }

      return gp;
    }

    resort() {
      this.sort((a, b) => a.t - b.t);
    }

    toJSON() {
      let stops = [];
      for (let gp of this) {
        stops.push(gp);
      }

      return {
        stops,
        brightness    : this.brightness,
        contrast      : this.contrast,
        postBrightness: this.postBrightness,
        postContrast  : this.postContrast,
        active        : this.active ? this.active.id : -1,
        highlight     : this.highlight ? this.highlight.id : -1,
        version       : 0.1,
        idgen         : this.idgen,
        satOffset     : this.satOffset,
        hueOffset     : this.hueOffset
      }
    }

    loadJSON(json) {
      this.length = 0;
      this.regen = 1;
      this.idMap = new Map();
      
      this.idgen = json.idgen;

      if (!("idgen" in json)) {
        this.idgen = 0;
        
        for (let jp of json.stops) {
          this.idgen = Math.max(this.idgen, jp.id + 1);
        }
      }
      
      for (let jp of json.stops) {
        let gp = new GradPoint();

        gp.loadJSON(jp);

        this.idMap.set(gp.id, gp);

        this.push(gp);
      }

      this.brightness = json.brightness;// ?? 0.0;
      this.contrast = json.contrast;// ?? 1.0;
      this.postBrightness = json.postBrightness ?? 0.0;
      this.postContrast = json.postContrast ?? 1.0;

      this.hueOffset = json.hueOffset ?? 0.0;
      this.satOffset = json.satOffset ?? 1.0;
      
      this.highlight = this.idMap.get(json.highlight);
      this.active = this.idMap.get(json.active);

      return this;
    }

    evaluate(t, no_b_c) {
      if (!no_b_c) {
        //t = (t + this.brightness)*this.contrast;
        t = t*this.contrast + this.brightness;
      }

      if (!this.cyclic) {
        t = Math.min(Math.max(t, 0.0), 1.0);
      } else {
        t = Math.tent(t*0.5);
      }
      
      let gp1 = this[0];
      let gp2 = this[1];
      let i1 = 0;
      
      for (let i = 0; i < this.length; i++) {
        gp2 = this[i];

        if (this[i].t >= t) {
          break;
        }

        gp1 = this[i];
        i1 = i;
      }

      if (t < gp1.t) {
        return gp1.color;
      }

      if (t >= gp2.t) {
        return gp2.color;
      }
      
      let s = (t - gp1.t)/(gp2.t - gp1.t);
      let cret = grets.next();
      
      let dosmooth = false;
      
      //s = s*s*(3.0 - 2.0*s);
      switch (gp1.type) {
        case GradTypes.CONSTANT:
          s = s > 0.5 ? 1.0 : 0.0;
          break;
        case GradTypes.SMOOTH:
          if (i1 > 0) {
            dosmooth = true;
          } else {
            s = s*s*(3.0 - 2.0*s);
          }
          break;
      }
      
      if (0&&dosmooth) {
        let gp0 = this[i1-1];
        let gp3 = i1 < this.length - 2 ? this[i1 + 2] : gp2;
        
        for (let i = 0; i < 4; i++) {
          let p1 = gp1.color[i];
          let p4 = gp2.color[i];

          let p2 = p1 + (gp1.color[i] - gp0.color[i]) / 3.0;
          let p3 = p4 + (gp2.color[i] - gp3.color[i]) / 3.0;
          
          //p2 = p1;
          //p3 = p4;
          
          let a = p1 + (p2 - p1)*s;
          let b = p2 + (p3 - p2)*s;
          let c = p3 + (p4 - p3)*s;
          
          let a2 = a + (b - a)*s;
          let b2 = b + (c - b)*s;
          
          cret[i] = a2 + (b2 - a2)*s;
          
          if (!no_b_c) {
            cret[i] = (cret[i] + this.postBrightness)*this.postContrast;
          }
        }
      } else {        
        for (let i = 0; i < 4; i++) {
          cret[i] = gp1.color[i] + (gp2.color[i] - gp1.color[i])*s;
          
          if (!no_b_c) {
            cret[i] = (cret[i] + this.postBrightness)*this.postContrast;
          }
        }
      }
      
      if (1 || !no_b_c) {
        let hsv = util.rgb_to_hsv(cret[0], cret[1], cret[2]);
        
        hsv[0] = Math.fract(hsv[0] + this.hueOffset);
        hsv[1] *= this.satOffset;
        
        let rgb = util.hsv_to_rgb(hsv[0], hsv[1], hsv[2]);
        
        cret[0] = rgb[0];
        cret[1] = rgb[1];
        cret[2] = rgb[2];
      }
      
      return cret;
    }
  }

  let GradientWidget = exports.GradientWidget = class GradientWidget {
    constructor(bind_obj, id, dat) {
      this.dat = dat;
      this.id = id;
      this.bind_obj = bind_obj;
      this.canvas = undefined;
      this.g = undefined;
      this.gradient = new Gradient();

      this.undoGen = 0;
      
      this.mdown = false;
      this.transforming = false;
      this.transdata = undefined;
      this.mpos = [0, 0];

      this.gcanvas = document.createElement("canvas");
      this.gcanvas.width = 255;
      this.gcanvas.height = 1;
      this.gimg = new ImageData(this.gcanvas.width, this.gcanvas.height);
      this.gcanvas.g = this.gcanvas.getContext("2d");

      this.lastT = 0.5;

      this.__color = [0, 0, 0, 0];

      this._animreq = undefined;
      this.onchange = null;
    }
    
    get _hue() {
      return this.gradient.hueOffset;
    }
    
    set _hue(v) {
      this.gradient.hueOffset = v;
      this.gradient.regen = 1;
      this.bind_obj[this.id] = this.gradient;
      this.redraw();
      
      if (this.onchange) {
        this.onchange()
      }
    }
    
    get _sat() {
      return this.gradient.satOffset;
    }
    
    set _sat(v) {
      this.gradient.satOffset = v;
      this.gradient.regen = 1;
      this.bind_obj[this.id] = this.gradient;
      this.redraw();
    }
    
    get _alpha() {
      let c = this.__color;
      let gp = this.gradient.active;

      if (!gp) {
        return 0.0;
      }
      
      return gp.color[3];
    }
    
    set _alpha(val) {
      let c = this.__color;
      let gp = this.gradient.active;

      if (!gp) {
        return 0.0;
      }
      
      this.bind_obj[this.id] = this.gradient;
      
      gp.color[3] = val;      
      this.redraw();
    }
    
    get _color() {
      let c = this.__color;
      let gp = this.gradient.active;

      if (!gp) {
        c[0] = c[1] = c[2] = c[3] = 0.0;
        return c;
      }

      c[0] = gp.color[0]*255;
      c[1] = gp.color[1]*255;
      c[2] = gp.color[2]*255;
      c[3] = gp.color[3];

      return c;
    }

    set _color(v) {
      let c = this.__color;
      let gp = this.gradient.active;

      if (!gp) {
        return;
      }

      gp.color[0] = v[0]/255.0;
      gp.color[1] = v[1]/255.0;
      gp.color[2] = v[2]/255.0;
      gp.color[3] = v[3];

      this.bind_obj[this.id] = this.gradient;
      this.redraw();
    }

    get brightness() {
      return this.gradient.brightness;
    }

    set brightness(v) {
      this.gradient.brightness = v;
    }

    get contrast() {
      return this.gradient.contrast;
    }

    set contrast(v) {
      this.gradient.contrast = v;
    }

    get brightness2() {
      return this.gradient.postBrightness;
    }

    set brightness2(v) {
      this.gradient.postBrightness = v;
    }

    get contrast2() {
      return this.gradient.postContrast;
    }

    set contrast2(v) {
      this.gradient.postContrast = v;
    }

    get cyclic() {
      return !!this.gradient.cyclic;
    }

    set cyclic(v) {
      this.gradient.cyclic = !!v;
    }

    undoPush(type="gradient", combine=false) {
      console.log("gradient undo push", this.undostack);
      
      if (!this.undostack) {
        return;
      }

      if (combine) {
        type += this.undoGen;
      }
      
      if (combine && this.undostack.head && this.undostack.head.type === type) {
        //this.undostack.head.data = this.gradient.copy();
        return;
      }
      
      this.undostack.pushSwapper(type, this.gradient.copy(), (g) => {
        let tmp = this.gradient.copy();
        
        this.gradient.loadJSON(g.toJSON());
        g.loadJSON(tmp.toJSON());
        
        this.redraw();
        this.save();
        
        if (this.onchange) {
          this.onchange();
        }
      });
    }
    
    start() {
      let canvas = this.canvas = document.createElement("canvas");
      console.error(this.dat);

      var l = this.dat.add({bleh: "name"}, "bleh");
      var parent = l.domElement.parentElement.parentElement.parentElement;

      //parent["class"] = parent.style["class"] = "closed";
      l.domElement.parentElement.remove();

      let g = this.g = canvas.getContext("2d");

      this.updateCanvasSize();
      this.draw();

      parent.appendChild(canvas);

      this.dat.add(this, "_alpha")
      .name("Alpha")
      .onChange(() => {
          this.gradient.regen = 1;
          this.save();
          
          if (this.onchange) {
            this.onchange();
          }
      })
      .min(0.0)
      .max(1.0)
      .listen();
      
      this.dat.addColor(this, "_color")
        .name("Color")
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
          
          if (this.onchange) {
            this.onchange();
          }
        })
        .listen();

      this.dat.add(this, "brightness")
        .min(-0.5)
        .max(1.5)
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
        })
        .listen();

      this.dat.add(this, "contrast")
        .min(0.0001)
        .max(15.0)
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
        })
        .listen();

      this.dat.add({
        cb: () => {
          this.undoPush();

          console.log("click")
          let t = this.lastT;

          this.gradient.addStop(this.gradient.evaluate(t, true), t, true);
          this.redraw();
          this.save();

          if (this.onchange) {
            this.onchange();
          }
        }
      }, "cb").name("Add");

      this.dat.add({
        cb: () => {
          this.undoPush();
          
          console.log("click")
          let t = this.lastT;

          if (this.gradient.active) {
            this.gradient.removeStop(this.gradient.active);
          }

          this.redraw();
          this.save();

          if (this.onchange) {
            this.onchange();
          }
        }
      }, "cb").name("X");

      this.dat.add(this, "cyclic")
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
        })
        .listen();

      this.dat.add(this, "_hue")
      .name("Hue")
      .onChange(() => {
          this.gradient.regen = 1;
          this.save();
          
          if (this.onchange) {
            this.onchange();
          }
      })
      .min(0.0)
      .max(1.0)
      .listen();
      
       this.dat.add(this, "_sat")
      .name("Saturation")
      .onChange(() => {
          this.gradient.regen = 1;
          this.save();
          
          if (this.onchange) {
            this.onchange();
          }
      })
      .min(0.0)
      .max(1.0)
      .listen();
      this.dat.add(this, "brightness2")
        .min(-0.5)
        .max(1.5)
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
        })
        .listen();

      this.dat.add(this, "contrast2")
        .min(0.0001)
        .max(3.0)
        .onChange(() => {
          this.gradient.regen = 1;
          this.save();
        })
        .listen();


      this.startEvents();
    }

    save() {
      this.bind_obj[this.id] = this.gradient;
      save_setting(this.id, this.gradient);

      console.log("save gradient");

      return this;
    }

    load() {
      this.gradient = this.bind_obj[this.id];

      if (!this.gradient) {
        this.gradient = this.bind_obj[this.id] = new Gradient();
      } else if (!(this.gradient instanceof Gradient)) {
        this.gradient = this.bind_obj[this.id] = new Gradient().loadJSON(this.gradient);
      }

      this.gradient.regen = 1;
      this.redraw();

      if (this.onchange) {
        this.onchange();
      }

      return this;
    }

    redraw() {
      if (this._animreq !== undefined) {
        return;
      }

      this._animreq = requestAnimationFrame(() => {
        this._animreq = undefined;
        this.draw();
      });
    }

    draw() {
      let g = this.g, canvas = this.canvas;

      g.clearRect(0, 0, canvas.width, canvas.height);

      let cellsize = 10;
      let steps = Math.ceil(canvas.width/cellsize);
      let x = 0, y = 0;

      let rows = Math.ceil(canvas.height/cellsize);

      for (let row = 0; row < rows; row++) {
        for (let step = 0; step < 2; step++) {
          g.beginPath();

          x = 0;
          g.fillStyle = step ? "rgb(200,200,200)" : "white";

          for (let i = 0; i < steps; i++) {
            if ((i + row)%2 === step) {
              g.rect(x, y, cellsize, cellsize);
            }

            x += cellsize;
          }
          g.fill();
        }
        y += cellsize;
      }

      let gg = this.gcanvas.g;
      let gw = this.gcanvas.width;
      let idata = this.gimg.data;

      for (let i = 0; i < gw; i++) {
        let t = i/(gw - 1);

        let c = this.gradient.evaluate(t, true);

        idata[i*4 + 0] = c[0]*255;
        idata[i*4 + 1] = c[1]*255;
        idata[i*4 + 2] = c[2]*255;
        idata[i*4 + 3] = c[3]*255;
      }

      gg.putImageData(this.gimg, 0, 0);
      g.save();

      g.drawImage(this.gcanvas, 0, 0, this.gcanvas.width, this.gcanvas.height, 0, 0, this.canvas.width, this.canvas.height);
      g.restore();

      let r = 3;

      let pad = r;

      for (let gp of this.gradient) {
        //let x = gp.t * (this.canvas.width - pad*2.0) - r*0.5;
        //x += pad;
        let x = this.t2x(gp.t);

        g.beginPath();

        if (gp === this.gradient.active) {
          g.fillStyle = "rgba(255, 255, 255, 1.0)";
        } else if (gp !== this.gradient.highlight) {
          g.fillStyle = "rgba(255, 150, 25, 1.0)";
        } else {
          g.fillStyle = "rgba(200, 200, 200, 1.0)";
        }
        g.rect(x, 0, r*2, this.canvas.height);
        g.fill();
      }
    }

    startEvents() {
      this.canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        return this.on_mousedown(e);
      }, {capture : true});

      this.canvas.addEventListener("mousemove", (e) => {
        e.preventDefault();
        e.stopPropagation();
        return this.on_mousemove(e);
      });

      this.canvas.addEventListener("mouseup", (e) => {
        e.preventDefault();
        e.stopPropagation();
        return this.on_mouseup(e);
      });

      let makeTouchEvent = (e) => {
        return Object.assign({}, e, {
          x : e.touches.length > 0 ? e.touches[0].pageX : this.mpos[0],
          y : e.touches.length > 0 ? e.touches[0].pageY : this.mpos[1],
          button : e.touches.length === 1 ? 0 : 1
        })
      }

      this.canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.on_mousedown(makeTouchEvent(e));
      }, {capture : true})

      this.canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.on_mousemove(makeTouchEvent(e));
      }, {capture : true})

      this.canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.on_mouseup(makeTouchEvent(e));
      }, {capture : true})

      this.canvas.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.on_mouseup(makeTouchEvent(e));
      }, {capture : true})
    }

    getLocalMouse(x, y) {
      let r = this.canvas.getBoundingClientRect();

      let dpi = devicePixelRatio;

      x -= r.x;
      y -= r.y;

      x *= dpi;
      y *= dpi;

      return [x, y];
    }

    on_mousedown(e) {
      let mpos = this.getLocalMouse(e.x, e.y);

      this.undoGen++;
      
      this.mpos[0] = mpos[0];
      this.mpos[1] = mpos[1];

      let t = this.x2t(mpos[0]);
      this.lastT = t;

      if (this.gradient.highlight) {
        this.gradient.active = this.gradient.highlight;
      } else {
        this.gradient.active = undefined;
      }

      this.redraw();

      if (e.button === 0) {
        this.mdown = true;
        this.startTransform(mpos);
      }
    }

    on_mousemove_transform(e) {
      this.undoPush("gradient_transform", true);
      
      let mpos = this.getLocalMouse(e.x, e.y);

      this.mpos[0] = mpos[0];
      this.mpos[1] = mpos[1];

      //let dx = mpos[0] - this.transdata.start_mpos[0];
      let start_t = this.x2t(this.transdata.start_mpos[0]);
      let t = this.x2t(mpos[0]);

      let dt = t - start_t;

      let gp = this.transdata.gp;
      gp.t = this.transdata.startT;

      gp.t += dt;
      gp.t = Math.min(Math.max(gp.t, 0.0), 1.0);

      this.gradient.regen = 1;
      this.gradient.resort();

      this.redraw();
      this.save();

      this.bind_obj[this.id] = this.gradient;

      if (this.onchange) {
        this.onchange();
      }
    }

    startTransform(mpos) {
      if (!this.gradient.active) {
        return;
      }

      this.transdata = {
        start_mpos: [mpos[0], mpos[1]],
        last_mpos : [mpos[0], mpos[1]],
        gp        : this.gradient.active,
        startT    : this.gradient.active.t
      }

      this.transforming = true;
    }

    on_mousemove(e) {
      if (this.transforming) {
        this.on_mousemove_transform(e);
        return;
      }

      let mpos = this.getLocalMouse(e.x, e.y);

      if (this.mdown) {

      } else {
        let t = this.x2t(mpos[0]);
        let mingp, mindis = 1e17;

        for (let gp of this.gradient) {
          if (Math.abs(gp.t - t) < mindis) {
            mindis = Math.abs(gp.t - t);
            mingp = gp;
          }
        }

        let limit = 0.25;
        if (mindis > limit) {
          mingp = undefined;
        }

        if (mingp !== this.gradient.highlight) {
          console.log(mingp, "t", t);
          this.gradient.highlight = mingp;
          this.redraw();
        }
      }

      this.mpos[0] = mpos[0];
      this.mpos[1] = mpos[1];
    }

    on_mouseup() {
      this.mdown = false;
      this.transforming = false;
      this.transdata = undefined;
    }

    x2t(x) {
      let pad = 3;
      let r = 3;

      x -= pad;
      x += r*0.5;

      x /= (this.canvas.width - pad*2.0);

      return x;
    }

    t2x(t) {
      let pad = 3;
      let r = 3;

      return t*(this.canvas.width - pad*2.0) - r*0.5 + pad;
    }

    updateCanvasSize() {
      let dpi = devicePixelRatio;
      let w = ~~(240*dpi), h = ~~(50*dpi);

      this.canvas.width = w;
      this.canvas.height = h;

      this.canvas.style["width"] = (w/dpi) + "px";
      this.canvas.style["height"] = (h/dpi) + "px";
    }
  }

  var UI = exports.UI = class UI {
    constructor(bind_obj, dat_obj, undostack) {
      this.dat = dat_obj === undefined ? new dat.GUI() : dat_obj;
      this.bind_obj = bind_obj;

      this.folders = [];
      this.curve_widgets = [];
      this.gradient_widgets = [];
      
      this.undostack = undostack;
    }

    listen() {
      //return this.dat.listen({});
    }

    on_tick() {
      if (this.dat === undefined) {
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

    load() {
      for (let grad of this.gradient_widgets) {
        grad.load();
      }

      for (let f of this.folders) {
        f.load();
      }

      return this;
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

      var ui = new UI(this.bind_obj, f, this.undostack);
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

      var id = id.toUpperCase();

      var val = load_setting(id);
      if (val != undefined) {
        this.bind_obj[id] = val;
      }

      var this2 = this;

      Object.defineProperty(ret, id, {
        get: function () {
          return !!this2.bind_obj[id];
        },

        set: function (val) {
          if (!!this2.bind_obj[id] != !!val) {
            this2.bind_obj[id] = val;
            save_setting(id, val);
            window.redraw_all();
          }
        }
      });

      return this.dat.add(ret, id).name(name).listen();
    }

    color(id, name, defval, do_redraw = true) {
      var ret = {};


      var val = load_setting(id);
      if (val !== undefined) {
        this.bind_obj[id] = val;
      }

      var this2 = this;
      Object.defineProperty(ret, id, {
        get: function () {
          let c = this2.bind_obj[id];
          if (!c) {
            return [0, 0, 0, 1];
          }

          //make copy
          c = c.concat([]);

          c[0] *= 255;
          c[1] *= 255;
          c[2] *= 255;

          return c;
        },

        set: function (val) {
          let c = this2.bind_obj[id];

          if (!c) {
            c = this2.bind_obj[id] = [0, 0, 0, 0];
          }

          if (do_redraw) {
            let dr = c[0] - val[0]/255;
            let dg = c[1] - val[1]/255;
            let db = c[2] - val[2]/255;
            let da = c.length > 3 ? c[3] - val[3] : 0.0;
            da = isNaN(da) ? 1.0 : da;

            if (Math.abs(dr*dr + dg*dg + db*db + da*da) > 0.001) {
              window.redraw_all();
            }
          }

          c[0] = val[0]/255.0;
          c[1] = val[1]/255.0;
          c[2] = val[2]/255.0;

          if (c.length > 3 && val.length > 3) {
            c[3] = val[3];
          }

          save_setting(id, c);
        }
      });

      return this.dat.addColor(ret, id).name(name).listen();
    }

    gradient(id, name) {
      let panel = this.dat.addFolder(name);
      panel.open();

      let grad = new GradientWidget(this.bind_obj, id, panel);
      grad.undostack = this.undostack;
      grad.start();

      this.gradient_widgets.push(grad);
      grad.load();
    }

    slider(id, name, defval, min, max, step, is_int, do_redraw) {
      var ret = {};

      var val = load_setting(id);
      if (val !== undefined) {
        this.bind_obj[id] = val;
      }

      var this2 = this;
      Object.defineProperty(ret, id, {
        get: function () {
          return Number(this2.bind_obj[id]);
        },

        set: function (val) {
          if (do_redraw && this2.bind_obj[id] != val) {
            window.redraw_all();
          }

          this2.bind_obj[id] = val;
          save_setting(id, val);
        }
      });

      return this.dat.add(ret, id).name(name).min(min).max(max).step(step).name(name).listen();
    }
  };

  return exports;
});
