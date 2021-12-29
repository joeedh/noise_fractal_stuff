#include <math.h>
#include <stdint.h>
#include <algorithm>

typedef double _simd2d __attribute__ ((vector_size (16)));

//extra space to align to 16-byte boundary for SIMD
double SLIDERS[30];
double UV[10];
double OUT[8];

extern "C" double *getSliderMem() {
    return SLIDERS;
}

extern "C" double *getUVMem() {
    return UV;
}

extern "C" double *getOutMem() {
    return OUT;
}

//typedef double Simd2D __attribute__ ((vector_size (16)));

struct Simd2D {
    _simd2d val;

    Simd2D(const _simd2d &v) {
        val = v;
    }

    Simd2D(const double a, const double b) {
        val[0] = a;
        val[1] = b;
    }

    Simd2D(const Simd2D &v) {
        val = v.val;
    }
    Simd2D(double v) {
        val[0] = val[1] = v;
    }
    Simd2D() {
    }

    Simd2D operator+(const Simd2D &b) const {
        return Simd2D(val + b.val);
    }

    Simd2D operator-(const Simd2D &b) const {
        return Simd2D(val - b.val);
    }
    Simd2D operator*(const Simd2D &b) const {
        return Simd2D(val * b.val);
    }
    Simd2D operator/(const Simd2D &b) const {
        return Simd2D(val / b.val);
    }
    Simd2D &operator+=(const Simd2D &b)  {
        val += b.val;
        return *this;
    }
    Simd2D &operator-=(const Simd2D &b)  {
        val -= b.val;
        return *this;
    }
    Simd2D &operator*=(const Simd2D &b)  {
        val *= b.val;
        return *this;
    }
    Simd2D &operator/=(const Simd2D &b)  {
        val /= b.val;
        return *this;
    }
    Simd2D operator>(const Simd2D &b) const {
        Simd2D c;

        c.val[0] = val[0] > b.val[0] ? 1.0 : 0.0;
        c.val[1] = val[1] > b.val[1] ? 1.0 : 0.0;

        return c;
    }
    Simd2D operator<(const Simd2D &b) const {
        Simd2D c;

        c.val[0] = val[0] < b.val[0] ? 1.0 : 0.0;
        c.val[1] = val[1] < b.val[1] ? 1.0 : 0.0;

        return c;
    }
    Simd2D operator-() const {
        return Simd2D(-val);
    }
};

Simd2D operator*(double d, const Simd2D &b) {
    return Simd2D(d) * b;
}
Simd2D operator/(double d, const Simd2D &b) {
    return Simd2D(d) / b;
}
Simd2D operator+(double d, const Simd2D &b) {
    return Simd2D(d) + b;
}
Simd2D operator-(double d, const Simd2D &b) {
    return Simd2D(d) - b;
}
Simd2D floor(const Simd2D &b) {
    return floor(b.val); //Simd2D(floor(b.val[0]), floor(b.val[1]));
}
Simd2D sqrt(const Simd2D &b) {
    return sqrt(b.val);
}
Simd2D fabs(const Simd2D &b) {
    return fabs(b.val);
}

template<class T>
struct Vec2 {
  T x, y;
  
  Vec2() : x(0), y(0) {
  }
  
  Vec2(T x, T y) : x(x), y(y) {
  }
  
  Vec2(const Vec2 &b) {
    x = b.x;
    y = b.y;
  }
  
  Vec2 &operator=(const Vec2 &b) {
    x = b.x;
    y = b.y;
    
    return *this;
  }
  
  Vec2 &operator+=(const Vec2 &b) {
    x += b.x;
    y += b.y;
    
    return *this;
  }
  
  Vec2 operator-() const {
    return Vec2(-x, -y);
  }
  
  Vec2 operator+(const Vec2 &b) const {
    return Vec2(x + b.x, y + b.y);
  }
  Vec2 operator-(const Vec2 &b) const {
    return Vec2(x - b.x, y - b.y);
  }
  Vec2 operator/(const Vec2 &b) const {
    return Vec2(x / b.x, y / b.y);
  }
  Vec2 operator*(const Vec2 &b) const {
    return Vec2(x * b.x, y * b.y);
  }

  Vec2 operator+(T b) const {
    return Vec2(x+b, y+b);
  }
  Vec2 operator-(T b) const {
    return Vec2(x-b, y-b);
  }
  Vec2 operator/(T b) const {
    return Vec2(x/b, y/b);
  }
  Vec2 operator*(T b) const {
    return Vec2(x*b, y*b);
  }
  
  T &operator[](int idx) {
    return idx ? y : x;
  }

  const T &operator[](int idx) const {
    return idx ? y : x;
  }
  
  T dot(const Vec2 &b) const {
    return x*b.x + y*b.y;
  }
  
  T length() const {
    return sqrt(x*x + y*y);
  }
  
  T normalize() {
    T l = length();
    
    //if (l > 0.000001) {
      l = 1.0 / l;
      x *= l;
      y *= l;
    //}
    
    return l;
  }
};

template<class T>
struct Mat2 {
  Vec2<T> rows[2];
  
  Mat2() {
    identity();
  }
  
  Mat2(const Mat2 &b) {
    rows[0] = b.rows[0];
    rows[1] = b.rows[1];
  }
  
  Mat2(const Vec2<T> &row1, const Vec2<T> &row2) {
    rows[0] = row1;
    rows[1] = row2;
  }
  
  Vec2<T> &operator[](int idx) {
    return rows[idx];
  }

  const Vec2<T> &operator[](int idx) const {
    return rows[idx];
  }
  
  Vec2<T> operator*(const Vec2<T> &b) const {
    Vec2<T> c;
    
    c.x = rows[0].x*b.x + rows[0].y*b.y;
    c.y = rows[1].x*b.x + rows[1].y*b.y;
    
    return c;
  }
  
  Mat2<T> operator*(const Mat2<T> &b) const {
    Mat2<T> c;
    
    auto r1 = rows[0];
    auto i1 = b[0];
    
    auto r2 = rows[1];
    auto i2 = b[1];

    auto r1x = r1.x, r1y = r1.y;
    auto r2x = r2.x, r2y = r2.y;
    auto i1x = i1.x, i1y = i1.y;
    auto i2x = i2.x, i2y = i2.y;

    c[0].x = i1x*r1x + i2x*r1y;
    c[0].y = i1y*r1x + i2y*r1y;

    c[1].x = i1x*r2x + i2x*r2y;
    c[1].y = i1y*r2x + i2y*r2y;

    return c;
  }

  
  void identity() {
    rows[0] = Vec2<T>(1.0, 0.0);
    rows[1] = Vec2<T>(0.0, 1.0);
  }
  
  T det() const {
    return rows[0].x*rows[1].y - rows[0].y*rows[1].x;
  }
};

template <class T>
Mat2<T> transpose(Mat2<T> mat) {
  Mat2<T> ret = mat;
  
  std::swap(ret.rows[0][1], ret.rows[1][0]);
  return ret;
}

template <class T>
Mat2<T> inverse(const Mat2<T> &mat) {
  Mat2<T> ret = mat;

  auto r1 = mat[0];
  auto r2 = mat[1];

  auto r1x = r1.x, r1y = r1.y;
  auto r2x = r2.x, r2y = r2.y;

  auto invDet = 1.0/(r1x*r2y - r1y*r2x);

  ret[0].x = r2y*invDet;
  ret[0].y = -r1y*invDet;
  ret[1].x = -r2x*invDet;
  ret[1].y = r1x*invDet;
          
  return ret;
}

template<class T>
T length(const Vec2<T> &vec) {
  return vec.length();
}

//using vec2 = Vec2<double>;
//using mat2 = Mat2<double>;

extern "C" float calc_stuff(float a) {
  return a*a*a;
}

template<class T>
T fract(T f) {
  return f - floor(f);
}

template<class T>
T tent(T f) {
  return 1.0 - fabs(fract(f) - 0.5)*2.0;
}

template<class T>
Vec2<T> cmul(Vec2<T> a, Vec2<T> b) {
    return Vec2<T>(
      a.x*b.x - a.y*b.y,
      a.x*b.y + b.x*a.y
    );
}

template<class T>
Vec2<T> fsample(Vec2<T> z, Vec2<T> p) {
    const double d = 1.0;

    //(z-1)(z+1)(z-p)
    Vec2<T> a = z - Vec2<T>(d, 0.0);
    Vec2<T> b = z + Vec2<T>(d, 0.0);
    Vec2<T> c = z - p;

    return cmul(cmul(a, b), c);
}


template<class T>
T newtonFractal_impl(T *_uv, double *SLIDERS, double toff, int steps) {
    using vec2 = Vec2<T>;
    using mat2 = Mat2<T>;

    vec2 seed;
    vec2 uv(_uv[0], _uv[1]);

    vec2 dr, di;
    T f = 0.0;
    T dist = 0.0;
    vec2 z;
    
    //vec2 startuv = uv;
    
    T tm = 0.0;
    T tm2 = 0.0;
    
    seed = uv;
    //seed = vec2(0.5, 0.4132432);
    
    tm = SLIDERS[1];
    //tm = pow(tm, 1.0/1.0);

    for (int i=0; i<steps; i++) {
        //double toff = sin(T*0.1);
        //toff = 0.75;
        z = cmul(uv, vec2(0.333333 + tm*0.5, 0.0 + tm)); //0.85*toff));
        
        vec2 a = fsample(z, seed);

#if 0 //finite differences
        T df = 0.0002;

        vec2 b = fsample(z+vec2(df, 0.0), seed);
        vec2 c = fsample(z+vec2(0.0, df), seed);
        
        dr = (b - a) / df;
        di = (c - a) / df;
#else //anayltical derivatives
        vec2 p = seed;
        T zx = z.x, zy = z.y;
        T px = p.x, py = p.y;
        
        /* heissan matrices
        on factor;
        off period;
        
        drx := -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        dry := -2.0*((py-zy-zy)*zx+(px-zx)*zy);
      
        dix := 2.0*((py-zy-zy)*zx+(px-zx)*zy);
        diy := -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        
        rxzx := df(drx, zx);
        rxzy := df(drx, zy);
        ryzx := df(dry, zx);
        ryzy := df(dry, zy);

        ixzx := df(dix, zx);
        ixzy := df(dix, zy);
        iyzx := df(diy, zx);
        iyzy := df(diy, zy);
        
        rxm := mat((rxzx*rxzx, rxzy*rxzx),
            (rxzy*rxzx, rxzy*rxzy));
        rym := mat((ryzx*ryzx, ryzy*ryzx),
            (ryzy*ryzx, ryzy*ryzy));
        ixm := mat((ixzx*ixzx, ixzy*ixzx),
            (ixzy*ixzx, ixzy*ixzy));
        iym := mat((iyzx*iyzx, iyzy*iyzx),
            (iyzy*iyzx, iyzy*iyzy));
        
        on fort;
        rxm;
        rym;
        ixm;
        iym;
        off fort;
        
        */
        dr.x = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
        dr.y = -2.0*((py-zy-zy)*zx+(px-zx)*zy);
      
        di.x = 2.0*((py-zy-zy)*zx+(px-zx)*zy);
        di.y = -(2.0*((px-zx)*zx-(py-zy)*zy)+zy*zy+1.0-zx*zx);
#endif

#if 1

 mat2 rxm = mat2( vec2(4.0*(px-3.0*zx)*(px-3.0*zx),-4.0*(px-3.0*zx)*(py-3.0*zy)),
                 vec2(-4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(py-3.0*zy)*(py-3.0*zy)));

 mat2 rym = mat2(vec2(4.0*(py-3.0*zy)*(py-3.0*zy), 4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(px-3.0*zx)*(px-3.0*zx)));

  mat2 ixm = mat2(vec2(4.0*(py-3.0*zy)*(py-3.0*zy), 4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(px-3.0*zx)*(px-3.0*zx)));

  mat2 iym = mat2(vec2(4.0*(px-3.0*zx)*(px-3.0*zx), -4.0*(px-3.0*zx)*(py-3.0*zy)),
                  vec2(-4.0*(px-3.0*zx)*(py-3.0*zy), 4.0*(py-3.0*zy)*(py-3.0*zy))); 
#endif
        mat2 m = mat2(dr, di);
        m = transpose(m);
        
        m = inverse(m);
        
        vec2 off = -(m * a);
        off += vec2(-off.y, off.x)*SLIDERS[10];

        dist += 2.0*length(off) / (SLIDERS[9] + length(iym*rxm * off));

        //dist += length(off)*0.01;

        dist += 2.0*length(off) / (SLIDERS[9] + length(iym*rxm * off));

        //dist += 0.12 / (0.1 + length(rym*off));
        
        //dist += (determinant(rxm) + determinant(rym) + determinant(ixm) + determinant(iym))*1000.0;
        //dist += determinant(rxm*rym*ixm*iym)*100000.0;
        //dist += (abs(off[0]) + abs(off[1]))*0.5;
        //dist += max(abs(off[0]), abs(off[1]));
        
        uv += off;
    }

    //return dist;
    T d1 = length(uv - vec2(-1.0, 0.0));
    T d2 = length(uv - vec2(1.0, 0.0));
    T d3 = length(uv - seed);
    
    //find closest root shade
    f = 1.0 + (0.75 - 1.0)*(d1 < d2);
    f += (0.5 - f)*(d3 < d2);
    //f = d3 < d2 && d3 < d1 ? 0.5 : f;

    //return f*0.2;
    T tfac = pow(1.0 - toff, 0.25);
    T dfract;
    //dfract = min(dist*0.0025, 1.0);
    dfract = tent(dist*0.004);
    f = sqrt(dfract)*0.5;
    //f = (dfract + f)*0.5;
    //f = sqrt(dfract*f)*0.5;
    
    //f = dfract;
    //f *= f;
    
    //f = pow(f * (1.0-dfract), 0.4);
    //f = mix(pow(dfract, 0.25), dfract, 0.5);
    //f = dfract*dfract*(3.0-2.0*dfract);
    
    //f = f*f*(3.0-2.0*f);
    //f = fract(length(fsample(z, uv)));    
    //f = fract(length(uv - startuv));
    
    return f;
}

extern "C" double newtonFractal(double *_uv, double *SLIDERS, double toff, int steps) {
    return newtonFractal_impl(_uv, SLIDERS, toff, steps);
}


extern "C" void newtonFractalSimd(double *out, Simd2D *_uv, double *SLIDERS, double toff, int steps) {
    Simd2D f = newtonFractal_impl(_uv, SLIDERS, toff, steps);

    out[0] = f.val[0];
    out[1] = f.val[1];
}

int main() {
  return 0;
}
