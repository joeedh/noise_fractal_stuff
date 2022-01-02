"use strict";

import * as util from './util.js';
import * as vectormath from './vectormath.js';

import {Vector2, Vector3, Vector4, Matrix4, Quat} from './vectormath.js';

let dtvtmps = util.cachering.fromConstructor(Vector3, 32);


let quad_co_rets2 = util.cachering.fromConstructor(Vector2, 512);

export function quad_bilinear(v1, v2, v3, v4, u, v) {
  return -((v1-v2)*u-v1-(u*v1-u*v2+u*v3-u*v4-v1+v4)*v);
}
/*

 on factor;
 off period;

 a1 := v1 + (v2 - v1) * u;
 a2 := v4 + (v3 - v4) * u;
 bilin := a1 + (a2 - a1) * v;

 v1x := 0;
 v1y := 0;

 bx := sub(v1=v1x, v2=v2x, v3=v3x, v4=v4x, bilin);
 by := sub(v1=v1y, v2=v2y, v3=v3y, v4=v4y, bilin);

 f1 := bx - x;
 f2 := by - y;

 ff := solve({f1, f2}, {u, v});

 */
function quad_uv_2d(p, v1, v2, v3, v4) {
  let u, v;

  let v2x = v2[0] - v1[0];
  let v2y = v2[1] - v1[1];
  let v3x = v3[0] - v1[0];
  let v3y = v3[1] - v1[1];
  let v4x = v4[0] - v1[0];
  let v4y = v4[1] - v1[1];

  let x = p[0] - v1[0];
  let y = p[1] - v1[1];
  let sqrt = Math.sqrt;

  let A = 2*(((v4y+y)*x-2*v4x*y)*
    v3y+(v4x*y-v4y*x)*(v4y+y)-((v4x-x)*v2y-v3x*y)*(v4y-y))*v2x-2*(
    (v4x*y-v4y*x)*(v4x+x)-(v4x-x)*v3y*x+((2*v4y-y)*x-v4x*y)*v3x)*
    v2y+(v4x*y-v4y*x+v3y*x-v3x*y)**2+(v4x-x)**2*v2y**2+(v4y-y)**2*
    v2x**2;

  let B = v4x*y-v4y*x+v3y*x-v3x*y;

  let C1 = (2*(v3x-v4x)*v2y-2*(v3y-v4y)*v2x);
  let C2 = (2*(v3x*v4y-v3y*v4x+v2y*v4x)-2*v2x*v4y);

  let u1, u2;

  if (A < 0.0) {
    console.log("A was < 0", A);
    A = -A;
    C1 = C2 = 0.0;
  }

  if (Math.abs(C1) < 0.00001) { //perfectly 90 degrees?
    let dx = v2x;
    let dy = v2y;

    console.log("C1 bad");

    let l = Math.sqrt(dx*dx + dy*dy);
    if (l > 0.000001) {
      dx /= l*l;
      dy /= l*l;
    }

    u1 = u2 = dx*x + dy*y;
  } else {
    u1=(-(B+sqrt(A)-(v4y-y)*v2x)-(v4x-x)*v2y)/C1;
    u2=(-(B-sqrt(A)-(v4y-y)*v2x)-(v4x-x)*v2y)/C1;
  }

  if (Math.abs(C2) < 0.00001) { //perfectly 90 degrees?
    let dx, dy;

    dx = v3x - v2x;
    dy = v3y - v2y;

    console.log("C2 bad");

    let l = Math.sqrt(dx**2 + dy**2);
    if (l > 0.00001) {
      dx /= l*l;
      dy /= l*l;
    }

    v1 = v2 = x*dx + y*dy;
  } else {
    v1=(-(B-sqrt(A)+(v4y+y)*v2x)+(v4x+x)*v2y)/C2;
    v2=(-(B+sqrt(A)+(v4y+y)*v2x)+(v4x+x)*v2y)/C2;
  }

  let ret = quad_co_rets2.next();

  let d1 = (u1-0.5)**2 + (v1-0.5)**2;
  let d2 = (u2-0.5)**2 + (v2-0.5)**2;

  if (d1 < d2) {
    ret[0] = u1;
    ret[1] = v1;
  } else {
    ret[0] = u2;
    ret[1] = v2;
  }

  return ret;
}


export const ClosestModes = {
  CLOSEST  : 0,
  START    : 1,
  END      : 2,
  ENDPOINTS: 3,
  ALL      : 4
};

let advs = util.cachering.fromConstructor(Vector4, 128);

export class AbstractCurve {
  evaluate(t) {
    throw new Error("implement me");
  }

  derivative(t) {
  }

  curvature(t) {

  }

  normal(t) {

  }

  width(t) {

  }
}

export class ClosestCurveRets {
  constructor() {
    this.p = new Vector3();
    this.t = 0;
  }
}

let cvrets = util.cachering.fromConstructor(ClosestCurveRets, 2048);
let cvarrays = new util.ArrayPool();
let cvtmp = new Array(1024);

export function closestPoint(p, curve, mode) {
  let steps = 5;
  let s = 0, ds = 1.0/steps;

  let ri = 0;

  for (let i = 0; i < steps; i++, s += ds) {
    let c1 = curve.evaluate(s);
    let c2 = curve.evaluate(s + ds);


  }
}

let poly_normal_tmps = util.cachering.fromConstructor(Vector3, 64);
let pncent = new Vector3();

export function normal_poly(vs) {
  if (vs.length === 3) {
    return poly_normal_tmps.next().load(normal_tri(vs[0], vs[1], vs[2]));
  } else if (vs.length === 4) {
    return poly_normal_tmps.next().load(normal_quad(vs[0], vs[1], vs[2], vs[3]));
  }

  if (vs.length === 0) {
    return poly_normal_tmps.next().zero();
  }

  let cent = pncent.zero();
  let tot = 0;

  for (let v of vs) {
    cent.add(v);
    tot++;
  }

  cent.mulScalar(1.0/tot);
  let n = poly_normal_tmps.next().zero();

  for (let i = 0; i < vs.length; i++) {
    let a = vs[i];
    let b = vs[(i + 1)%vs.length];
    let c = cent;

    let n2 = normal_tri(a, b, c);
    n.add(n2);
  }

  n.normalize();
  return n;
}

/*
on factor;
off period;

f1 := u*v1x + v*v2x + (1.0-u-v)*v3x - px;
f2 := u*v1y + v*v2y + (1.0-u-v)*v3y - py;

ff := solve({f1, f2}, {u, v});

on fort;
part(ff, 1, 1);
part(ff, 1, 2);
off fort;

*/

let barycentric_v2_rets = util.cachering.fromConstructor(Vector2, 2048);
let calc_proj_refs = new util.cachering(() => [0, 0], 64);

/*
  a b c d
     b

  a------c

     d

  on factor;
  load_package avector;

  ax := 0;
  ay := 0;
  az := 0;

  a := avec(ax, ay, az);
  b := avec(bx, by, bz);
  c := avec(cx, cy, cz);
  d := avec(dx, dy, dz);

  n1 := d cross c;
  n2 := c cross b;

  n1 := n1 / (VMOD n1);
  n2 := n2 / (VMOD n2);

  d := n1 dot n2;
  on fort;

  d*d;

  off fort;


  */

/**

 v2

 v1------v3

 v4

 */
export function dihedral_v3_sqr(v1, v2, v3, v4) {
  let bx = v2[0] - v1[0];
  let by = v2[1] - v1[1];
  let bz = v2[2] - v1[2];

  let cx = v3[0] - v1[0];
  let cy = v3[1] - v1[1];
  let cz = v3[2] - v1[2];

  let dx = v4[0] - v1[0];
  let dy = v4[1] - v1[1];
  let dz = v4[2] - v1[2];


  return ((bx*cz - bz*cx)*(cx*dz - cz*dx) + (by*cz - bz*cy)*(cy*dz - cz*dy) + (bx*cy - by*cx)*
    (cx*dy - cy*dx))**2/(((bx*cz - bz*cx)**2 + (by*cz - bz*cy)**2
    + (bx*cy - by*cx)**2)*((cx*dz - cz*dx)**2 + (cy*dz - cz*dy)**2 + (cx*dy - cy*dx)**2));
}

let tet_area_tmps = util.cachering.fromConstructor(Vector3, 64);

export function tet_volume(a, b, c, d) {
  a = tet_area_tmps.next().load(a);
  b = tet_area_tmps.next().load(b);
  c = tet_area_tmps.next().load(c);
  d = tet_area_tmps.next().load(d);

  a.sub(d);
  b.sub(d);
  c.sub(d);

  b.cross(c);
  return a.dot(b)/6.0;
}

export function calc_projection_axes(no) {
  let ax = Math.abs(no[0]), ay = Math.abs(no[1]), az = Math.abs(no[2]);

  let ret = calc_proj_refs.next();

  if (ax > ay && ax > az) {
    ret[0] = 1;
    ret[1] = 2;
  } else if (ay > az && ay > ax) {
    ret[0] = 0;
    ret[1] = 2;
  } else {
    ret[0] = 0;
    ret[1] = 1;
  }

  return ret;
}

let _avtmps = util.cachering.fromConstructor(Vector3, 128);

function inrect_3d(p, min, max) {
  let ok = p[0] >= min[0] && p[0] <= max[0];
  ok = ok && p[1] >= min[1] && p[1] <= max[1];
  ok = ok && p[2] >= min[2] && p[2] <= max[2];

  return ok;
}

export function aabb_isect_line_3d(v1, v2, min, max) {
  let inside = inrect_3d(v1, min, max);
  inside = inside || inrect_3d(v2, min, max);

  if (inside) {
    return true;
  }

  let cent = _avtmps.next().load(min).interp(max, 0.5);

  let p = closest_point_on_line(cent, v1, v2, true);
  if (!p) {
    return false;
  }

  p = p[0];

  return inrect_3d(p, min, max);
}

export function aabb_isect_cylinder_3d(v1, v2, radius, min, max) {
  let inside = inrect_3d(v1, min, max);
  inside = inside || inrect_3d(v2, min, max);

  if (inside) {
    return true;
  }

  let cent = _avtmps.next().load(min).interp(max, 0.5);

  let p = closest_point_on_line(cent, v1, v2, true);
  if (!p) {
    return false;
  }

  p = p[0];

  let size = _avtmps.next().load(max).sub(min);

  size.mulScalar(0.5);
  size.addScalar(radius); //*(3**0.5));

  p.sub(cent).abs();

  return p[0] <= size[0] && p[1] <= size[1] && p[2] <= size[2];
}

export function barycentric_v2(p, v1, v2, v3, axis1 = 0, axis2 = 1, out = undefined) {
  let div = (v2[axis1]*v3[axis2] - v2[axis2]*v3[axis1] + (v2[axis2] - v3[axis2])*v1[axis1] - (v2[axis1] - v3[axis1])*v1[axis2]);

  if (Math.abs(div) < 0.000001) {
    div = 0.00001;
  }

  let u = (v2[axis1]*v3[axis2] - v2[axis2]*v3[axis1] + (v2[axis2] - v3[axis2])*p[axis1] - (v2[axis1] - v3[axis1])*p[axis2])/div;
  let v = (-(v1[axis1]*v3[axis2] - v1[axis2]*v3[axis1] + (v1[axis2] - v3[axis2])*p[axis1]) + (v1[axis1] - v3[axis1])*p[axis2])/div;

  if (!out) {
    out = barycentric_v2_rets.next();
  }

  out[0] = u;
  out[1] = v;

  return out;
}

/*

on factor;

load_package "avector";

px := 0;
py := 0;
pz := 0;

v1 := avec(v1x, v1y, v1z);
v2 := avec(v2x, v2y, v2z);
p := avec(px, py, pz);

t1 := p - v1;
t2 := v2 - v1;

l1 := t2 / VMOD t2;

t := dot(t1, t2);

p2 := v1 + t2*t;

on fort;
dot(p2, p2);
off fort;

**/

function _linedis2(co, v1, v2) {
  let v1x = v1[0] - co[0];
  let v1y = v1[1] - co[1];
  let v1z = v1[2] - co[2];

  let v2x = v2[0] - co[0];
  let v2y = v2[1] - co[1];
  let v2z = v2[2] - co[2];

  let dis = (((v1y - v2y)*v1y + (v1z - v2z)*v1z + (v1x - v2x)*v1x)*(v1y - v2y) - v1y)**2 +
    (((v1y - v2y)*v1y + (v1z - v2z)*v1z + (v1x - v2x)*v1x)*(v1z - v2z) - v1z)**2 +
    (((v1y - v2y)*v1y + (v1z - v2z)*v1z + (v1x - v2x)*v1x)*(v1x - v2x) - v1x)**2;

  return dis;
}

let closest_p_tri_rets = new util.cachering(() => {
  return {
    co  : new Vector3(),
    uv  : new Vector2(),
    dist: 0
  }
}, 512);

let cpt_v1 = new Vector3();
let cpt_v2 = new Vector3();
let cpt_v3 = new Vector3();
let cpt_v4 = new Vector3();
let cpt_v5 = new Vector3();
let cpt_v6 = new Vector3();
let cpt_p = new Vector3();
let cpt_n = new Vector3();
let cpt_mat = new Matrix4();
let cpt_mat2 = new Matrix4();
let cpt_b = new Vector3();

export function closest_point_on_quad(p, v1, v2, v3, v4, n, uvw) {
  let a = closest_point_on_tri(p, v1, v2, v3, n, uvw);
  let b = closest_point_on_tri(p, v1, v3, v4, n, uvw);

  return a.dist <= b.dist ? a : b;
}

export function closest_point_on_tri(p, v1, v2, v3, n, uvw) {
  let op = p;

  if (uvw) {
    uvw[0] = uvw[1] = 0.0;
    if (uvw.length > 2) {
      uvw[2] = 0.0;
    }
  }

  v1 = cpt_v1.load(v1);
  v2 = cpt_v2.load(v2);
  v3 = cpt_v3.load(v3);
  p = cpt_p.load(p);

  if (n === undefined) {
    n = cpt_n.load(normal_tri(v1, v2, v3));
  }

  v1.sub(p);
  v2.sub(p);
  v3.sub(p);
  p.zero();


  /*use least squares to solve for barycentric coordinates
    then clip to triangle

    we do this in 2d, as all solutions are coplanar anyway and that way we
    can have one of the equations be "u+v+w = 1".
    should investigate if this is really necassary.
   */

  let ax1, ax2;
  let ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ax === 0.0 && ay === 0.0 && az === 0.0) {
    console.log("eek1", n, v1, v2, v3);
    let ret = closest_p_tri_rets.next();

    ret.dist = 1e17;
    ret.co.zero();
    ret.uv.zero();

    return ret;
  }

  let ax3;
  if (ax >= ay && ax >= az) {
    ax1 = 1;
    ax2 = 2;
    ax3 = 0;
  } else if (ay >= ax && ay >= az) {
    ax1 = 0;
    ax2 = 2;
    ax3 = 1;
  } else {
    ax1 = 0;
    ax2 = 1;
    ax3 = 2;
  }

  let mat = cpt_mat;
  let mat2 = cpt_mat2;
  mat.makeIdentity();

  let m = mat.$matrix;

  m.m11 = v1[ax1];
  m.m12 = v2[ax1];
  m.m13 = v3[ax1];
  m.m14 = 0.0;

  m.m21 = v1[ax2];
  m.m22 = v2[ax2];
  m.m23 = v3[ax2];
  m.m24 = 0.0;

  /*
  m.m31 = v1[ax3];
  m.m32 = v2[ax3];
  m.m33 = v3[ax3];
  m.m34 = 0.0;
  */

  m.m31 = 1;
  m.m32 = 1;
  m.m33 = 1;
  m.m34 = 0.0;

  mat.transpose();

  let b = cpt_b.zero();

  b[0] = p[ax1];
  b[1] = p[ax2];
  //b[2] = p[ax3];
  b[2] = 1.0;
  b[3] = 0.0;

  mat2.load(mat).transpose();

  mat.preMultiply(mat2);

  if (mat.invert() === null) {
    console.log("eek2", mat.determinant(), ax1, ax2, n);
    let ret = closest_p_tri_rets.next();

    ret.dist = 1e17;
    ret.co.zero();
    ret.uv.zero();

    return ret;
  }

  mat.multiply(mat2);


  b.multVecMatrix(mat);

  let u = b[0];
  let v = b[1];
  let w = b[2];

  for (let i = 0; i < 1; i++) {
    u = Math.min(Math.max(u, 0.0), 1.0);
    v = Math.min(Math.max(v, 0.0), 1.0);
    w = Math.min(Math.max(w, 0.0), 1.0);

    let tot = u + v + w;

    if (tot !== 0.0) {
      tot = 1.0/tot;
      u *= tot;
      v *= tot;
      w *= tot;
    }
  }

  if (uvw) {
    uvw[0] = u;
    uvw[1] = v;
    if (uvw.length > 2) {
      uvw[2] = w;
    }
  }

  let x = v1[0]*u + v2[0]*v + v3[0]*w;
  let y = v1[1]*u + v2[1]*v + v3[1]*w;
  let z = v1[2]*u + v2[2]*v + v3[2]*w;

  let ret = closest_p_tri_rets.next();

  ret.co.loadXYZ(x, y, z);
  ret.uv[0] = u;
  ret.uv[1] = v;

  ret.dist = ret.co.vectorLength();
  ret.co.add(op);

  return ret;
}

export function dist_to_tri_v3_old(co, v1, v2, v3, no = undefined) {
  if (!no) {
    no = dtvtmps.next().load(normal_tri(v1, v2, v3));
  }

  let p = dtvtmps.next().load(co);
  p.sub(v1);

  let planedis = -p.dot(no);

  let [axis, axis2] = calc_projection_axes(no);

  let p1 = dtvtmps.next();
  let p2 = dtvtmps.next();
  let p3 = dtvtmps.next();

  p1[0] = v1[axis];
  p1[1] = v1[axis2];
  p1[2] = 0.0;

  p2[0] = v2[axis];
  p2[1] = v2[axis2];
  p2[2] = 0.0;

  p3[0] = v3[axis];
  p3[1] = v3[axis2];
  p3[2] = 0.0;

  let pp = dtvtmps.next();
  pp[0] = co[axis];
  pp[1] = co[axis2];
  pp[2] = 0.0;

  if (point_in_tri(pp, p1, p2, p3)) {
    return Math.abs(planedis);
  } else {
    let dis = 1e17;

    if (0) {
      dis = Math.min(dis, _linedis2(co, v1, v2));
      dis = Math.min(dis, _linedis2(co, v2, v3));
      dis = Math.min(dis, _linedis2(co, v3, v1));
      dis = Math.sqrt(dis);
    } else {
      dis = Math.min(dis, dist_to_line_sqr(co, v1, v2, true));
      dis = Math.min(dis, dist_to_line_sqr(co, v2, v3, true));
      dis = Math.min(dis, dist_to_line_sqr(co, v3, v1, true));
      dis = Math.sqrt(dis);
    }

    return dis;
  }


  if (0) {
    p.add(a).addFac(no, planedis);

    if (Math.abs(p.dot(no)) > 0.000001) {
      console.log(p.dot(no), p, no);
      throw new Error("");
    }

    a.add(co);
    b.add(co);
    c.add(co);

    let ax = a[0], bx = b[0], cx = c[0];
    let ay = a[1], by = b[1], cy = c[1];
    let az = a[2], bz = b[2], cz = c[2];

    let div = ((bx*cz - bz*cx)*ay - (by*cz - bz*cy)*ax - (bx*cy - by*cx)*az);
    //let div2 = ((bx*cz-bz*cx)*ay - (by*cz-bz*cy)*ax - (bx*cy-by*cx)*az);
    //let div3 = ((bx*cz-bz*cx)*ay - (by*cz-bz*cy)*ax - (bx*cy-by*cx)*az);

    if (div === 0.0) {
      return 0.0;
    }

    let x1 = co[0], y1 = co[1], z1 = co[2];

    let u = ((cx*z1 - cz*x1)*by - (cy*z1 - cz*y1)*bx - (cx*y1 - cy*x1)*bz)/div;
    let v = (-((cx*z1 - cz*x1)*ay - (cy*z1 - cz*y1)*ax) + (cx*y1 - cy*x1)*az)/div
    let w = ((bx*z1 - bz*x1)*ay - (by*z1 - bz*y1)*ax - (bx*y1 - by*x1)*az)/div;

    if (isNaN(u) || isNaN(v) || isNaN(w)) {
      console.log(u, v, w, co, a, b, c, div);
      throw new Error("NaN!");
    }

    //let p2 = dtvtmps.next();
    u = Math.min(Math.max(u, 0), 1.0);
    v = Math.min(Math.max(v, 0), 1.0);
    w = Math.min(Math.max(w, 0), 1.0);

    let tot = u + v + w;

    if (tot > 0) {
      tot = 1.0/tot;
      u *= tot;
      v *= tot;
      w *= tot;
    }

    p2.addFac(v1, u);
    p2.addFac(v2, v);
    p2.addFac(v3, w);

    return p2.vectorDistance(co);
  }

  /*
 on factor;

 x2 := ax*u + bx*v + cx*w;
 y2 := ay*u + by*v + cy*w;
 z2 := az*u + bz*v + cz*w;

 f1 := x2 - x1;
 f2 := y2 - y1;
 f3 := z2 - z1;

 ff := solve({f1, f2, f3}, {u, v, w});

 on fort;
 part(ff, 1, 1);
 part(ff, 1, 2);
 part(ff, 1, 3);
 off fort;


  */
}


export function dist_to_tri_v3(p, v1, v2, v3, n) {
  return dist_to_tri_v3_old(p, v1, v2, v3, n);
  //return Math.sqrt(Math.abs(dist_to_tri_v3_sqr(p, v1, v2, v3, n)));
}


/* reduce script

on factor;

ax := 0;
ay := 0;

e1x := bx - ax;
e1y := by - ay;
e2x := cx - bx;
e2y := cy - by;
e3x := ax - cx;
e3y := ay - cy;

l1 := (e1x**2 + e1y**2)**0.5;
l2 := (e2x**2 + e2y**2)**0.5;
l3 := (e3x**2 + e3y**2)**0.5;

load_package "avector";

e1 := avec(e1x / l1, e1y / l1, 0.0);
e2 := avec(e2x / l2, e2y / l2, 0.0);
e3 := avec(e3x / l3, e3y / l3, 0.0);

d1 := x1*e1[1] - y1*e1[0];
d2 := x1*e2[1] - y1*e2[0];
d3 := x1*e3[1] - y1*e3[0];

d1 := d1**2;
d2 := d2**2;
d3 := d3**2;

on fort;
d1;
d2;
d3;
off fort;

*/

let _dt3s_n = new Vector3();

export function dist_to_tri_v3_sqr(p, v1, v2, v3, n) {
  if (n === undefined) {
    n = _dt3s_n;
    n.load(normal_tri(v1, v2, v3));
  }

  // find projection axis;
  let axis1, axis2, axis3;
  let nx = n[0] < 0.0 ? -n[0] : n[0];
  let ny = n[1] < 0.0 ? -n[1] : n[1];
  let nz = n[2] < 0.0 ? -n[2] : n[2];

  const feps = 0.0000001;

  if (nx > ny && nx > nz) {
    axis1 = 1;
    axis2 = 2;
    axis3 = 0;
  } else if (ny > nx && ny > nz) {
    axis1 = 0;
    axis2 = 2;
    axis3 = 1;
  } else {
    axis1 = 0;
    axis2 = 1;
    axis3 = 2;
  }

  //n.load(normal_tri(v1, v2, v3));

  let planedis = (p[0] - v1[0])*n[0] + (p[1] - v1[1])*n[1] + (p[2] - v1[2])*n[2];
  planedis = planedis < 0.0 ? -planedis : planedis;

  let ax = v1[axis1], ay = v1[axis2], az = v1[axis3];

  let bx = v2[axis1] - ax, by = v2[axis2] - ay, bz = v2[axis3] - az;
  let cx = v3[axis1] - ax, cy = v3[axis2] - ay, cz = v3[axis3] - az;

  let bx2 = bx*bx, by2 = by*by, bz2 = bz*bz, cx2 = cx*cx, cy2 = cy*cy, cz2 = cz*cz;

  let x1 = p[axis1] - ax;
  let y1 = p[axis2] - ay;
  let z1 = p[axis3] - az;

  const testf = 0.0;

  let l1 = Math.sqrt(bx**2 + by**2);
  let l2 = Math.sqrt((cx - bx)**2 + (cy - by)**2);
  let l3 = Math.sqrt(cx**2 + cy**2);

  let s1 = x1*by - y1*bx < testf;
  let s2 = (x1 - bx)*(cy - by) - (y1 - by)*(cx - bx) < testf;
  let s3 = (x1* -cy + y1*cx) < testf;

  /*
    (x1-cx)*-cy - (y1-cy)*-cx
   reduces to:
     x1*-cy + y1*cx;
   */

  //console.log(axis1, axis2, axis3, n);
  //console.log(s1, s2, s3);
  //console.log(bx, by, cx, cy);

  if (1 && n[axis3] < 0.0) {
    s1 = !s1;
    s2 = !s2;
    s3 = !s3;
    /*
        bx = v3[axis1];
        by = v3[axis2];
        bz = v3[axis3];

        cx = v2[axis1];
        cy = v2[axis2];
        cz = v2[axis3];

        bx2 = bx*bx;
        by2 = by*by;
        bz2 = bz*bz;

        cx2 = cx*cx;
        cy2 = cy*cy;
        cz2 = cz*cz;*/
  }

  let mask = (s1 & 1) | (s2<<1) | (s3<<2);
  if (mask === 0 || mask === 7) {
    return planedis*planedis;
  }

  let d1, d2, d3, div;


  /*
//\  3|
//  \ |
//    b
//    | \
//  1 |   \  2
//    |  0  \
// ___a_______c___
//  5 |   4      \ 6
*/

  let dis = 0.0;
  let lx, ly, lz;

  lx = bx;
  ly = by;
  lz = bz;

  nx = n[axis1];
  ny = n[axis2];
  nz = n[axis3];

  switch (mask) {
    case 1:
      div = (bx2 + by2);

      if (div > feps) {
        d1 = (bx*y1 - by*x1);
        d1 = (d1*d1)/div;

        lx = -by;
        ly = bx;
        lz = bz;
      } else {
        d1 = x1*x1 + y1*y1;

        lx = x1;
        ly = y1;
        lz = z1;
      }

      dis = d1;
      break;
    case 3:
      lx = x1 - bx;
      ly = y1 - by;
      lz = z1 - bz;

      dis = lx*lx + ly*ly;
      return lx*lx + ly*ly + lz*lz;
    case 2:
      div = (bx - cx)**2 + (by - cy)**2;

      if (div > feps) {
        d2 = ((bx - cx)*y1 - (by - cy)*x1);
        d2 = d2/div;

        lx = (by - cy);
        ly = (cx - bx);
        lz = cz - bz;
      } else {
        d2 = (x1 - bx)*(x1 - bx) + (y1 - by)*(y1 - by);

        lx = x1 - bx;
        ly = y1 - by;
        lz = z1 - bz;
      }

      dis = d2;
      break;
    case 6:
      lx = x1 - cx;
      ly = y1 - cy;
      lz = z1 - cz;

      return lx*lx + ly*ly + lz*lz;
    case 4:
      div = (cx2 + cy2);

      if (div > feps) {
        d3 = (cx*y1 - cy*x1);
        d3 = (d3*d3)/div;

        lx = cy;
        ly = -cx;
        lz = cz;
      } else {
        d3 = (x1 - cx)*(x1 - cx) + (y1 - cy)*(y1 - cy);

        lx = x1 - cx;
        ly = y1 - cy;
        lz = z1 - cz;
      }

      dis = d3;
      break;
    case 5:
      lx = x1;
      ly = y1;
      lz = z1;

      return lx*lx + ly*ly + lz*lz;
  }

  //lx = p[axis1] - v1[axis1];
  //ly = p[axis2] - v1[axis2];
  {
    let d = lx*nx + ly*ny + lz*nz;

    d = -d;

    lx += nx*d;
    ly += ny*d;
    lz += nz*d;

    //dis = lx*lx + ly*ly;

    if (0 && Math.random() > 0.999) {
      console.log("d", d.toFixed(6));
      console.log(lx*nx + ly*ny + lz*nz);
    }
  }

  let mul = ((lx**2 + ly**2)*nz**2 + (lx*nx + ly*ny)**2)/((lx**2 + ly**2)*nz**2);
  //let mul = ((lx**2+ly**2)*nz**2+(lx*nx+ly*ny)**2)/((ly**2+lz**2+lx**2)*nz**2);

  //mul = 1.0 / nz;
  //mul *= mul;

  if (Math.random() > 0.999) {
    console.log(mul.toFixed(4));
  }

  //mul = 1.0;

  if (0) {
    let odis = dis;

    dis = x1**2 + y1**2 + z1**2;

    if (Math.random() > 0.999) {
      console.log((dis/odis).toFixed(4), mul.toFixed(4));
    }
    mul = 1.0;
  }

  /*
  on factor;

  dx := sqrt(dis)*(lx / sqrt(lx**2 + ly**2));
  dy := sqrt(dis)*(ly / sqrt(lx**2 + ly**2));
  f2 := dx*nx + dy*ny + dz*nz;

  fz := solve(f2, dz);
  fz := part(fz, 1, 2);

  dis2 := dx*dx + dy*dy + fz*fz;
  fmul := dis2/dis;

  on fort;
  fmul;
  off fort;


  */

  return dis*mul + planedis*planedis;
}

let tri_area_temps = util.cachering.fromConstructor(Vector3, 64);

export function tri_area(v1, v2, v3) {
  let l1 = v1.vectorDistance(v2);
  let l2 = v2.vectorDistance(v3);
  let l3 = v3.vectorDistance(v1);

  let s = (l1 + l2 + l3)/2.0;
  return Math.sqrt(s*(s - l1)*(s - l2)*(s - l3))
}

export function aabb_overlap_area(pos1, size1, pos2, size2) {
  let r1 = 0.0, r2 = 0.0;

  for (let i = 0; i < 2; i++) {
    let a1 = pos1[i], a2 = pos2[i];
    let b1 = pos1[i] + size1[i];
    let b2 = pos2[i] + size2[i];

    if (b1 >= a2 && b2 >= a1) {
      let r = Math.abs(a2 - b1);
      r = Math.min(r, Math.abs(a1 - b2));

      if (i) {
        r2 = r;
      } else {
        r1 = r;
      }
    }
  }

  return r1*r2;
}

/**
 * Returns true if two aabbs intersect
 * @param {*} pos1
 * @param {*} size1
 * @param {*} pos2
 * @param {*} size2
 */

export function aabb_isect_2d(pos1, size1, pos2, size2) {
  let ret = 0;
  for (let i = 0; i < 2; i++) {
    let a = pos1[i];
    let b = pos1[i] + size1[i];
    let c = pos2[i];
    let d = pos2[i] + size2[i];
    if (b >= c && a <= d)
      ret += 1;
  }
  return ret === 2;
};


export function aabb_isect_3d(pos1, size1, pos2, size2) {
  let ret = 0;

  for (let i = 0; i < 3; i++) {
    let a = pos1[i];
    let b = pos1[i] + size1[i];

    let c = pos2[i];
    let d = pos2[i] + size2[i];

    if (b >= c && a <= d)
      ret += 1;
  }
  return ret === 3;
}


let aabb_intersect_vs = util.cachering.fromConstructor(Vector2, 32);
let aabb_intersect_rets = new util.cachering(() => {
  return {
    pos : new Vector2(),
    size: new Vector2()
  }
}, 512);

/**
 * Returns aabb that's the intersection of two aabbs
 * @param {*} pos1
 * @param {*} size1
 * @param {*} pos2
 * @param {*} size2
 */
export function aabb_intersect_2d(pos1, size1, pos2, size2) {
  let v1 = aabb_intersect_vs.next().load(pos1);
  let v2 = aabb_intersect_vs.next().load(pos1).add(size1);
  let v3 = aabb_intersect_vs.next().load(pos2);
  let v4 = aabb_intersect_vs.next().load(pos2).add(size2);

  let min = aabb_intersect_vs.next().zero();
  let max = aabb_intersect_vs.next().zero();

  let tot = 0;

  for (let i = 0; i < 2; i++) {
    if (v2[i] >= v3[i] && v1[i] <= v4[i]) {
      tot++;

      min[i] = Math.max(v3[i], v1[i]);
      max[i] = Math.min(v2[i], v4[i]);
    }
  }

  if (tot !== 2) {
    return undefined;
  }

  let ret = aabb_intersect_rets.next();
  ret.pos.load(min);
  ret.size.load(max).sub(min);

  return ret;
}

window.test_aabb_intersect_2d = function () {
  let canvas = document.getElementById("test_canvas");

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("id", "test_canvas");
    canvas.g = canvas.getContext("2d");

    document.body.appendChild(canvas);
  }

  canvas.width = ~~(window.innerWidth*devicePixelRatio);
  canvas.height = ~~(window.innerHeight*devicePixelRatio);
  canvas.style.width = (canvas.width/devicePixelRatio) + "px";
  canvas.style.height = (canvas.height/devicePixelRatio) + "px";
  canvas.style.position = "absolute";
  canvas.style["z-index"] = "1000";

  let g = canvas.g;
  g.clearRect(0, 0, canvas.width, canvas.height);

  let sz = 800;
  let a1 = new Vector2([Math.random()*sz, Math.random()*sz]).floor();
  let a2 = new Vector2([Math.random()*sz, Math.random()*sz]).floor();
  let b1 = new Vector2([Math.random()*sz, Math.random()*sz]).floor();
  let b2 = new Vector2([Math.random()*sz, Math.random()*sz]).floor();

  let p1 = new Vector2();
  let s1 = new Vector2();
  let p2 = new Vector2();
  let s2 = new Vector2();

  p1.load(a1).min(a2);
  s1.load(a1).max(a2);
  p2.load(b1).min(b2);
  s2.load(b1).max(b2);

  s1.sub(p1);
  s2.sub(p1);

  console.log(p1, s1);
  console.log(p2, s2);

  g.beginPath();
  g.rect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "white";
  g.fill();

  g.beginPath();
  g.rect(p1[0], p1[1], s1[0], s1[1]);
  g.fillStyle = "rgba(255, 100, 75, 1.0)";
  g.fill();

  g.beginPath();
  g.rect(p2[0], p2[1], s2[0], s2[1]);
  g.fillStyle = "rgba(75, 100, 255, 1.0)";
  g.fill();

  let ret = aabb_intersect_2d(p1, s1, p2, s2);

  if (ret) {

    g.beginPath();
    g.rect(ret.pos[0], ret.pos[1], ret.size[0], ret.size[1]);
    g.fillStyle = "rgba(0, 0, 0, 1.0)";
    g.fill();
  }

  /*
  window.setTimeout(() => {
    canvas.remove();
  }, 2000);
  //*/

  return {
    end  : test_aabb_intersect_2d.end,
    timer: test_aabb_intersect_2d.timer
  };
}

test_aabb_intersect_2d.stop = function stop() {
  if (test_aabb_intersect_2d._timer) {
    console.log("stopping timer");

    window.clearInterval(test_aabb_intersect_2d._timer);
    test_aabb_intersect_2d._timer = undefined;
  }
}

test_aabb_intersect_2d.end = function end() {
  test_aabb_intersect_2d.stop();

  let canvas = document.getElementById("test_canvas");
  if (canvas) {
    canvas.remove();
  }
}
test_aabb_intersect_2d.timer = function timer(rate = 500) {
  if (test_aabb_intersect_2d._timer) {
    window.clearInterval(test_aabb_intersect_2d._timer);
    test_aabb_intersect_2d._timer = undefined;
    console.log("stopping timer");
    return;
  }

  console.log("starting timer");

  test_aabb_intersect_2d._timer = window.setInterval(() => {
    test_aabb_intersect_2d();
  }, rate);
};

let aabb_intersect_vs3 = util.cachering.fromConstructor(Vector3, 64);

export function aabb_intersect_3d(min1, max1, min2, max2) {
  let tot = 0;

  for (let i = 0; i < 2; i++) {
    if (max1[i] >= min2[i] && min1[i] <= max2[i]) {
      tot++;
    }
  }

  if (tot !== 3) {
    return false;
  }

  return true;
}

/**
 * AABB union of a and b.
 * Result is in a.
 *
 * @param a List of two vectors
 * @param b List of two vectors
 * @returns a
 */
export function aabb_union(a, b) {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < a[i].length; j++) {
      a[i][j] = i ? Math.max(a[i][j], b[i][j]) : Math.min(a[i][j], b[i][j]);
    }
  }

  return a;
}

export function aabb_union_2d(pos1, size1, pos2, size2) {
  let v1 = aabb_intersect_vs.next();
  let v2 = aabb_intersect_vs.next();
  let min = aabb_intersect_vs.next();
  let max = aabb_intersect_vs.next();
  v1.load(pos1).add(size1);
  v2.load(pos2).add(size2);

  min.load(v1).min(v2);
  max.load(v1).max(v2);

  max.sub(min);
  let ret = aabb_intersect_rets.next();

  ret.pos.load(min);
  ret.pos.load(max);

  return ret;
}

//XXX refactor to use es6 classes,
//    or at last the class system in typesystem.js
function init_prototype(cls, proto) {
  for (var k in proto) {
    cls.prototype[k] = proto[k];
  }

  return cls.prototype;
}

function inherit(cls, parent, proto) {
  cls.prototype = Object.create(parent.prototype);

  for (var k in proto) {
    cls.prototype[k] = proto[k];
  }

  return cls.prototype;
}

var set = util.set;

//everything below here was compiled from es6 code  
//variables starting with $ are function static local vars,
//like in C.  don't use them outside their owning functions.
//
//except for $_mh and $_swapt.  they were used with a C macro
//preprocessor.
var $_mh, $_swapt;

//XXX destroy me
export const feps = 2.22e-16;

export const COLINEAR = 1;
export const LINECROSS = 2;
export const COLINEAR_ISECT = 3;

var _cross_vec1 = new Vector3();
var _cross_vec2 = new Vector3();

export const SQRT2 = Math.sqrt(2.0);
export const FEPS_DATA = {
  F16: 1.11e-16,
  F32: 5.96e-08,
  F64: 4.88e-04
};

/*use 32 bit epsilon by default, since we're often working from
  32-bit float data.  note that javascript uses 64-bit doubles 
  internally.*/
export const FEPS = FEPS_DATA.F32;
export const FLOAT_MIN = -1e+21;
export const FLOAT_MAX = 1e+22;
export const Matrix4UI = Matrix4;

/*
var Matrix4UI=exports.Matrix4UI = function(loc, rot, size) {
  if (rot==undefined) {
      rot = undefined;
  }
  
  if (size==undefined) {
      size = undefined;
  }
  
  Object.defineProperty(this, "loc", {get: function() {
    var t=new Vector3();
    this.decompose(t);
    return t;
  }, set: function(loc) {
    var l=new Vector3(), r=new Vector3(), s=new Vector3();
    this.decompose(l, r, s);
    this.calc(loc, r, s);
  }});
  
  Object.defineProperty(this, "size", {get: function() {
    var t=new Vector3();
    this.decompose(undefined, undefined, t);
    return t;
  }, set: function(size) {
    var l=new Vector3(), r=new Vector3(), s=new Vector3();
    this.decompose(l, r, s);
    this.calc(l, r, size);
  }});
  
  Object.defineProperty(this, "rot", {get: function() {
    var t=new Vector3();
    this.decompose(undefined, t);
    return t;
  }, set: function(rot) {
    var l=new Vector3(), r=new Vector3(), s=new Vector3();
    this.decompose(l, r, s);
    this.calc(l, rot, s);
  }});
  
  if (loc instanceof Matrix4) {
      this.load(loc);
      return ;
  }
  
  if (rot==undefined)
    rot = [0, 0, 0];
  if (size==undefined)
    size = [1.0, 1.0, 1.0];
  this.makeIdentity();
  this.calc(loc, rot, size);
};

Matrix4UI.prototype = inherit(Matrix4UI, Matrix4, {
  calc : function(loc, rot, size) {
    this.rotate(rot[0], rot[1], rot[2]);
    this.scale(size[0], size[1], size[2]);
    this.translate(loc[0], loc[1], loc[2]);
  }

});
*/

if (FLOAT_MIN != FLOAT_MIN || FLOAT_MAX != FLOAT_MAX) {
  FLOAT_MIN = 1e-05;
  FLOAT_MAX = 1000000.0;
  console.log("Floating-point 16-bit system detected!");
}

var _static_grp_points4 = new Array(4);
var _static_grp_points8 = new Array(8);

export function get_rect_points(p, size) {
  var cs;
  if (p.length == 2) {
    cs = _static_grp_points4;
    cs[0] = p;
    cs[1] = [p[0] + size[0], p[1]];
    cs[2] = [p[0] + size[0], p[1] + size[1]];
    cs[3] = [p[0], p[1] + size[1]];
  } else if (p.length == 3) {
    cs = _static_grp_points8;
    cs[0] = p;
    cs[1] = [p[0] + size[0], p[1], p[2]];
    cs[2] = [p[0] + size[0], p[1] + size[1], p[2]];
    cs[3] = [p[0], p[1] + size[0], p[2]];
    cs[4] = [p[0], p[1], p[2] + size[2]];
    cs[5] = [p[0] + size[0], p[1], p[2] + size[2]];
    cs[6] = [p[0] + size[0], p[1] + size[1], p[2] + size[2]];
    cs[7] = [p[0], p[1] + size[0], p[2] + size[2]];
  } else {
    throw "get_rect_points has no implementation for " + p.length + "-dimensional data";
  }
  return cs;
};

export function get_rect_lines(p, size) {
  var ps = get_rect_points(p, size);
  if (p.length == 2) {
    return [[ps[0], ps[1]], [ps[1], ps[2]], [ps[2], ps[3]], [ps[3], ps[0]]];
  } else if (p.length == 3) {
    var l1 = [[ps[0], ps[1]], [ps[1], ps[2]], [ps[2], ps[3]], [ps[3], ps[0]]];
    var l2 = [[ps[4], ps[5]], [ps[5], ps[6]], [ps[6], ps[7]], [ps[7], ps[4]]];
    l1.concat(l2);
    l1.push([ps[0], ps[4]]);
    l1.push([ps[1], ps[5]]);
    l1.push([ps[2], ps[6]]);
    l1.push([ps[3], ps[7]]);
    return l1;
  } else {
    throw "get_rect_points has no implementation for " + p.length + "-dimensional data";
  }
};

var $vs_simple_tri_aabb_isect = [0, 0, 0];

export function simple_tri_aabb_isect(v1, v2, v3, min, max) {
  $vs_simple_tri_aabb_isect[0] = v1;
  $vs_simple_tri_aabb_isect[1] = v2;
  $vs_simple_tri_aabb_isect[2] = v3;
  for (var i = 0; i < 3; i++) {
    var isect = true;
    for (var j = 0; j < 3; j++) {
      if ($vs_simple_tri_aabb_isect[j][i] < min[i] || $vs_simple_tri_aabb_isect[j][i] >= max[i])
        isect = false;
    }
    if (isect)
      return true;
  }
  return false;
};

export class MinMax {
  constructor(totaxis) {
    if (totaxis == undefined) {
      totaxis = 1;
    }
    this.totaxis = totaxis;
    if (totaxis != 1) {
      let cls;

      switch (totaxis) {
        case 2:
          cls = Vector2;
          break;
        case 3:
          cls = Vector3;
          break;
        case 4:
          cls = Vector4;
          break;
        default:
          cls = Array;
          break;
      }

      this._min = new cls(totaxis);
      this._max = new cls(totaxis);
      this.min = new cls(totaxis);
      this.max = new cls(totaxis);
    } else {
      this.min = this.max = 0;
      this._min = FLOAT_MAX;
      this._max = FLOAT_MIN;
    }
    this.reset();
    this._static_mr_co = new Array(this.totaxis);
    this._static_mr_cs = new Array(this.totaxis*this.totaxis);
  }

  static fromSTRUCT(reader) {
    var ret = new MinMax();
    reader(ret);
    return ret;
  }

  load(mm) {
    if (this.totaxis == 1) {
      this.min = mm.min;
      this.max = mm.max;
      this._min = mm.min;
      this._max = mm.max;
    } else {
      this.min = new Vector3(mm.min);
      this.max = new Vector3(mm.max);
      this._min = new Vector3(mm._min);
      this._max = new Vector3(mm._max);
    }
  }

  reset() {
    var totaxis = this.totaxis;
    if (totaxis == 1) {
      this.min = this.max = 0;
      this._min = FLOAT_MAX;
      this._max = FLOAT_MIN;
    } else {
      for (var i = 0; i < totaxis; i++) {
        this._min[i] = FLOAT_MAX;
        this._max[i] = FLOAT_MIN;
        this.min[i] = 0;
        this.max[i] = 0;
      }
    }
  }

  minmax_rect(p, size) {
    var totaxis = this.totaxis;
    var cs = this._static_mr_cs;
    if (totaxis == 2) {
      cs[0] = p;
      cs[1] = [p[0] + size[0], p[1]];
      cs[2] = [p[0] + size[0], p[1] + size[1]];
      cs[3] = [p[0], p[1] + size[1]];
    } else if (totaxis = 3) {
      cs[0] = p;
      cs[1] = [p[0] + size[0], p[1], p[2]];
      cs[2] = [p[0] + size[0], p[1] + size[1], p[2]];
      cs[3] = [p[0], p[1] + size[0], p[2]];
      cs[4] = [p[0], p[1], p[2] + size[2]];
      cs[5] = [p[0] + size[0], p[1], p[2] + size[2]];
      cs[6] = [p[0] + size[0], p[1] + size[1], p[2] + size[2]];
      cs[7] = [p[0], p[1] + size[0], p[2] + size[2]];
    } else {
      throw "Minmax.minmax_rect has no implementation for " + totaxis + "-dimensional data";
    }
    for (var i = 0; i < cs.length; i++) {
      this.minmax(cs[i]);
    }
  }

  minmax(p) {
    var totaxis = this.totaxis;

    if (totaxis == 1) {
      this._min = this.min = Math.min(this._min, p);
      this._max = this.max = Math.max(this._max, p);
    } else if (totaxis == 2) {
      this._min[0] = this.min[0] = Math.min(this._min[0], p[0]);
      this._min[1] = this.min[1] = Math.min(this._min[1], p[1]);
      this._max[0] = this.max[0] = Math.max(this._max[0], p[0]);
      this._max[1] = this.max[1] = Math.max(this._max[1], p[1]);
    } else if (totaxis == 3) {
      this._min[0] = this.min[0] = Math.min(this._min[0], p[0]);
      this._min[1] = this.min[1] = Math.min(this._min[1], p[1]);
      this._min[2] = this.min[2] = Math.min(this._min[2], p[2]);
      this._max[0] = this.max[0] = Math.max(this._max[0], p[0]);
      this._max[1] = this.max[1] = Math.max(this._max[1], p[1]);
      this._max[2] = this.max[2] = Math.max(this._max[2], p[2]);
    } else {
      for (var i = 0; i < totaxis; i++) {
        this._min[i] = this.min[i] = Math.min(this._min[i], p[i]);
        this._max[i] = this.max[i] = Math.max(this._max[i], p[i]);
      }
    }
  }
};
MinMax.STRUCT = "\n  math.MinMax {\n    min     : vec3;\n    max     : vec3;\n    _min    : vec3;\n    _max    : vec3;\n    totaxis : int;\n  }\n";

export function winding_axis(a, b, c, up_axis) {
  let xaxis = (up_axis + 1)%3;
  let yaxis = (up_axis + 2)%3;

  let x1 = a[xaxis], y1 = a[yaxis];
  let x2 = b[xaxis], y2 = b[yaxis];
  let x3 = c[xaxis], y3 = c[yaxis];

  let dx1 = x1 - x2, dy1 = y1 - y2;
  let dx2 = x3 - x2, dy2 = y3 - y2;

  let f = dx1*dy2 - dy1*dx2;
  return f >= 0.0;
}

export function winding(a, b, c, zero_z, tol = 0.0) {
  let t1 = _cross_vec1;
  let t2 = _cross_vec2;

  for (let i = 0; i < a.length; i++) {
    t1[i] = b[i] - a[i];
    t2[i] = c[i] - a[i];
  }

  return t1[0]*t2[1] - t1[1]*t2[0] > tol;
  /*
  t1.load(a).sub(b);
  t2.load(c).sub(b);
  return t[0]*
  
  for (var i=0; i<a.length; i++) {
      _cross_vec1[i] = b[i]-a[i];
      _cross_vec2[i] = c[i]-a[i];
  }
  if (a.length==2 || zero_z) {
      _cross_vec1[2] = 0.0;
      _cross_vec2[2] = 0.0;
  }
  _cross_vec1.cross(_cross_vec2);
  return _cross_vec1[2]>tol;
*/
}

export function inrect_2d(p, pos, size) {
  if (p == undefined || pos == undefined || size == undefined) {
    console.trace();
    console.log("Bad paramters to inrect_2d()");
    console.log("p: ", p, ", pos: ", pos, ", size: ", size);
    return false;
  }
  return p[0] >= pos[0] && p[0] <= pos[0] + size[0] && p[1] >= pos[1] && p[1] <= pos[1] + size[1];
};
var $smin_aabb_isect_line_2d = new Vector2();
var $ssize_aabb_isect_line_2d = new Vector2();
var $sv1_aabb_isect_line_2d = new Vector2();
var $ps_aabb_isect_line_2d = [new Vector2(), new Vector2(), new Vector2()];
var $l1_aabb_isect_line_2d = [0, 0];
var $smax_aabb_isect_line_2d = new Vector2();
var $sv2_aabb_isect_line_2d = new Vector2();
var $l2_aabb_isect_line_2d = [0, 0];

export function aabb_isect_line_2d(v1, v2, min, max) {
  for (var i = 0; i < 2; i++) {
    $smin_aabb_isect_line_2d[i] = Math.min(min[i], v1[i]);
    $smax_aabb_isect_line_2d[i] = Math.max(max[i], v2[i]);
  }
  $smax_aabb_isect_line_2d.sub($smin_aabb_isect_line_2d);
  $ssize_aabb_isect_line_2d.load(max).sub(min);
  if (!aabb_isect_2d($smin_aabb_isect_line_2d, $smax_aabb_isect_line_2d, min, $ssize_aabb_isect_line_2d))
    return false;
  for (var i = 0; i < 4; i++) {
    if (inrect_2d(v1, min, $ssize_aabb_isect_line_2d))
      return true;
    if (inrect_2d(v2, min, $ssize_aabb_isect_line_2d))
      return true;
  }
  $ps_aabb_isect_line_2d[0] = min;
  $ps_aabb_isect_line_2d[1][0] = min[0];
  $ps_aabb_isect_line_2d[1][1] = max[1];
  $ps_aabb_isect_line_2d[2] = max;
  $ps_aabb_isect_line_2d[3][0] = max[0];
  $ps_aabb_isect_line_2d[3][1] = min[1];
  $l1_aabb_isect_line_2d[0] = v1;
  $l1_aabb_isect_line_2d[1] = v2;
  for (var i = 0; i < 4; i++) {
    var a = $ps_aabb_isect_line_2d[i], b = $ps_aabb_isect_line_2d[(i + 1)%4];
    $l2_aabb_isect_line_2d[0] = a;
    $l2_aabb_isect_line_2d[1] = b;
    if (line_line_cross($l1_aabb_isect_line_2d, $l2_aabb_isect_line_2d))
      return true;
  }
  return false;
};


export function expand_rect2d(pos, size, margin) {
  pos[0] -= Math.floor(margin[0]);
  pos[1] -= Math.floor(margin[1]);
  size[0] += Math.floor(margin[0]*2.0);
  size[1] += Math.floor(margin[1]*2.0);
};

export function expand_line(l, margin) {
  var c = new Vector3();
  c.add(l[0]);
  c.add(l[1]);
  c.mulScalar(0.5);
  l[0].sub(c);
  l[1].sub(c);
  var l1 = l[0].vectorLength();
  var l2 = l[1].vectorLength();
  l[0].normalize();
  l[1].normalize();
  l[0].mulScalar(margin + l1);
  l[1].mulScalar(margin + l2);
  l[0].add(c);
  l[1].add(c);
  return l;
};

//stupidly ancient function, todo: rewrite
export function colinear(a, b, c, limit = 2.2e-16) {
  for (var i = 0; i < 3; i++) {
    _cross_vec1[i] = b[i] - a[i];
    _cross_vec2[i] = c[i] - a[i];
  }

  if (a.vectorDistance(b) < feps*100 && a.vectorDistance(c) < feps*100) {
    return true;
  }
  if (_cross_vec1.dot(_cross_vec1) < limit || _cross_vec2.dot(_cross_vec2) < limit)
    return true;
  _cross_vec1.cross(_cross_vec2);
  return _cross_vec1.dot(_cross_vec1) < limit;
};

var _llc_l1 = [new Vector3(), new Vector3()];
var _llc_l2 = [new Vector3(), new Vector3()];
var _llc_l3 = [new Vector3(), new Vector3()];
var _llc_l4 = [new Vector3(), new Vector3()];

var lli_v1 = new Vector3(), lli_v2 = new Vector3(), lli_v3 = new Vector3(), lli_v4 = new Vector3();

var _zero_cn = new Vector3();
var _tmps_cn = util.cachering.fromConstructor(Vector3, 64);
var _rets_cn = util.cachering.fromConstructor(Vector3, 64);

//vec1, vec2 should both be normalized
export function corner_normal(vec1, vec2, width) {
  var ret = _rets_cn.next().zero();

  var vec = _tmps_cn.next().zero();
  vec.load(vec1).add(vec2).normalize();

  /*
  ret.load(vec).mulScalar(width);
  return ret;
  */

  //handle colinear case
  if (Math.abs(vec1.normalizedDot(vec2)) > 0.9999) {
    if (vec1.dot(vec2) > 0.0001) {
      ret.load(vec1).add(vec2).normalize();
    } else {
      ret.load(vec1).normalize();
    }

    ret.mulScalar(width);

    return ret;
  } else { //XXX
    //ret.load(vec).mulScalar(width);
    //return ret;
  }

  vec1 = _tmps_cn.next().load(vec1).mulScalar(width);
  vec2 = _tmps_cn.next().load(vec2).mulScalar(width);

  var p1 = _tmps_cn.next().load(vec1);
  var p2 = _tmps_cn.next().load(vec2);

  vec1.addFac(vec1, 0.01);
  vec2.addFac(vec2, 0.01);

  var sc = 1.0;

  p1[0] += vec1[1]*sc;
  p1[1] += -vec1[0]*sc;

  p2[0] += -vec2[1]*sc;
  p2[1] += vec2[0]*sc;

  var p = line_line_isect(vec1, p1, vec2, p2, false);

  if (p == undefined || p === COLINEAR_ISECT || p.dot(p) < 0.000001) {
    ret.load(vec1).add(vec2).normalize().mulScalar(width);
  } else {
    ret.load(p);

    if (vec.dot(vec) > 0 && vec.dot(ret) < 0) {
      ret.load(vec).mulScalar(width);
    }
  }

  return ret;
}

//test_segment is optional, true
export function line_line_isect(v1, v2, v3, v4, test_segment) {
  test_segment = test_segment === undefined ? true : test_segment;

  if (!line_line_cross(v1, v2, v3, v4)) {
    return undefined;
  }

  /*
  on factor;
  off period;
  
  xa := xa1 + (xa2 - xa1)*t1;
  xb := xb1 + (xb2 - xb1)*t2;
  ya := ya1 + (ya2 - ya1)*t1;
  yb := yb1 + (yb2 - yb1)*t2;
  
  f1 := xa - xb;
  f2 := ya - yb;
  
  f := solve({f1, f2}, {t1, t2});
  ft1 := part(f, 1, 1, 2);
  ft2 := part(f, 1, 2, 2);
  
  */

  var xa1 = v1[0], xa2 = v2[0], ya1 = v1[1], ya2 = v2[1];
  var xb1 = v3[0], xb2 = v4[0], yb1 = v3[1], yb2 = v4[1];

  var div = ((xa1 - xa2)*(yb1 - yb2) - (xb1 - xb2)*(ya1 - ya2));
  if (div < 0.00000001) { //parallel but intersecting lines.
    return COLINEAR_ISECT;
  } else { //intersection exists
    var t1 = (-((ya1 - yb2)*xb1 - (yb1 - yb2)*xa1 - (ya1 - yb1)*xb2))/div;

    return lli_v1.load(v1).interp(v2, t1);
  }
}

export function line_line_cross(v1, v2, v3, v4) {
  var l1 = _llc_l3, l2 = _llc_l4;
  //l1[0].load(v1), l1[1].load(v2), l2[0].load(v3), l2[1].load(v4);

  {
    let a = l1[0], b = l1[1], c = l2[0], d = l2[1];

    a[0] = v1[0];
    a[1] = v1[1];
    a[2] = v1[2];

    b[0] = v2[0];
    b[1] = v2[1];
    b[2] = v2[2];

    c[0] = v3[0];
    c[1] = v3[1];
    c[2] = v3[2];

    d[0] = v4[0];
    d[1] = v4[1];
    d[2] = v4[2];
  }

  /*
  var limit=feps*1000;
  if (Math.abs(l1[0].vectorDistance(l2[0])+l1[1].vectorDistance(l2[0])-l1[0].vectorDistance(l1[1]))<limit) {
      return true;
  }
  if (Math.abs(l1[0].vectorDistance(l2[1])+l1[1].vectorDistance(l2[1])-l1[0].vectorDistance(l1[1]))<limit) {
      return true;
  }
  if (Math.abs(l2[0].vectorDistance(l1[0])+l2[1].vectorDistance(l1[0])-l2[0].vectorDistance(l2[1]))<limit) {
      return true;
  }
  if (Math.abs(l2[0].vectorDistance(l1[1])+l2[1].vectorDistance(l1[1])-l2[0].vectorDistance(l2[1]))<limit) {
      return true;
  }
  //*/

  var a = l1[0];
  var b = l1[1];
  var c = l2[0];
  var d = l2[1];
  var w1 = winding(a, b, c);
  var w2 = winding(c, a, d);
  var w3 = winding(a, b, d);
  var w4 = winding(c, b, d);
  return (w1 == w2) && (w3 == w4) && (w1 != w3);
};

var _asi_v1 = new Vector3();
var _asi_v2 = new Vector3();
var _asi_v3 = new Vector3();
var _asi_v4 = new Vector3();
var _asi_v5 = new Vector3();
var _asi_v6 = new Vector3();

export function point_in_aabb_2d(p, min, max) {
  return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1];
}

var _asi2d_v1 = new Vector2();
var _asi2d_v2 = new Vector2();
var _asi2d_v3 = new Vector2();
var _asi2d_v4 = new Vector2();
var _asi2d_v5 = new Vector2();
var _asi2d_v6 = new Vector2();

export function aabb_sphere_isect_2d(p, r, min, max) {
  var v1 = _asi2d_v1, v2 = _asi2d_v2, v3 = _asi2d_v3, mvec = _asi2d_v4;
  var v4 = _asi2d_v5;

  p = _asi2d_v6.load(p);
  v1.load(p);
  v2.load(p);

  min = _asi_v5.load(min);
  max = _asi_v6.load(max);

  mvec.load(max).sub(min).normalize().mulScalar(r + 0.0001);

  v1.sub(mvec);
  v2.add(mvec);
  v3.load(p);

  var ret = point_in_aabb_2d(v1, min, max) || point_in_aabb_2d(v2, min, max)
    || point_in_aabb_2d(v3, min, max);

  if (ret)
    return ret;

  /*
  v1.load(min).add(max).mulScalar(0.5);
  ret = ret || v1.vectorDistance(p) < r;
  
  v1.load(min);
  ret = ret || v1.vectorDistance(p) < r;
  
  v1.load(max);
  ret = ret || v1.vectorDistance(p) < r;
  
  v1[0] = min[0], v1[1] = max[1];
  ret = ret || v1.vectorDistance(p) < r;
  
  v1[0] = max[0], v1[1] = min[1];
  ret = ret || v1.vectorDistance(p) < r;
  */
  //*
  v1.load(min);
  v2[0] = min[0];
  v2[1] = max[1];
  ret = ret || dist_to_line_2d(p, v1, v2) < r;

  v1.load(max);
  v2[0] = max[0];
  v2[1] = max[1];
  ret = ret || dist_to_line_2d(p, v1, v2) < r;

  v1.load(max);
  v2[0] = max[0];
  v2[1] = min[1];
  ret = ret || dist_to_line_2d(p, v1, v2) < r;

  v1.load(max);
  v2[0] = min[0];
  v2[1] = min[1];
  ret = ret || dist_to_line_2d(p, v1, v2) < r;
  //*/
  return ret;
};

export function point_in_aabb(p, min, max) {
  return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1]
    && p[2] >= min[2] && p[2] <= max[2];
}

let asi_rect = new Array(8);
for (let i = 0; i < 8; i++) {
  asi_rect[i] = new Vector3();
}

let aabb_sphere_isect_vs = util.cachering.fromConstructor(Vector3, 64);

export function aabb_sphere_isect(p, r, min, max) {
  {
    let p1 = aabb_sphere_isect_vs.next().load(p);
    let min1 = aabb_sphere_isect_vs.next().load(min);
    let max1 = aabb_sphere_isect_vs.next().load(max);
    if (p.length === 2) {
      p1[2] = 0.0;
    }
    if (min1.length === 2) {
      min1[2] = 0.0;
    }
    if (max.length === 2) {
      max1[2] = 0.0;
    }

    p = p1;
    min = min1;
    max = max1;
  }

  let cent = aabb_sphere_isect_vs.next().load(min).interp(max, 0.5);
  p.sub(cent);
  min.sub(cent);
  max.sub(cent);

  r *= r;

  let isect = point_in_aabb(p, min, max);

  if (isect) {
    return true;
  }

  let rect = asi_rect;

  rect[0].loadXYZ(min[0], min[1], min[2]);
  rect[1].loadXYZ(min[0], max[1], min[2]);
  rect[2].loadXYZ(max[0], max[1], min[2]);
  rect[3].loadXYZ(max[0], min[1], min[2]);

  rect[4].loadXYZ(min[0], min[1], max[2]);
  rect[5].loadXYZ(min[0], max[1], max[2]);
  rect[6].loadXYZ(max[0], max[1], max[2]);
  rect[7].loadXYZ(max[0], min[1], max[2]);

  for (let i = 0; i < 8; i++) {
    if (p.vectorDistanceSqr(rect[i]) < r) {
      return true;
    }
  }

  let p2 = aabb_sphere_isect_vs.next().load(p);

  for (let i = 0; i < 3; i++) {
    p2.load(p);

    let i2 = (i + 1)%3;
    let i3 = (i + 2)%3;

    p2[i] = p2[i] < 0.0 ? min[i] : max[i];

    p2[i2] = Math.min(Math.max(p2[i2], min[i2]), max[i2]);
    p2[i3] = Math.min(Math.max(p2[i3], min[i3]), max[i3]);

    let isect = p2.vectorDistanceSqr(p) <= r;

    if (isect) {
      return true;
    }
  }

  return false;
};

export function aabb_sphere_dist(p, min, max) {
  {
    let p1 = aabb_sphere_isect_vs.next().load(p);
    let min1 = aabb_sphere_isect_vs.next().load(min);
    let max1 = aabb_sphere_isect_vs.next().load(max);
    if (p.length === 2) {
      p1[2] = 0.0;
    }
    if (min1.length === 2) {
      min1[2] = 0.0;
    }
    if (max.length === 2) {
      max1[2] = 0.0;
    }

    p = p1;
    min = min1;
    max = max1;
  }

  let cent = aabb_sphere_isect_vs.next().load(min).interp(max, 0.5);
  p.sub(cent);
  min.sub(cent);
  max.sub(cent);

  let isect = point_in_aabb(p, min, max);

  if (isect) {
    return 0.0;
  }

  let rect = asi_rect;

  rect[0].loadXYZ(min[0], min[1], min[2]);
  rect[1].loadXYZ(min[0], max[1], min[2]);
  rect[2].loadXYZ(max[0], max[1], min[2]);
  rect[3].loadXYZ(max[0], min[1], min[2]);

  rect[4].loadXYZ(min[0], min[1], max[2]);
  rect[5].loadXYZ(min[0], max[1], max[2]);
  rect[6].loadXYZ(max[0], max[1], max[2]);
  rect[7].loadXYZ(max[0], min[1], max[2]);

  let mindis;

  for (let i = 0; i < 8; i++) {
    let dis = p.vectorDistanceSqr(rect[i]);

    if (mindis === undefined || dis < mindis) {
      mindis = dis;
    }
  }

  let p2 = aabb_sphere_isect_vs.next().load(p);

  for (let i = 0; i < 3; i++) {
    p2.load(p);

    let i2 = (i + 1)%3;
    let i3 = (i + 2)%3;

    p2[i] = p2[i] < 0.0 ? min[i] : max[i];

    p2[i2] = Math.min(Math.max(p2[i2], min[i2]), max[i2]);
    p2[i3] = Math.min(Math.max(p2[i3], min[i3]), max[i3]);

    let dis = p2.vectorDistanceSqr(p);
    if (mindis === undefined || dis < mindis) {
      mindis = dis;
    }
  }

  return mindis === undefined ? 1e17 : mindis;
};

export function point_in_tri(p, v1, v2, v3) {
  var w1 = winding(p, v1, v2);
  var w2 = winding(p, v2, v3);
  var w3 = winding(p, v3, v1);
  return w1 == w2 && w2 == w3;
};

export function convex_quad(v1, v2, v3, v4) {
  return line_line_cross([v1, v3], [v2, v4]);
};

var $e1_normal_tri = new Vector3();
var $e3_normal_tri = new Vector3();
var $e2_normal_tri = new Vector3();

export function isNum(f) {
  let ok = typeof f === "number";

  ok = ok && !isNaN(f) && isFinite(f);

  return ok;
}

const _normal_tri_rets = util.cachering.fromConstructor(Vector3, 64);

export function normal_tri(v1, v2, v3) {
  let x1 = v2[0] - v1[0];
  let y1 = v2[1] - v1[1];
  let z1 = v2[2] - v1[2];
  let x2 = v3[0] - v1[0];
  let y2 = v3[1] - v1[1];
  let z2 = v3[2] - v1[2];

  if (!isNum(x1 + y1 + z1 + z2 + y2 + z2)) {
    throw new Error("NaN in normal_tri");
  }

  let x3, y3, z3;

  x1 = v2[0] - v1[0];
  y1 = v2[1] - v1[1];
  z1 = v2[2] - v1[2];
  x2 = v3[0] - v1[0];
  y2 = v3[1] - v1[1];
  z2 = v3[2] - v1[2];
  x3 = y1*z2 - z1*y2;
  y3 = z1*x2 - x1*z2;
  z3 = x1*y2 - y1*x2;

  let len = Math.sqrt((x3*x3 + y3*y3 + z3*z3));

  if (len > 1e-05)
    len = 1.0/len;

  x3 *= len;
  y3 *= len;
  z3 *= len;

  let n = _normal_tri_rets.next();

  if (!isNum(x3 + y3 + z3)) {
    throw new Error("NaN!");
  }

  n[0] = x3;
  n[1] = y3;
  n[2] = z3;

  return n;
};

var $n2_normal_quad = new Vector3();

let _q1 = new Vector3(), _q2 = new Vector3(), _q3 = new Vector3();

export function normal_quad(v1, v2, v3, v4) {
  _q1.load(normal_tri(v1, v2, v3));
  _q2.load(normal_tri(v2, v3, v4));

  _q1.add(_q2).normalize();
  return _q1;
}

export function normal_quad_old(v1, v2, v3, v4) {
  var n = normal_tri(v1, v2, v3);
  $n2_normal_quad[0] = n[0];
  $n2_normal_quad[1] = n[1];
  $n2_normal_quad[2] = n[2];
  n = normal_tri(v1, v3, v4);
  $n2_normal_quad[0] = $n2_normal_quad[0] + n[0];
  $n2_normal_quad[1] = $n2_normal_quad[1] + n[1];
  $n2_normal_quad[2] = $n2_normal_quad[2] + n[2];
  var _len = Math.sqrt(($n2_normal_quad[0]*$n2_normal_quad[0] + $n2_normal_quad[1]*$n2_normal_quad[1] + $n2_normal_quad[2]*$n2_normal_quad[2]));
  if (_len > 1e-05)
    _len = 1.0/_len;
  $n2_normal_quad[0] *= _len;
  $n2_normal_quad[1] *= _len;
  $n2_normal_quad[2] *= _len;
  return $n2_normal_quad;
};

var _li_vi = new Vector3();

//calc_t is optional, false
export function line_isect(v1, v2, v3, v4, calc_t) {
  if (calc_t == undefined) {
    calc_t = false;
  }
  var div = (v2[0] - v1[0])*(v4[1] - v3[1]) - (v2[1] - v1[1])*(v4[0] - v3[0]);
  if (div == 0.0)
    return [new Vector3(), COLINEAR, 0.0];
  var vi = _li_vi;
  vi[0] = 0;
  vi[1] = 0;
  vi[2] = 0;
  vi[0] = ((v3[0] - v4[0])*(v1[0]*v2[1] - v1[1]*v2[0]) - (v1[0] - v2[0])*(v3[0]*v4[1] - v3[1]*v4[0]))/div;
  vi[1] = ((v3[1] - v4[1])*(v1[0]*v2[1] - v1[1]*v2[0]) - (v1[1] - v2[1])*(v3[0]*v4[1] - v3[1]*v4[0]))/div;
  if (calc_t || v1.length == 3) {
    var n1 = new Vector2(v2).sub(v1);
    var n2 = new Vector2(vi).sub(v1);
    var t = n2.vectorLength()/n1.vectorLength();
    n1.normalize();
    n2.normalize();
    if (n1.dot(n2) < 0.0) {
      t = -t;
    }
    if (v1.length == 3) {
      vi[2] = v1[2] + (v2[2] - v1[2])*t;
    }
    return [vi, LINECROSS, t];
  }
  return [vi, LINECROSS];
};

var dt2l_v1 = new Vector2();
var dt2l_v2 = new Vector2();
var dt2l_v3 = new Vector2();
var dt2l_v4 = new Vector2();
var dt2l_v5 = new Vector2();

export function dist_to_line_2d(p, v1, v2, clip, closest_co_out = undefined, t_out = undefined) {
  if (clip == undefined) {
    clip = true;
  }

  v1 = dt2l_v4.load(v1);
  v2 = dt2l_v5.load(v2);

  var n = dt2l_v1;
  var vec = dt2l_v3;

  n.load(v2).sub(v1).normalize();
  vec.load(p).sub(v1);

  var t = vec.dot(n);
  if (clip) {
    t = Math.min(Math.max(t, 0.0), v1.vectorDistance(v2));
  }

  n.mulScalar(t).add(v1);

  if (closest_co_out) {
    closest_co_out[0] = n[0];
    closest_co_out[1] = n[1];
  }

  if (t_out !== undefined) {
    t_out = t;
  }

  return n.vectorDistance(p);
}

var dt3l_v1 = new Vector3();
var dt3l_v2 = new Vector3();
var dt3l_v3 = new Vector3();
var dt3l_v4 = new Vector3();
var dt3l_v5 = new Vector3();

export function dist_to_line_sqr(p, v1, v2, clip = true) {
  let px = p[0] - v1[0];
  let py = p[1] - v1[1];
  let pz = p.length < 3 ? 0.0 : p[2] - v1[2];

  pz = pz === undefined ? 0.0 : pz;

  let v2x = v2[0] - v1[0];
  let v2y = v2[1] - v1[1];
  let v2z = v2.length < 3 ? 0.0 : v2[2] - v1[2];

  let len = v2x*v2x + v2y*v2y + v2z*v2z;

  if (len === 0.0) {
    return Math.sqrt(px*px + py*py + pz*pz);
  }

  let len2 = 1.0/len;
  v2x *= len2;
  v2y *= len2;
  v2z *= len2;

  let t = px*v2x + py*v2y + pz*v2z;
  if (clip) {
    t = Math.min(Math.max(t, 0.0), len);
  }

  v2x *= t;
  v2y *= t;
  v2z *= t;

  return (v2x - px)*(v2x - px) + (v2y - py)*(v2y - py) + (v2z - pz)*(v2z - pz);
}

export function dist_to_line(p, v1, v2, clip = true) {
  return Math.sqrt(dist_to_line_sqr(p, v1, v2, clip));
}

//p cam be 2d, 3d, or 4d point, v1/v2 however must be full homogenous coordinates
var _cplw_vs4 = util.cachering.fromConstructor(Vector4, 64);
var _cplw_vs3 = util.cachering.fromConstructor(Vector3, 64);
var _cplw_vs2 = util.cachering.fromConstructor(Vector2, 64);

function wclip(x1, x2, w1, w2, near) {
  var r1 = near*w1 - x1;
  var r2 = (w1 - w2)*near - (x1 - x2);

  if (r2 == 0.0) return 0.0;

  return r1/r2;
}

function clip(a, b, znear) {
  if (a - b == 0.0) return 0.0;

  return (a - znear)/(a - b);
}

/*clips v1 and v2 to lie within homogenous projection range
  v1 and v2 are assumed to be projected, pre-division Vector4's
  returns a positive number (how much the line was scaled) if either _v1 or _v2 are
  in front of the near clipping plane otherwise, returns 0
 */
export function clip_line_w(_v1, _v2, znear, zfar) {
  var v1 = _cplw_vs4.next().load(_v1);
  var v2 = _cplw_vs4.next().load(_v2);

  //are we fully behind the view plane?
  if ((v1[2] < 1.0 && v2[2] < 1.0))
    return false;

  function doclip1(v1, v2, axis) {
    if (v1[axis]/v1[3] < -1) {
      var t = wclip(v1[axis], v2[axis], v1[3], v2[3], -1);
      v1.interp(v2, t);
    } else if (v1[axis]/v1[3] > 1) {
      var t = wclip(v1[axis], v2[axis], v1[3], v2[3], 1);
      v1.interp(v2, t);
    }
  }

  function doclip(v1, v2, axis) {
    doclip1(v1, v2, axis);
    doclip1(v2, v1, axis);
  }

  function dozclip(v1, v2) {
    if (v1[2] < 1) {
      var t = clip(v1[2], v2[2], 1);
      v1.interp(v2, t);
    } else if (v2[2] < 1) {
      var t = clip(v2[2], v1[2], 1);
      v2.interp(v1, t);
    }
  }

  dozclip(v1, v2, 1);
  doclip(v1, v2, 0);
  doclip(v1, v2, 1);

  for (var i = 0; i < 4; i++) {
    _v1[i] = v1[i];
    _v2[i] = v2[i];
  }

  return !(v1[0]/v1[3] == v2[0]/v2[3] || v1[1]/v2[3] == v2[1]/v2[3]);
};

//clip is optional, true.  clip point to lie within line segment v1->v2
var _closest_point_on_line_cache = util.cachering.fromConstructor(Vector3, 64);
var _closest_point_rets = new util.cachering(function () {
  return [0, 0];
}, 64);

var _closest_tmps = [new Vector3(), new Vector3(), new Vector3()];

export function closest_point_on_line(p, v1, v2, clip = true) {
  var l1 = _closest_tmps[0], l2 = _closest_tmps[1];
  var len;


  l1.load(v2).sub(v1);

  if (clip) {
    len = l1.vectorLength();
  }

  l1.normalize();
  l2.load(p).sub(v1);

  var t = l2.dot(l1);
  if (clip) {
    //t = t*(t<0.0) + t*(t>1.0) + (t>1.0);
    t = t < 0.0 ? 0.0 : t;
    t = t > len ? len : t;
  }

  var p = _closest_point_on_line_cache.next();
  p.load(l1).mulScalar(t).add(v1);
  var ret = _closest_point_rets.next();

  ret[0] = p;
  ret[1] = t;

  return ret;
};

/*given input line (a,d) and tangent t,
  returns a circle that goes through both
  a and d, whose normalized tangent at a is the same
  as normalized t.
  
  note that t need not be normalized, this function
  does that itself*/
var _circ_from_line_tan_vs = util.cachering.fromConstructor(Vector3, 32);
var _circ_from_line_tan_ret = new util.cachering(function () {
  return [new Vector3(), 0];
});

export function circ_from_line_tan(a, b, t) {
  var p1 = _circ_from_line_tan_vs.next();
  var t2 = _circ_from_line_tan_vs.next();
  var n1 = _circ_from_line_tan_vs.next();

  p1.load(a).sub(b);
  t2.load(t).normalize();
  n1.load(p1).normalize().cross(t2).cross(t2).normalize();

  var ax = p1[0], ay = p1[1], az = p1[2], nx = n1[0], ny = n1[1], nz = n1[2];
  var r = -(ax*ax + ay*ay + az*az)/(2*(ax*nx + ay*ny + az*nz));

  var ret = _circ_from_line_tan_ret.next();
  ret[0].load(n1).mulScalar(r).add(a)
  ret[1] = r;

  return ret;
}

var _gtc_e1 = new Vector3();
var _gtc_e2 = new Vector3();
var _gtc_e3 = new Vector3();
var _gtc_p1 = new Vector3();
var _gtc_p2 = new Vector3();
var _gtc_v1 = new Vector3();
var _gtc_v2 = new Vector3();
var _gtc_p12 = new Vector3();
var _gtc_p22 = new Vector3();
var _get_tri_circ_ret = new util.cachering(function () {
  return [0, 0]
});

export function get_tri_circ(a, b, c) {
  var v1 = _gtc_v1;
  var v2 = _gtc_v2;
  var e1 = _gtc_e1;
  var e2 = _gtc_e2;
  var e3 = _gtc_e3;
  var p1 = _gtc_p1;
  var p2 = _gtc_p2;

  for (var i = 0; i < 3; i++) {
    e1[i] = b[i] - a[i];
    e2[i] = c[i] - b[i];
    e3[i] = a[i] - c[i];
  }

  for (var i = 0; i < 3; i++) {
    p1[i] = (a[i] + b[i])*0.5;
    p2[i] = (c[i] + b[i])*0.5;
  }

  e1.normalize();

  v1[0] = -e1[1];
  v1[1] = e1[0];
  v1[2] = e1[2];

  v2[0] = -e2[1];
  v2[1] = e2[0];
  v2[2] = e2[2];

  v1.normalize();
  v2.normalize();

  var cent;
  var type;
  for (var i = 0; i < 3; i++) {
    _gtc_p12[i] = p1[i] + v1[i];
    _gtc_p22[i] = p2[i] + v2[i];
  }

  var ret = line_isect(p1, _gtc_p12, p2, _gtc_p22);
  cent = ret[0];
  type = ret[1];

  e1.load(a);
  e2.load(b);
  e3.load(c);

  var r = e1.sub(cent).vectorLength();
  if (r < feps)
    r = e2.sub(cent).vectorLength();
  if (r < feps)
    r = e3.sub(cent).vectorLength();

  var ret = _get_tri_circ_ret.next();
  ret[0] = cent;
  ret[1] = r;

  return ret;
};

export function gen_circle(m, origin, r, stfeps) {
  var pi = Math.PI;
  var f = -pi/2;
  var df = (pi*2)/stfeps;
  var verts = new Array();
  for (var i = 0; i < stfeps; i++) {
    var x = origin[0] + r*Math.sin(f);
    var y = origin[1] + r*Math.cos(f);
    var v = m.make_vert(new Vector3([x, y, origin[2]]));
    verts.push(v);
    f += df;
  }
  for (var i = 0; i < verts.length; i++) {
    var v1 = verts[i];
    var v2 = verts[(i + 1)%verts.length];
    m.make_edge(v1, v2);
  }
  return verts;
};

var cos = Math.cos;
var sin = Math.sin;

//axis is optional, 0
export function rot2d(v1, A, axis) {
  var x = v1[0];
  var y = v1[1];

  if (axis == 1) {
    v1[0] = x*cos(A) + y*sin(A);
    v1[2] = y*cos(A) - x*sin(A);
  } else {
    v1[0] = x*cos(A) - y*sin(A);
    v1[1] = y*cos(A) + x*sin(A);
  }
}

export function makeCircleMesh(gl, radius, stfeps) {
  var mesh = new Mesh();
  var verts1 = gen_circle(mesh, new Vector3(), radius, stfeps);
  var verts2 = gen_circle(mesh, new Vector3(), radius/1.75, stfeps);
  mesh.make_face_complex([verts1, verts2]);
  return mesh;
};

export function minmax_verts(verts) {
  var min = new Vector3([1000000000000.0, 1000000000000.0, 1000000000000.0]);
  var max = new Vector3([-1000000000000.0, -1000000000000.0, -1000000000000.0]);
  var __iter_v = __get_iter(verts);
  var v;
  while (1) {
    var __ival_v = __iter_v.next();
    if (__ival_v.done) {
      break;
    }
    v = __ival_v.value;
    for (var i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], v.co[i]);
      max[i] = Math.max(max[i], v.co[i]);
    }
  }
  return [min, max];
};

export function unproject(vec, ipers, iview) {
  var newvec = new Vector3(vec);
  newvec.multVecMatrix(ipers);
  newvec.multVecMatrix(iview);
  return newvec;
};

export function project(vec, pers, view) {
  var newvec = new Vector3(vec);
  newvec.multVecMatrix(pers);
  newvec.multVecMatrix(view);
  return newvec;
};

var _sh_minv = new Vector3();
var _sh_maxv = new Vector3();
var _sh_start = [];
var _sh_end = [];

var static_cent_gbw = new Vector3();

export function get_boundary_winding(points) {
  var cent = static_cent_gbw.zero();
  if (points.length == 0)
    return false;
  for (var i = 0; i < points.length; i++) {
    cent.add(points[i]);
  }
  cent.divideScalar(points.length);
  var w = 0, totw = 0;
  for (var i = 0; i < points.length; i++) {
    var v1 = points[i];
    var v2 = points[(i + 1)%points.length];
    if (!colinear(v1, v2, cent)) {
      w += winding(v1, v2, cent);
      totw += 1;
    }
  }
  if (totw > 0)
    w /= totw;
  return Math.round(w) == 1;
};

export class PlaneOps {
  constructor(normal) {
    var no = normal;
    this.axis = [0, 0, 0];
    this.reset_axis(normal);
  }

  reset_axis(no) {
    var ax, ay, az;
    var nx = Math.abs(no[0]), ny = Math.abs(no[1]), nz = Math.abs(no[2]);
    if (nz > nx && nz > ny) {
      ax = 0;
      ay = 1;
      az = 2;
    } else if (nx > ny && nx > nz) {
      ax = 2;
      ay = 1;
      az = 0;
    } else {
      ax = 0;
      ay = 2;
      az = 1;
    }
    this.axis = [ax, ay, az];
  }

  convex_quad(v1, v2, v3, v4) {
    var ax = this.axis;
    v1 = new Vector3([v1[ax[0]], v1[ax[1]], v1[ax[2]]]);
    v2 = new Vector3([v2[ax[0]], v2[ax[1]], v2[ax[2]]]);
    v3 = new Vector3([v3[ax[0]], v3[ax[1]], v3[ax[2]]]);
    v4 = new Vector3([v4[ax[0]], v4[ax[1]], v4[ax[2]]]);
    return convex_quad(v1, v2, v3, v4);
  }

  line_isect(v1, v2, v3, v4) {
    var ax = this.axis;
    var orig1 = v1, orig2 = v2;
    v1 = new Vector3([v1[ax[0]], v1[ax[1]], v1[ax[2]]]);
    v2 = new Vector3([v2[ax[0]], v2[ax[1]], v2[ax[2]]]);
    v3 = new Vector3([v3[ax[0]], v3[ax[1]], v3[ax[2]]]);
    v4 = new Vector3([v4[ax[0]], v4[ax[1]], v4[ax[2]]]);
    var ret = line_isect(v1, v2, v3, v4, true);
    var vi = ret[0];
    if (ret[1] == LINECROSS) {
      ret[0].load(orig2).sub(orig1).mulScalar(ret[2]).add(orig1);
    }
    return ret;
  }

  line_line_cross(l1, l2) {
    var ax = this.axis;
    var v1 = l1[0], v2 = l1[1], v3 = l2[0], v4 = l2[1];
    v1 = new Vector3([v1[ax[0]], v1[ax[1]], 0.0]);
    v2 = new Vector3([v2[ax[0]], v2[ax[1]], 0.0]);
    v3 = new Vector3([v3[ax[0]], v3[ax[1]], 0.0]);
    v4 = new Vector3([v4[ax[0]], v4[ax[1]], 0.0]);
    return line_line_cross([v1, v2], [v3, v4]);
  }

  winding(v1, v2, v3) {
    var ax = this.axis;
    if (v1 == undefined)
      console.trace();
    v1 = new Vector3([v1[ax[0]], v1[ax[1]], 0.0]);
    v2 = new Vector3([v2[ax[0]], v2[ax[1]], 0.0]);
    v3 = new Vector3([v3[ax[0]], v3[ax[1]], 0.0]);
    return winding(v1, v2, v3);
  }

  colinear(v1, v2, v3) {
    var ax = this.axis;
    v1 = new Vector3([v1[ax[0]], v1[ax[1]], 0.0]);
    v2 = new Vector3([v2[ax[0]], v2[ax[1]], 0.0]);
    v3 = new Vector3([v3[ax[0]], v3[ax[1]], 0.0]);
    return colinear(v1, v2, v3);
  }

  get_boundary_winding(points) {
    var ax = this.axis;
    var cent = new Vector3();
    if (points.length == 0)
      return false;
    for (var i = 0; i < points.length; i++) {
      cent.add(points[i]);
    }
    cent.divideScalar(points.length);
    var w = 0, totw = 0;
    for (var i = 0; i < points.length; i++) {
      var v1 = points[i];
      var v2 = points[(i + 1)%points.length];
      if (!this.colinear(v1, v2, cent)) {
        w += this.winding(v1, v2, cent);
        totw += 1;
      }
    }
    if (totw > 0)
      w /= totw;
    return Math.round(w) == 1;
  }
}

/*
on factor;

px := rox + rnx*t;
py := roy + rny*t;
pz := roz + rnz*t;

f1 := (px-pox)*pnx + (py-poy)*pny + (pz-poz)*pnz;
ff := solve(f1, t);
on fort;
part(ff, 1, 2);
off fort;

* */
var _isrp_ret = new Vector3();
let isect_ray_plane_rets = util.cachering.fromConstructor(Vector3, 256);

export function isect_ray_plane(planeorigin, planenormal, rayorigin, raynormal) {
  let po = planeorigin, pn = planenormal, ro = rayorigin, rn = raynormal;

  let div = (pn[1]*rn[1] + pn[2]*rn[2] + pn[0]*rn[0]);

  if (Math.abs(div) < 0.000001) {
    return undefined;
  }

  let t = ((po[1] - ro[1])*pn[1] + (po[2] - ro[2])*pn[2] + (po[0] - ro[0])*pn[0])/div;
  _isrp_ret.load(ro).addFac(rn, t);

  return isect_ray_plane_rets.next().load(_isrp_ret);
}

export function _old_isect_ray_plane(planeorigin, planenormal, rayorigin, raynormal) {
  var p = planeorigin, n = planenormal;
  var r = rayorigin, v = raynormal;

  var d = p.vectorLength();
  var t = -(r.dot(n) - p.dot(n))/v.dot(n);
  _isrp_ret.load(v);
  _isrp_ret.mulScalar(t);
  _isrp_ret.add(r);
  return _isrp_ret;
};

export function mesh_find_tangent(mesh, viewvec, offvec, projmat, verts) {
  if (verts == undefined)
    verts = mesh.verts.selected;
  var vset = new set();
  var eset = new set();
  var __iter_v = __get_iter(verts);
  var v;
  while (1) {
    var __ival_v = __iter_v.next();
    if (__ival_v.done) {
      break;
    }
    v = __ival_v.value;
    vset.add(v);
  }
  var __iter_v = __get_iter(vset);
  var v;
  while (1) {
    var __ival_v = __iter_v.next();
    if (__ival_v.done) {
      break;
    }
    v = __ival_v.value;
    var __iter_e = __get_iter(v.edges);
    var e;
    while (1) {
      var __ival_e = __iter_e.next();
      if (__ival_e.done) {
        break;
      }
      e = __ival_e.value;
      if (vset.has(e.other_vert(v))) {
        eset.add(e);
      }
    }
  }
  if (eset.length == 0) {
    return new Vector3(offvec);
  }
  var tanav = new Vector3();
  var evec = new Vector3();
  var tan = new Vector3();
  var co2 = new Vector3();
  var __iter_e = __get_iter(eset);
  var e;
  while (1) {
    var __ival_e = __iter_e.next();
    if (__ival_e.done) {
      break;
    }
    e = __ival_e.value;
    evec.load(e.v1.co).multVecMatrix(projmat);
    co2.load(e.v2.co).multVecMatrix(projmat);
    evec.sub(co2);
    evec.normalize();
    tan[0] = evec[1];
    tan[1] = -evec[0];
    tan[2] = 0.0;
    if (tan.dot(offvec) < 0.0)
      tan.mulScalar(-1.0);
    tanav.add(tan);
  }
  tanav.normalize();
  return tanav;
};

export class Mat4Stack {
  constructor() {
    this.stack = [];
    this.matrix = new Matrix4();
    this.matrix.makeIdentity();
    this.update_func = undefined;
  }

  set_internal_matrix(mat, update_func) {
    this.update_func = update_func;
    this.matrix = mat;
  }

  reset(mat) {
    this.matrix.load(mat);
    this.stack = [];
    if (this.update_func != undefined)
      this.update_func();
  }

  load(mat) {
    this.matrix.load(mat);
    if (this.update_func != undefined)
      this.update_func();
  }

  multiply(mat) {
    this.matrix.multiply(mat);
    if (this.update_func != undefined)
      this.update_func();
  }

  identity() {
    this.matrix.loadIdentity();
    if (this.update_func != undefined)
      this.update_func();
  }

  push(mat2) {
    this.stack.push(new Matrix4(this.matrix));
    if (mat2 != undefined) {
      this.matrix.load(mat2);
      if (this.update_func != undefined)
        this.update_func();
    }
  }

  pop() {
    var mat = this.stack.pop(this.stack.length - 1);
    this.matrix.load(mat);
    if (this.update_func != undefined)
      this.update_func();
    return mat;
  }
}


/*

on factor;
off period;

load_package "avector";


a1 := avec(a1x, a1y, a1z);
b1 := avec(b1x, b1y, b1z);
c1 := avec(c1x, c1y, c1z);
d1 := avec(d1x, d1y, d1z);

a1x := 0;
a1y := 0;
a1z := 0;

a2 := avec(a2x, a2y, a2z);
b2 := avec(b2x, b2y, b2z);
c2 := avec(c2x, c2y, c2z);
d2 := avec(d2x, d2y, d2z);

p1 := a1 + (b1 - a1) * v;
p2 := d1 + (c1 - d1) * v;
p3 := p1 + (p2 - p1) * u;

p4 := a2 + (b2 - a2) * v;
p5 := d2 + (c2 - d2) * v;
p6 := p4 + (p5 - p4) * u;

p7 := p3 + (p6 - p3) * w;

f1 := p7[0] - goalx;
f2 := p7[1] - goaly;
f3 := p7[2] - goalz;

comment: solve({f1, f2, f3}, {u, v, w});

on fort;
p7;
off fort;

sub(u=0, v=1, w=0, p7[0]);

*/

const tril_rets = util.cachering.fromConstructor(Vector3, 128);

function lreport() {
  //console.log(...arguments);
}

export function trilinear_v3(uvw, boxverts) {
  let [u, v, w] = uvw;

  const a1x = boxverts[0][0], a1y = boxverts[0][1], a1z = boxverts[0][2];

  const b1x = boxverts[1][0] - a1x, b1y = boxverts[1][1] - a1y, b1z = boxverts[1][2] - a1z;
  const c1x = boxverts[2][0] - a1x, c1y = boxverts[2][1] - a1y, c1z = boxverts[2][2] - a1z;
  const d1x = boxverts[3][0] - a1x, d1y = boxverts[3][1] - a1y, d1z = boxverts[3][2] - a1z;

  const a2x = boxverts[4][0] - a1x, a2y = boxverts[4][1] - a1y, a2z = boxverts[4][2] - a1z;
  const b2x = boxverts[5][0] - a1x, b2y = boxverts[5][1] - a1y, b2z = boxverts[5][2] - a1z;
  const c2x = boxverts[6][0] - a1x, c2y = boxverts[6][1] - a1y, c2z = boxverts[6][2] - a1z;
  const d2x = boxverts[7][0] - a1x, d2y = boxverts[7][1] - a1y, d2z = boxverts[7][2] - a1z;

  const x = (((a2x - b2x)*v - a2x + (c2x - d2x)*v + d2x)*u - ((a2x - b2x)*v - a2x) - (
    ((c1x - d1x)*v + d1x - b1x*v)*u + b1x*v))*w + ((c1x - d1x)*v + d1x - b1x*v)*u +
    b1x*v;
  const y = (((a2y - b2y)*v - a2y + (c2y - d2y)*v + d2y)*u - ((a2y - b2y)*v - a2y) - (
    ((c1y - d1y)*v + d1y - b1y*v)*u + b1y*v))*w + ((c1y - d1y)*v + d1y - b1y*v)*u +
    b1y*v;
  const z = (((a2z - b2z)*v - a2z + (c2z - d2z)*v + d2z)*u - ((a2z - b2z)*v - a2z) - (
    ((c1z - d1z)*v + d1z - b1z*v)*u + b1z*v))*w + ((c1z - d1z)*v + d1z - b1z*v)*u +
    b1z*v;

  let p = tril_rets.next();

  p[0] = x + a1x;
  p[1] = y + a1y;
  p[2] = z + a1z;

  return p;
}

let tril_co_rets = util.cachering.fromConstructor(Vector3, 128);
let tril_co_tmps = util.cachering.fromConstructor(Vector3, 16);
let tril_mat_1 = new Matrix4();
let tril_mat_2 = new Matrix4();

let wtable = [
  [
    [0.5, 0.5, 0], //u triplet
    [0.5, 0.5, 0], //v triplet
    [0.5, 0.5, 0]  //w triplet
  ],
  [
    [0.5, 0.5, 0],
    [0.0, 0.5, 0.5],
    [0.5, 0.5, 0]
  ],
  [
    [0.0, 0.5, 0.5],
    [0.0, 0.5, 0.5],
    [0.5, 0.5, 0]
  ],
  [
    [0.0, 0.5, 0.5],
    [0.5, 0.5, 0],
    [0.5, 0.5, 0]
  ],
];

for (let i = 0; i < 4; i++) {
  let w = wtable[i];
  w = [w[0], w[1], [0.0, 0.5, 0.5]];
  wtable.push(w);
}

const pih_tmps = util.cachering.fromConstructor(Vector3, 16);
const boxfaces_table = [
  [0, 1, 2, 3],
  [7, 6, 5, 4],
  [0, 4, 5, 1],
  [1, 5, 6, 2],
  [2, 6, 7, 3],
  [3, 7, 4, 0]
];

let boxfaces_tmp = new Array(6);
for (let i = 0; i < 6; i++) {
  boxfaces_tmp[i] = new Vector3();
}

let boxfacenormals_tmp = new Array(6);
for (let i = 0; i < 6; i++) {
  boxfacenormals_tmp[i] = new Vector3();
}

export function point_in_hex(p, boxverts, boxfacecents = undefined, boxfacenormals = undefined) {
  if (!boxfacecents) {
    boxfacecents = boxfaces_tmp;

    for (let i = 0; i < 6; i++) {
      let [v1, v2, v3, v4] = boxfaces_table[i];
      v1 = boxverts[v1];
      v2 = boxverts[v2];
      v3 = boxverts[v3];
      v4 = boxverts[v4];

      boxfacecents[i].load(v1).add(v2).add(v3).add(v4).mulScalar(0.25);
    }
  }

  if (!boxfacenormals) {
    boxfacenormals = boxfacenormals_tmp;
    for (let i = 0; i < 6; i++) {
      let [v1, v2, v3, v4] = boxfaces_table[i];
      v1 = boxverts[v1];
      v2 = boxverts[v2];
      v3 = boxverts[v3];
      v4 = boxverts[v4];

      let n = normal_quad(v1, v2, v3, v4);
      boxfacenormals[i].load(n).negate();
    }
  }

  let t1 = pih_tmps.next();
  let t2 = pih_tmps.next();

  let cent = pih_tmps.next().zero();
  for (let i = 0; i < 6; i++) {
    cent.add(boxfacecents[i]);
  }
  cent.mulScalar(1.0/6.0);

  let ret = true;

  for (let i = 0; i < 6; i++) {
    t1.load(p).sub(boxfacecents[i]);
    t2.load(cent).sub(boxfacecents[i]);
    let n = boxfacenormals[i];

    if (1) {
      t1.normalize();
      t2.normalize();

      //console.log(i, "DOT", n.dot(t1).toFixed(5), n, t1);
    }

    if (t1.dot(t2) < 0) {
      //console.log("\n");
      ret = false;
      return false;
    }
  }

  //console.log("\n");
  return ret;
  //return true;
}

const boxverts_tmp = new Array(8);
for (let i = 0; i < 8; i++) {
  boxverts_tmp[i] = new Vector3();
}

export function trilinear_co(p, boxverts) {
  let uvw = tril_co_rets.next();

  uvw.zero();

  let u = tril_co_tmps.next();
  let v = tril_co_tmps.next();
  let w = tril_co_tmps.next();

  u.loadXYZ(0.0, 0.5, 1.0);
  v.loadXYZ(0.0, 0.5, 1.0);
  w.loadXYZ(0.0, 0.5, 1.0);

  let uvw2 = tril_co_tmps.next();

  for (let step = 0; step < 4; step++) {
    uvw.loadXYZ(u[1], v[1], w[1]);

    let mini = undefined;
    let mindis = trilinear_v3(uvw, boxverts).vectorDistanceSqr(p);

    for (let i = 0; i < 8; i++) {
      let [t1, t2, t3] = wtable[i];

      let u2 = t1[0]*u[0] + t1[1]*u[1] + t1[2]*u[2];
      let v2 = t2[0]*v[0] + t2[1]*v[1] + t2[2]*v[2];
      let w2 = t3[0]*w[0] + t3[1]*w[1] + t3[2]*w[2];

      let du = Math.abs(u2 - u[1]);
      let dv = Math.abs(v2 - v[1]);
      let dw = Math.abs(w2 - w[1]);

      uvw.loadXYZ(u2, v2, w2);
      let dis = trilinear_v3(uvw, boxverts).vectorDistanceSqr(p);

      if (mindis === undefined || dis < mindis) {
        //mindis = dis;
        //mini = i;
      }

      if (1) {
        let bv = boxverts_tmp;

        /*
        let dd = 1.0 - 0.001;

        du *= dd;
        dv *= dd;
        dw *= dd;
        //*/

        bv[0].loadXYZ(u2 - du, v2 - dv, w2 - dw);
        bv[1].loadXYZ(u2 - du, v2 + dv, w2 - dw);
        bv[2].loadXYZ(u2 + du, v2 + dv, w2 - dw);
        bv[3].loadXYZ(u2 + du, v2 - dv, w2 - dw);

        bv[4].loadXYZ(u2 - du, v2 - dv, w2 + dw);
        bv[5].loadXYZ(u2 - du, v2 + dv, w2 + dw);
        bv[6].loadXYZ(u2 + du, v2 + dv, w2 + dw);
        bv[7].loadXYZ(u2 + du, v2 - dv, w2 + dw);

        for (let j = 0; j < 8; j++) {
          bv[j].load(trilinear_v3(bv[j], boxverts));
        }

        if (point_in_hex(p, bv)) {
          mini = i;
          mindis = dis;
          //console.log("DIS", (dis**0.5).toFixed(3));
          break;
        }

        //console.log("\n");
      }
    }

    if (mini === undefined) {
      lreport("mindis:", (mindis**0.5).toFixed(3));
      break;
    }

    let [t1, t2, t3] = wtable[mini];

    let u2 = t1[0]*u[0] + t1[1]*u[1] + t1[2]*u[2];
    let v2 = t2[0]*v[0] + t2[1]*v[1] + t2[2]*v[2];
    let w2 = t3[0]*w[0] + t3[1]*w[1] + t3[2]*w[2];

    let du = Math.abs(u2 - u[1]);
    let dv = Math.abs(v2 - v[1]);
    let dw = Math.abs(w2 - w[1]);

    u[0] = u2 - du;
    v[0] = v2 - dv;
    w[0] = w2 - dw;

    u[1] = u2;
    v[1] = v2;
    w[1] = w2;

    u[2] = u2 + du;
    v[2] = v2 + dv;
    w[2] = w2 + dw;

    lreport("mindis:", (mindis**0.5).toFixed(3), u2, v2, w2);
  }

  uvw.loadXYZ(u[1], v[1], w[1]);

  //console.log("uvw", uvw);

  //return uvw;

  return trilinear_co2(p, boxverts, uvw);
}

//newton-raphson
export function trilinear_co2(p, boxverts, uvw) {
  //let uvw = tril_co_rets.next();
  let grad = tril_co_tmps.next();

  //uvw[0] = uvw[1] = uvw[2] = 0.5;

  let df = 0.00001;

  let mat = tril_mat_1;
  let m = mat.$matrix;
  let mat2 = tril_mat_2;

  let r1 = tril_co_tmps.next();

  for (let step = 0; step < 55; step++) {
    //let r1 = trilinear_v3(uvw, boxverts).vectorDistance(p);
    let totg = 0;

    for (let i = 0; i < 3; i++) {
      let axis_error = 0.0;

      if (uvw[i] < 0) {
        axis_error = -uvw[i];
      } else if (uvw[i] > 1.0) {
        axis_error = uvw[i] - 1.0;
      }
      //r1[i] = trilinear_v3(uvw, boxverts)[i] - p[i];
      r1[i] = trilinear_v3(uvw, boxverts).vectorDistance(p) + 10.0*axis_error;

      let orig = uvw[i];

      uvw[i] += df;
      //let r2 = trilinear_v3(uvw, boxverts)[i] - p[i];

      if (uvw[i] < 0) {
        axis_error = -uvw[i];
      } else if (uvw[i] > 1.0) {
        axis_error = uvw[i] - 1.0;
      } else {
        axis_error = 0.0;
      }
      let r2 = trilinear_v3(uvw, boxverts).vectorDistance(p) + 10.0*axis_error;
      uvw[i] = orig;

      grad[i] = (r2 - r1[i])/df;
      totg += grad[i]**2;
    }

    if (totg === 0.0) {
      break;
    }

    let err = trilinear_v3(uvw, boxverts).vectorDistance(p);

    if (1) {
      //grad.normalize();
      uvw.addFac(grad, -err/totg*0.85);
    } else {
      mat.makeIdentity();
      m.m11 = grad[0];
      m.m12 = grad[1];
      m.m13 = grad[2];
      m.m22 = m.m33 = m.m44 = 0.0;

      mat.transpose();
      mat2.load(mat).transpose();

      //right-indepdenent pseudo inverse
      //mat.multiply(mat2).invert();
      //mat.preMultiply(mat2);

      //left-independent
      mat.preMultiply(mat2).invert();
      mat.multiply(mat2);

      grad.load(r1);
      grad.multVecMatrix(mat);
      uvw.addFac(grad, -1.0);
    }

    lreport("error:", err.toFixed(3), uvw);

    if (r1.dot(r1)**0.5 < 0.0001) {
      break;
    }
  }

  lreport("\n");

  return uvw;
}

let angle_tri_v3_rets = util.cachering.fromConstructor(Vector3, 32);
let angle_tri_v3_vs = util.cachering.fromConstructor(Vector3, 32);

export function tri_angles(v1, v2, v3) {
  let t1 = angle_tri_v3_vs.next().load(v1).sub(v2);
  let t2 = angle_tri_v3_vs.next().load(v3).sub(v2);
  let t3 = angle_tri_v3_vs.next().load(v2).sub(v3);

  t1.normalize();
  t2.normalize();
  t3.normalize();

  let th1 = Math.acos(t1.dot(t2)*0.99999);
  t2.negate();

  let th2 = Math.acos(t2.dot(t3)*0.99999);
  let th3 = Math.PI - (th1 + th2);

  let ret = angle_tri_v3_rets.next();

  ret[0] = th1;
  ret[1] = th2;
  ret[2] = th3;

  return ret;
}


