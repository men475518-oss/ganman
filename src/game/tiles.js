/* =========================================================================
   tiles.js  --  タイルマップ（地形）と当たり判定

   タイル文字の意味:
     '.' 空間        '#' 壁/床       '=' 飛び乗れる床（下から通り抜け可）
     'L' はしご      '^' トゲ（即死）'I' 氷（滑る床）  'B' 壊せるブロック
     'W' 水中(演出)  'D' ボス部屋の扉

   高速化のため、タイルの見た目は起動時に 16x16 のキャンバスへ焼いておき、
   毎フレームは drawImage するだけにしている。
   ========================================================================= */
G.tiles = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util;

  var T = 16;                 // 1タイルのピクセル数
  var level = null;           // 現在のマップ

  /* ---------------- 判定用のタイル分類 ---------------- */
  var SOLID   = { '#': 1, 'I': 1, 'B': 1, 'D': 1 };
  var ONEWAY  = { '=': 1 };
  var LADDER  = { 'L': 1 };
  var HAZARD  = { '^': 1 };
  var SLIP    = { 'I': 1 };

  function isSolidChar(c)  { return !!SOLID[c]; }
  function isOneWayChar(c) { return !!ONEWAY[c]; }
  function isLadderChar(c) { return !!LADDER[c]; }
  function isHazardChar(c) { return !!HAZARD[c]; }

  /* ======================================================================
     レベルの生成
     rows: 文字列の配列（1文字=1タイル）
     ====================================================================== */
  function makeLevel(rows, theme) {
    var h = rows.length, w = 0, y;
    for (y = 0; y < h; y++) if (rows[y].length > w) w = rows[y].length;
    // 右端が短い行はスペースで埋めて矩形にそろえる
    var grid = [];
    for (y = 0; y < h; y++) {
      var line = rows[y];
      if (line.length < w) line = line + new Array(w - line.length + 1).join('.');
      grid.push(line.split(''));
    }
    return {
      grid: grid, w: w, h: h,
      pxW: w * T, pxH: h * T,
      theme: theme,
      tileset: buildTileset(theme)
    };
  }

  function setLevel(l) { level = l; }
  function getLevel()  { return level; }

  function at(tx, ty) {
    if (!level) return '.';
    if (tx < 0 || tx >= level.w) return '#';      // 画面外の左右は壁扱い
    if (ty < 0) return '.';                        // 上は抜けられる
    if (ty >= level.h) return '.';                 // 下は落下death判定に任せる
    return level.grid[ty][tx];
  }
  function setAt(tx, ty, ch) {
    if (!level || tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return;
    level.grid[ty][tx] = ch;
  }

  function solidAtPx(px, py) { return isSolidChar(at(Math.floor(px / T), Math.floor(py / T))); }

  /* 矩形が固体タイルに重なっているか */
  function boxSolid(x, y, w, h) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
    var y0 = Math.floor(y / T), y1 = Math.floor((y + h - 1) / T);
    for (var ty = y0; ty <= y1; ty++)
      for (var tx = x0; tx <= x1; tx++)
        if (isSolidChar(at(tx, ty))) return true;
    return false;
  }

  /* 矩形が指定分類のタイルに重なっているか */
  function boxHas(x, y, w, h, testFn) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
    var y0 = Math.floor(y / T), y1 = Math.floor((y + h - 1) / T);
    for (var ty = y0; ty <= y1; ty++)
      for (var tx = x0; tx <= x1; tx++)
        if (testFn(at(tx, ty))) return true;
    return false;
  }
  function boxLadder(x, y, w, h) { return boxHas(x, y, w, h, isLadderChar); }
  function boxHazard(x, y, w, h) { return boxHas(x, y, w, h, isHazardChar); }
  function boxSlippery(x, y, w, h) { return boxHas(x, y, w, h, function (c) { return !!SLIP[c]; }); }

  /* ======================================================================
     エンティティの移動（X と Y を分けて解決する定番方式）
     ent は { x, y, w, h, vx, vy } を持つ。x,y は左上。
     ====================================================================== */
  function moveX(e, dx) {
    if (dx === 0) return 0;
    e.x += dx;
    if (!boxSolid(e.x, e.y, e.w, e.h)) return 0;
    // めり込んだのでタイル境界へ押し戻す
    if (dx > 0) e.x = Math.floor((e.x + e.w) / T) * T - e.w - 0.001;
    else        e.x = (Math.floor(e.x / T) + 1) * T + 0.001;
    e.vx = 0;
    return dx > 0 ? 1 : -1;   // 壁に当たった向きを返す
  }

  /* moveY は「飛び乗れる床」も見る。
     下向きに動いていて、直前の足元が床の上にあった時だけ着地する。 */
  function moveY(e, dy) {
    if (dy === 0) return 0;
    var prevBottom = e.y + e.h;
    e.y += dy;

    if (boxSolid(e.x, e.y, e.w, e.h)) {
      if (dy > 0) { e.y = Math.floor((e.y + e.h) / T) * T - e.h - 0.001; e.vy = 0; return 1; }
      else        { e.y = (Math.floor(e.y / T) + 1) * T + 0.001;         e.vy = 0; return -1; }
    }

    // --- 飛び乗れる床 / はしごの一番上 ---
    if (dy > 0 && !e.dropThrough) {
      var y1 = Math.floor((e.y + e.h - 1) / T);
      var x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 1) / T);
      for (var tx = x0; tx <= x1; tx++) {
        var c = at(tx, y1);
        var isTop = isOneWayChar(c) || (isLadderChar(c) && !isLadderChar(at(tx, y1 - 1)) && e.canStandLadderTop !== false);
        if (isTop) {
          var top = y1 * T;
          if (prevBottom <= top + 1) {   // 直前は床より上にいた＝乗れる
            e.y = top - e.h - 0.001; e.vy = 0; return 1;
          }
        }
      }
    }
    return 0;
  }

  // 足元が地面か（1px下にずらして判定）
  function onGround(e) {
    if (boxSolid(e.x, e.y + 1, e.w, e.h)) return true;
    var y1 = Math.floor((e.y + e.h) / T);
    var x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 1) / T);
    for (var tx = x0; tx <= x1; tx++) {
      var c = at(tx, y1);
      if (isOneWayChar(c) || (isLadderChar(c) && !isLadderChar(at(tx, y1 - 1)))) {
        if (Math.abs((e.y + e.h) - y1 * T) < 2) return true;
      }
    }
    return false;
  }

  /* ======================================================================
     タイルの見た目を焼く
     theme = { solid, solidLo, solidHi, edge, deco, ladder, spike, ice, brk }
     ====================================================================== */
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  function newTile() {
    var cv = document.createElement('canvas');
    cv.width = T; cv.height = T;
    return cv;
  }

  function bakeSolid(theme, topEdge) {
    var cv = newTile(), c = cv.getContext('2d');
    // ベース
    px(c, 0, 0, T, T, theme.solid);
    // レンガ模様（上下2段の互い違い）
    px(c, 0, 0, T, 1, theme.solidHi);
    px(c, 0, T - 1, T, 1, theme.solidLo);
    px(c, 0, 7, T, 1, theme.solidLo);
    px(c, 0, 8, T, 1, theme.solidHi);
    px(c, 7, 0, 1, 7, theme.solidLo);
    px(c, 8, 0, 1, 7, theme.solidHi);
    px(c, 15, 9, 1, 7, theme.solidLo);
    px(c, 0, 9, 1, 7, theme.solidHi);
    // 小さなリベット（メカ感）
    px(c, 3, 3, 1, 1, theme.deco);
    px(c, 12, 12, 1, 1, theme.deco);
    if (topEdge) {
      px(c, 0, 0, T, 2, theme.edge);
      px(c, 0, 2, T, 1, theme.solidHi);
    }
    return cv;
  }

  function bakeOneWay(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, 2, theme.edge);
    px(c, 0, 2, T, 3, theme.solid);
    px(c, 0, 5, T, 1, theme.solidLo);
    px(c, 1, 2, 1, 3, theme.solidHi);
    px(c, T - 2, 2, 1, 3, theme.solidLo);
    return cv;
  }

  function bakeLadder(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 2, 0, 3, T, theme.ladder);
    px(c, T - 5, 0, 3, T, theme.ladder);
    px(c, 2, 1, 1, T - 2, '#FCFCFC');
    px(c, T - 5, 1, 1, T - 2, '#FCFCFC');
    px(c, 2, 4, T - 4, 3, theme.ladder);
    px(c, 2, 4, T - 4, 1, '#FCFCFC');
    px(c, 2, 12, T - 4, 3, theme.ladder);
    px(c, 2, 12, T - 4, 1, '#FCFCFC');
    return cv;
  }

  function bakeSpike(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    // 三角のトゲを4本
    for (var i = 0; i < 4; i++) {
      var bx = i * 4;
      for (var y = 0; y < 8; y++) {
        var wdt = Math.max(1, Math.round((y + 1) / 2));
        px(c, bx + 2 - Math.floor(wdt / 2), T - 8 + (7 - y) + 0, wdt, 1, theme.spike);
      }
    }
    px(c, 0, T - 4, T, 4, theme.spikeBase || '#5C5C5C');
    px(c, 0, T - 4, T, 1, '#BCBCBC');
    // 先端のハイライト
    for (i = 0; i < 4; i++) px(c, i * 4 + 2, 1, 1, 2, '#FCFCFC');
    return cv;
  }

  function bakeIce(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, theme.ice || '#3CBCFC');
    px(c, 0, 0, T, 2, '#BCE8FC');
    px(c, 0, T - 1, T, 1, '#0058F8');
    px(c, 2, 4, 5, 1, '#FCFCFC');
    px(c, 9, 9, 4, 1, '#FCFCFC');
    px(c, 4, 11, 3, 1, '#BCE8FC');
    return cv;
  }

  function bakeBreak(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, theme.brk || '#8C4A20');
    px(c, 0, 0, T, 1, '#D8A860');
    px(c, 0, T - 1, T, 1, '#5C2A10');
    px(c, 0, 0, 1, T, '#D8A860');
    px(c, T - 1, 0, 1, T, '#5C2A10');
    // ひび
    px(c, 5, 3, 1, 4, '#5C2A10'); px(c, 6, 7, 1, 3, '#5C2A10');
    px(c, 10, 2, 1, 3, '#5C2A10'); px(c, 9, 10, 1, 4, '#5C2A10');
    return cv;
  }

  function bakeDoor(theme) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, '#5C5C5C');
    px(c, 0, 0, 3, T, '#BCBCBC');
    px(c, T - 3, 0, 3, T, '#2C2C2C');
    px(c, 3, 0, T - 6, 2, '#FCFCFC');
    px(c, 3, T - 2, T - 6, 2, '#2C2C2C');
    px(c, 4, 5, T - 8, 6, theme.edge || '#00E8D8');
    return cv;
  }

  function buildTileset(theme) {
    return {
      '#':  bakeSolid(theme, false),
      '#T': bakeSolid(theme, true),
      '=':  bakeOneWay(theme),
      'L':  bakeLadder(theme),
      '^':  bakeSpike(theme),
      'I':  bakeIce(theme),
      'B':  bakeBreak(theme),
      'D':  bakeDoor(theme)
    };
  }

  /* ======================================================================
     描画：カメラに映る範囲だけ描く
     ====================================================================== */
  function draw(camX, camY) {
    if (!level) return;
    var ctx = gfx.ctx, ts = level.tileset;
    var x0 = Math.max(0, Math.floor(camX / T));
    var x1 = Math.min(level.w - 1, Math.floor((camX + gfx.W) / T));
    var y0 = Math.max(0, Math.floor(camY / T));
    var y1 = Math.min(level.h - 1, Math.floor((camY + gfx.H) / T));

    for (var ty = y0; ty <= y1; ty++) {
      var row = level.grid[ty];
      for (var tx = x0; tx <= x1; tx++) {
        var c = row[tx];
        if (c === '.' || c === ' ') continue;
        var img;
        if (c === '#') {
          // 上に何も無い床は「縁取り」バージョンにして立体感を出す
          img = isSolidChar(at(tx, ty - 1)) ? ts['#'] : ts['#T'];
        } else {
          img = ts[c];
        }
        if (img) ctx.drawImage(img, Math.round(tx * T - camX), Math.round(ty * T - camY));
      }
    }
  }

  return {
    T: T,
    makeLevel: makeLevel, setLevel: setLevel, getLevel: getLevel,
    at: at, setAt: setAt,
    isSolidChar: isSolidChar, isLadderChar: isLadderChar, isHazardChar: isHazardChar,
    boxSolid: boxSolid, boxLadder: boxLadder, boxHazard: boxHazard, boxSlippery: boxSlippery,
    solidAtPx: solidAtPx,
    moveX: moveX, moveY: moveY, onGround: onGround,
    draw: draw
  };
})();
