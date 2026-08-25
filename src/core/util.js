/* =========================================================================
   util.js  --  共通ユーティリティ
   ゲーム全体で使う数学ヘルパ・乱数・簡易オブジェクトプールなど。
   グローバル名前空間 G (GANMAN) にぶら下げていく方式。
   ========================================================================= */
var G = window.G || {};
window.G = G;

G.util = (function () {
  'use strict';

  /* ---- 基本の数学 ---- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function approach(cur, target, step) {
    // cur を target へ step ずつ近づける（行き過ぎない）
    if (cur < target) return Math.min(cur + step, target);
    if (cur > target) return Math.max(cur - step, target);
    return target;
  }

  /* ---- 乱数（シード固定できるので演出の再現性を取りたい時に便利） ---- */
  var _seed = 123456789;
  function seed(s) { _seed = s >>> 0 || 1; }
  function rnd() {
    // xorshift32：Math.random より軽く、毎フレーム大量に呼んでも安い
    _seed ^= _seed << 13; _seed >>>= 0;
    _seed ^= _seed >> 17;
    _seed ^= _seed << 5;  _seed >>>= 0;
    return _seed / 4294967296;
  }
  function rndRange(a, b) { return a + rnd() * (b - a); }
  function rndInt(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  /* ---- 矩形の重なり判定（当たり判定の基礎） ---- */
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }
  // エンティティ同士。各エンティティは hitbox() を持つ想定
  function hits(e1, e2) { return overlap(e1.hitbox(), e2.hitbox()); }

  /* ---- 角度・距離 ---- */
  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

  /* ---- イージング（演出用） ---- */
  var ease = {
    outQuad:  function (t) { return 1 - (1 - t) * (1 - t); },
    inQuad:   function (t) { return t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inCubic:  function (t) { return t * t * t; },
    outBack:  function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outBounce: function (t) {
      var n = 7.5625, d = 2.75;
      if (t < 1 / d)       return n * t * t;
      else if (t < 2 / d)  return n * (t -= 1.5 / d) * t + 0.75;
      else if (t < 2.5 / d)return n * (t -= 2.25 / d) * t + 0.9375;
      else                 return n * (t -= 2.625 / d) * t + 0.984375;
    },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };

  /* ---- 配列から死んだ要素を取り除く（毎フレーム呼ぶのでGC節約版） ---- */
  function sweep(arr) {
    var w = 0;
    for (var i = 0; i < arr.length; i++) {
      if (!arr[i].dead) arr[w++] = arr[i];
    }
    arr.length = w;
    return arr;
  }

  return {
    clamp: clamp, lerp: lerp, sign: sign, approach: approach,
    seed: seed, rnd: rnd, rndRange: rndRange, rndInt: rndInt, pick: pick,
    overlap: overlap, hits: hits, dist: dist, angleTo: angleTo,
    ease: ease, sweep: sweep
  };
})();
