/* =========================================================================
   tiles.js  --  タイルマップ（地形）と当たり判定

   タイル文字の意味:
     '.' 空間        '#' 壁/床       '=' 飛び乗れる床（下から通り抜け可）
     'L' はしご      '^' トゲ（即死）'I' 氷（滑る床）  'B' 壊せるブロック
     'D' ボス部屋の扉
     --- ここから時間で変化するギミック ---
     '<' '>' ベルトコンベア（乗ると流される）
     'o' 'p' 明滅ブロック（交互に出たり消えたりする）
     'c'     崩れる床（乗ってしばらくすると落ちる。時間が経つと復活）
     '~'     水（重力が弱まり、ジャンプが高くなる）

   当たり判定は「文字」ではなく solidAt(tx,ty) で判定する。
   明滅ブロックや崩れる床は同じ文字でも時刻によって固体だったり
   そうでなかったりするため、時間を見て答える必要があるからだ。

   高速化のため、タイルの見た目は起動時に 16x16 のキャンバスへ焼いておき、
   毎フレームは drawImage するだけにしている。
   ========================================================================= */
G.tiles = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util;

  var T = 16;                 // 1タイルのピクセル数
  var level = null;           // 現在のマップ
  var clock = 0;              // ギミック用の時計（毎フレーム進める）
  var crumbles = {};          // "tx,ty" -> 崩れ進行度

  /* ---------------- 判定用のタイル分類 ---------------- */
  var STATIC_SOLID = { '#': 1, 'I': 1, 'B': 1, 'D': 1, '<': 1, '>': 1 };
  var ONEWAY  = { '=': 1 };
  var LADDER  = { 'L': 1 };
  var HAZARD  = { '^': 1 };
  var SLIP    = { 'I': 1 };
  var WATER   = { '~': 1 };
  var BLINK   = { 'o': 0, 'p': 1 };       // 文字 -> グループ番号
  var CONVEY  = { '<': -1, '>': 1 };      // 文字 -> 流れる向き

  /* --- 明滅ブロックの周期 --- */
  var BLINK_CYCLE = 150;      // 1グループが出ている時間（フレーム）
  var BLINK_WARN  = 40;       // 消える前に点滅して知らせる時間

  /* --- 崩れる床のタイミング --- */
  var CRUMBLE_HOLD   = 26;    // 乗ってから崩れ始めるまで
  var CRUMBLE_GONE   = 150;   // 崩れてから復活するまで

  function isSolidChar(c)  { return !!STATIC_SOLID[c] || c === 'o' || c === 'p' || c === 'c'; }
  function isOneWayChar(c) { return !!ONEWAY[c]; }
  function isLadderChar(c) { return !!LADDER[c]; }
  function isHazardChar(c) { return !!HAZARD[c]; }
  function isWaterChar(c)  { return !!WATER[c]; }

  /* 明滅ブロックが今その場にあるか */
  function blinkOn(group) {
    var phase = Math.floor(clock / BLINK_CYCLE) % 2;
    return phase === group;
  }
  // 消える直前かどうか（描画で点滅させて予告する）
  function blinkWarning(group) {
    if (!blinkOn(group)) return false;
    return (BLINK_CYCLE - (clock % BLINK_CYCLE)) < BLINK_WARN;
  }

  function crumbleKey(tx, ty) { return tx + ',' + ty; }
  function crumbleState(tx, ty) { return crumbles[crumbleKey(tx, ty)]; }

  /* ======================================================================
     いま固体か？（すべての当たり判定はここを通る）
     ====================================================================== */
  function solidAt(tx, ty) {
    if (tx < 0 || tx >= level.w) return true;    // 左右の画面外は壁
    if (ty < 0 || ty >= level.h) return false;
    var c = level.grid[ty][tx];
    if (STATIC_SOLID[c]) return true;
    if (c === 'o' || c === 'p') return blinkOn(BLINK[c]);
    if (c === 'c') {
      var st = crumbleState(tx, ty);
      return !st || st.t < CRUMBLE_HOLD;         // 崩れ落ちるまでは乗れる
    }
    return false;
  }

  /* ======================================================================
     レベルの生成
     ====================================================================== */
  function makeLevel(rows, theme) {
    var h = rows.length, w = 0, y;
    for (y = 0; y < h; y++) if (rows[y].length > w) w = rows[y].length;
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

  function setLevel(l) {
    level = l;
    clock = 0;
    crumbles = {};
  }
  function getLevel()  { return level; }

  // ステージ側から毎フレーム呼ぶ。ギミックの時間を進める
  function tick() {
    clock++;
    for (var k in crumbles) {
      if (!crumbles.hasOwnProperty(k)) continue;
      var st = crumbles[k];
      st.t++;
      if (st.t > CRUMBLE_HOLD + CRUMBLE_GONE) delete crumbles[k];
    }
  }
  function getClock() { return clock; }

  function at(tx, ty) {
    if (!level) return '.';
    if (tx < 0 || tx >= level.w) return '#';
    if (ty < 0) return '.';
    if (ty >= level.h) return '.';
    return level.grid[ty][tx];
  }
  function setAt(tx, ty, ch) {
    if (!level || tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return;
    level.grid[ty][tx] = ch;
  }

  function solidAtPx(px, py) { return solidAt(Math.floor(px / T), Math.floor(py / T)); }

  /* 矩形が固体タイルに重なっているか */
  function boxSolid(x, y, w, h) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
    var y0 = Math.floor(y / T), y1 = Math.floor((y + h - 1) / T);
    for (var ty = y0; ty <= y1; ty++)
      for (var tx = x0; tx <= x1; tx++)
        if (solidAt(tx, ty)) return true;
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
  function boxWater(x, y, w, h) { return boxHas(x, y, w, h, isWaterChar); }

  /* 足元のベルトコンベアの向き（-1 / 0 / 1）を返す */
  function conveyorAt(x, y, w) {
    var ty = Math.floor(y / T);
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
    for (var tx = x0; tx <= x1; tx++) {
      var d = CONVEY[at(tx, ty)];
      if (d) return d;
    }
    return 0;
  }

  /* 足元の崩れる床に「乗った」ことを伝える */
  function crumbleTouch(x, y, w) {
    var ty = Math.floor(y / T);
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
    for (var tx = x0; tx <= x1; tx++) {
      if (at(tx, ty) !== 'c') continue;
      var k = crumbleKey(tx, ty);
      if (!crumbles[k]) {
        crumbles[k] = { t: 0, tx: tx, ty: ty };
        G.audio.sfx.blip();
      }
    }
  }

  /* ======================================================================
     エンティティの移動（X と Y を分けて解決する定番方式）
     ====================================================================== */
  function moveX(e, dx) {
    if (dx === 0) return 0;
    e.x += dx;
    if (!boxSolid(e.x, e.y, e.w, e.h)) return 0;
    if (dx > 0) e.x = Math.floor((e.x + e.w) / T) * T - e.w - 0.001;
    else        e.x = (Math.floor(e.x / T) + 1) * T + 0.001;
    e.vx = 0;
    return dx > 0 ? 1 : -1;
  }

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
          if (prevBottom <= top + 1) {
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

  /* めり込み解除：明滅ブロックが体の中に出現した時などの保険。
     上へ少しずつ逃がして、それでも駄目なら下へ逃がす。            */
  function unstick(e, maxPush) {
    maxPush = maxPush || 26;
    if (!boxSolid(e.x, e.y, e.w, e.h)) return false;
    for (var d = 1; d <= maxPush; d++) {
      if (!boxSolid(e.x, e.y - d, e.w, e.h)) { e.y -= d; return true; }
      if (!boxSolid(e.x, e.y + d, e.w, e.h)) { e.y += d; return true; }
    }
    return false;
  }

  /* ======================================================================
     タイルの見た目を焼く
     ====================================================================== */
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  function newTile() {
    var cv = document.createElement('canvas');
    cv.width = T; cv.height = T;
    return cv;
  }

  function bakeSolid(theme, topEdge) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, theme.solid);
    px(c, 0, 0, T, 1, theme.solidHi);
    px(c, 0, T - 1, T, 1, theme.solidLo);
    px(c, 0, 7, T, 1, theme.solidLo);
    px(c, 0, 8, T, 1, theme.solidHi);
    px(c, 7, 0, 1, 7, theme.solidLo);
    px(c, 8, 0, 1, 7, theme.solidHi);
    px(c, 15, 9, 1, 7, theme.solidLo);
    px(c, 0, 9, 1, 7, theme.solidHi);
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
    for (var i = 0; i < 4; i++) {
      var bx = i * 4;
      for (var y = 0; y < 8; y++) {
        var wdt = Math.max(1, Math.round((y + 1) / 2));
        px(c, bx + 2 - Math.floor(wdt / 2), T - 8 + (7 - y), wdt, 1, theme.spike);
      }
    }
    px(c, 0, T - 4, T, 4, theme.spikeBase || '#5C5C5C');
    px(c, 0, T - 4, T, 1, '#BCBCBC');
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

  /* --- ベルトコンベア：矢印の向きで流れる方向が分かる --- */
  function bakeConveyor(theme, dir, frame) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, '#3C3C4C');
    px(c, 0, 0, T, 3, '#7C7C8C');
    px(c, 0, T - 3, T, 3, '#7C7C8C');
    px(c, 0, 3, T, 1, '#1C1C28');
    // 動いて見えるよう、フレームごとに矢印をずらす
    for (var i = -1; i < 3; i++) {
      var x = ((i * 8) + frame * 4 + 16) % 16;
      for (var k = 0; k < 4; k++) {
        var xx = dir > 0 ? x + k : x + 3 - k;
        px(c, xx, 6 + k, 1, 1, theme.edge);
        px(c, xx, 12 - k, 1, 1, theme.edge);
      }
    }
    px(c, 0, 0, T, 1, '#BCBCC8');
    return cv;
  }

  /* --- 明滅ブロック：出ているとき／消えているときの2種 --- */
  function bakeBlink(theme, on) {
    var cv = newTile(), c = cv.getContext('2d');
    if (on) {
      px(c, 0, 0, T, T, '#101018');
      px(c, 1, 1, T - 2, T - 2, theme.edge);
      px(c, 2, 2, T - 4, 3, '#FCFCFC');
      px(c, 2, T - 5, T - 4, 2, '#101018');
      px(c, 6, 6, 4, 4, '#FCFCFC');
    } else {
      // 消えている間は輪郭だけ残して「ここに出る」と伝える
      for (var i = 0; i < T; i += 4) {
        px(c, i, 0, 2, 1, theme.edge);
        px(c, i, T - 1, 2, 1, theme.edge);
        px(c, 0, i, 1, 2, theme.edge);
        px(c, T - 1, i, 1, 2, theme.edge);
      }
    }
    return cv;
  }

  /* --- 崩れる床：ひび割れの進行を3段階で --- */
  function bakeCrumble(theme, stage) {
    var cv = newTile(), c = cv.getContext('2d');
    px(c, 0, 0, T, T, theme.solid);
    px(c, 0, 0, T, 2, theme.edge);
    px(c, 0, T - 1, T, 1, theme.solidLo);
    if (stage >= 1) {
      px(c, 5, 2, 1, 6, '#101018'); px(c, 6, 8, 1, 5, '#101018');
      px(c, 11, 3, 1, 5, '#101018');
    }
    if (stage >= 2) {
      px(c, 2, 6, 3, 1, '#101018'); px(c, 9, 9, 5, 1, '#101018');
      px(c, 12, 10, 1, 5, '#101018'); px(c, 3, 11, 1, 4, '#101018');
    }
    return cv;
  }

  /* --- 水：半透明の青。上端は水面の線 --- */
  function bakeWater(theme, surface) {
    var cv = newTile(), c = cv.getContext('2d');
    c.globalAlpha = 0.42;
    px(c, 0, 0, T, T, '#0058F8');
    c.globalAlpha = 0.25;
    px(c, 0, 0, T, 4, '#3CBCFC');
    c.globalAlpha = 1;
    if (surface) {
      px(c, 0, 0, T, 1, '#BCE8FC');
      px(c, 2, 2, 4, 1, '#FCFCFC');
      px(c, 10, 3, 3, 1, '#BCE8FC');
    }
    return cv;
  }

  function buildTileset(theme) {
    var ts = {
      '#':  bakeSolid(theme, false),
      '#T': bakeSolid(theme, true),
      '=':  bakeOneWay(theme),
      'L':  bakeLadder(theme),
      '^':  bakeSpike(theme),
      'I':  bakeIce(theme),
      'B':  bakeBreak(theme),
      'D':  bakeDoor(theme),
      'oOn': bakeBlink(theme, true),
      'oOff': bakeBlink(theme, false),
      'cA': bakeCrumble(theme, 0),
      'cB': bakeCrumble(theme, 1),
      'cC': bakeCrumble(theme, 2),
      '~':  bakeWater(theme, false),
      '~S': bakeWater(theme, true)
    };
    // コンベアはアニメーションするので4コマ焼く
    ts.convL = []; ts.convR = [];
    for (var f = 0; f < 4; f++) {
      ts.convL.push(bakeConveyor(theme, -1, f));
      ts.convR.push(bakeConveyor(theme, 1, f));
    }
    return ts;
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
    var convFrame = Math.floor(clock / 5) % 4;

    for (var ty = y0; ty <= y1; ty++) {
      var row = level.grid[ty];
      for (var tx = x0; tx <= x1; tx++) {
        var c = row[tx];
        if (c === '.' || c === ' ') continue;
        var img = null, alpha = 1;

        if (c === '#') {
          img = solidAt(tx, ty - 1) ? ts['#'] : ts['#T'];
        } else if (c === '<') {
          img = ts.convL[(convFrame + tx) % 4];
        } else if (c === '>') {
          img = ts.convR[(convFrame + tx) % 4];
        } else if (c === 'o' || c === 'p') {
          var g = BLINK[c];
          if (blinkOn(g)) {
            img = ts.oOn;
            // 消える直前は点滅させて予告する
            if (blinkWarning(g) && Math.floor(clock / 4) % 2 === 0) alpha = 0.35;
          } else {
            img = ts.oOff;
          }
        } else if (c === 'c') {
          var cs = crumbleState(tx, ty);
          if (!cs) img = ts.cA;
          else if (cs.t < CRUMBLE_HOLD * 0.5) img = ts.cB;
          else if (cs.t < CRUMBLE_HOLD) img = ts.cC;
          else img = null;                    // 崩れて消えている
        } else if (c === '~') {
          img = (at(tx, ty - 1) === '~') ? ts['~'] : ts['~S'];
        } else {
          img = ts[c];
        }

        if (!img) continue;
        if (alpha !== 1) {
          ctx.save(); ctx.globalAlpha = alpha;
          ctx.drawImage(img, Math.round(tx * T - camX), Math.round(ty * T - camY));
          ctx.restore();
        } else {
          ctx.drawImage(img, Math.round(tx * T - camX), Math.round(ty * T - camY));
        }
      }
    }
  }

  return {
    T: T,
    makeLevel: makeLevel, setLevel: setLevel, getLevel: getLevel,
    tick: tick, getClock: getClock,
    at: at, setAt: setAt, solidAt: solidAt,
    isSolidChar: isSolidChar, isLadderChar: isLadderChar, isHazardChar: isHazardChar,
    isWaterChar: isWaterChar,
    boxSolid: boxSolid, boxLadder: boxLadder, boxHazard: boxHazard,
    boxSlippery: boxSlippery, boxWater: boxWater,
    conveyorAt: conveyorAt, crumbleTouch: crumbleTouch,
    solidAtPx: solidAtPx,
    moveX: moveX, moveY: moveY, onGround: onGround, unstick: unstick,
    draw: draw,
    BLINK_CYCLE: BLINK_CYCLE
  };
})();
