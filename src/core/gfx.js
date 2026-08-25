/* =========================================================================
   gfx.js  --  描画レイヤ
   ・仮想解像度キャンバス（縦224px固定、横は端末のアスペクトに合わせて可変）
   ・ドット絵フォント（5x7）
   ・文字列パレット方式のスプライト生成
   ドット感を保つため拡大は CSS の image-rendering:pixelated に任せる。
   バッキングストアは常に小さいのでスマホでも 60FPS が出しやすい。
   ========================================================================= */
G.gfx = (function () {
  'use strict';
  var U = G.util;

  var canvas = null, ctx = null;
  var api = {
    W: 320,          // 仮想解像度・横（可変）
    H: 224,          // 仮想解像度・縦（固定）
    MIN_W: 256,      // 狭すぎると敵が見えないので下限
    MAX_W: 400,      // 広すぎるとキャラが小さくなり原作の間合いも崩れるので上限
    scale: 1,        // CSS上の拡大率（タッチ座標の逆変換に使う）
    offX: 0, offY: 0 // 画面内でのキャンバス左上位置（同上）
  };

  /* ---------------- 共通パレット（ファミコン風の鮮やかな色） --------------- */
  api.PAL = {
    black:'#000000', dark:'#101820', gray:'#7C7C7C', lgray:'#BCBCBC', white:'#FCFCFC',
    blue:'#0058F8', lblue:'#3CBCFC', dblue:'#0000BC', cyan:'#00E8D8', navy:'#00107C',
    red:'#D82800', lred:'#F87858', orange:'#FC9838', yellow:'#F8D878', gold:'#FCE0A8',
    green:'#00A800', lgreen:'#B8F818', dgreen:'#006800',
    purple:'#6844FC', pink:'#F878F8', brown:'#8C4A20', tan:'#D8A860',
    skin:'#FCC8A8', energy:'#3CBCFC'
  };

  /* ======================================================================
     初期化とリサイズ
     ====================================================================== */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    api.ctx = ctx;
    api.canvas = canvas;
    resize();
    window.addEventListener('resize', resize, false);
    window.addEventListener('orientationchange', function () {
      // iOS は orientationchange 直後だとサイズが古いので少し待つ
      setTimeout(resize, 120);
      setTimeout(resize, 400);
    }, false);
    buildFont();
    return api;
  }

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;

    // 縦持ち判定（案内表示の切り替えだけ。ゲーム自体は縦でも動く）
    document.body.classList.toggle('portrait', vh > vw * 1.05);

    // 端末のアスペクトに合わせて「横に広い視界」を作る。
    // こうすると横持ちスマホで左右の黒帯がほぼ消える。
    var aspect = vw / vh;
    var w = Math.round(api.H * aspect / 2) * 2;   // 偶数に丸める
    api.W = U.clamp(w, api.MIN_W, api.MAX_W);

    if (canvas.width !== api.W)  canvas.width  = api.W;
    if (canvas.height !== api.H) canvas.height = api.H;

    // アスペクトを保ったまま画面いっぱいに拡大
    var s = Math.min(vw / api.W, vh / api.H);
    api.scale = s;
    var cw = Math.floor(api.W * s), ch = Math.floor(api.H * s);
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
    api.offX = (vw - cw) / 2;
    api.offY = (vh - ch) / 2;

    ctx.imageSmoothingEnabled = false;
  }

  /* ======================================================================
     基本描画プリミティブ（全部ピクセル整数にスナップする）
     ====================================================================== */
  function clear(color) {
    ctx.fillStyle = color || '#000';
    ctx.fillRect(0, 0, api.W, api.H);
  }
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  }
  function rectLine(x, y, w, h, color, t) {
    t = t || 1;
    rect(x, y, w, t, color);
    rect(x, y + h - t, w, t, color);
    rect(x, y, t, h, color);
    rect(x + w - t, y, t, h, color);
  }
  // 塗りつぶし円（ドット絵らしくスキャンラインで描く）
  function circle(cx, cy, r, color) {
    cx |= 0; cy |= 0;
    ctx.fillStyle = color;
    for (var dy = -r; dy <= r; dy++) {
      var dx = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
  }
  /* 小さな塗り円は毎回スキャンラインで描くと重いので、
     半径と色ごとに焼いたキャンバスを使い回す（スマホでの実効フレーム対策）。
     パーティクルのように大量に出るものはこちらを使う。            */
  var blobCache = {};
  function blob(cx, cy, r, color) {
    r = Math.max(1, Math.round(r));
    if (r > 14) { circle(cx, cy, r, color); return; }   // 大きいものは直接描く
    var key = r + '|' + color;
    var img = blobCache[key];
    if (!img) {
      var d = r * 2 + 1;
      img = document.createElement('canvas');
      img.width = d; img.height = d;
      var c = img.getContext('2d');
      c.fillStyle = color;
      for (var dy = -r; dy <= r; dy++) {
        var dx = Math.floor(Math.sqrt(r * r - dy * dy));
        c.fillRect(r - dx, r + dy, dx * 2 + 1, 1);
      }
      blobCache[key] = img;
    }
    ctx.drawImage(img, (cx | 0) - r, (cy | 0) - r);
  }

  function ring(cx, cy, r, color, t) {
    t = t || 1;
    cx |= 0; cy |= 0;
    ctx.fillStyle = color;
    var steps = Math.max(8, Math.floor(r * 6));
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2;
      ctx.fillRect((cx + Math.cos(a) * r) | 0, (cy + Math.sin(a) * r) | 0, t, t);
    }
  }
  function line(x1, y1, x2, y2, color, t) {
    t = t || 1;
    ctx.fillStyle = color;
    var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    var n = Math.max(dx, dy) | 0;
    if (n === 0) { ctx.fillRect(x1 | 0, y1 | 0, t, t); return; }
    for (var i = 0; i <= n; i++) {
      var p = i / n;
      ctx.fillRect((x1 + (x2 - x1) * p) | 0, (y1 + (y2 - y1) * p) | 0, t, t);
    }
  }

  /* ======================================================================
     ドット絵フォント（5x7）
     '#' が塗り、'.' が透明。白で焼いておき、色付きは都度キャッシュする。
     ====================================================================== */
  var FONT_W = 5, FONT_H = 7, FONT_GAP = 1;
  var GLYPHS = {
    'A':'.###.|#...#|#...#|#####|#...#|#...#|#...#',
    'B':'####.|#...#|#...#|####.|#...#|#...#|####.',
    'C':'.####|#....|#....|#....|#....|#....|.####',
    'D':'####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E':'#####|#....|#....|####.|#....|#....|#####',
    'F':'#####|#....|#....|####.|#....|#....|#....',
    'G':'.####|#....|#....|#..##|#...#|#...#|.####',
    'H':'#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I':'#####|..#..|..#..|..#..|..#..|..#..|#####',
    'J':'....#|....#|....#|....#|#...#|#...#|.###.',
    'K':'#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
    'L':'#....|#....|#....|#....|#....|#....|#####',
    'M':'#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
    'N':'#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    'O':'.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    'P':'####.|#...#|#...#|####.|#....|#....|#....',
    'Q':'.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
    'R':'####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S':'.####|#....|#....|.###.|....#|....#|####.',
    'T':'#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U':'#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    'V':'#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W':'#...#|#...#|#...#|#...#|#.#.#|##.##|#...#',
    'X':'#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y':'#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
    'Z':'#####|....#|...#.|..#..|.#...|#....|#####',
    '0':'.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
    '1':'..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2':'.###.|#...#|....#|...#.|..#..|.#...|#####',
    '3':'####.|....#|....#|.###.|....#|....#|####.',
    '4':'#..#.|#..#.|#..#.|#####|...#.|...#.|...#.',
    '5':'#####|#....|####.|....#|....#|#...#|.###.',
    '6':'..##.|.#...|#....|####.|#...#|#...#|.###.',
    '7':'#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8':'.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    '9':'.###.|#...#|#...#|.####|....#|...#.|.##..',
    ' ':'.....|.....|.....|.....|.....|.....|.....',
    '.':'.....|.....|.....|.....|.....|.##..|.##..',
    ',':'.....|.....|.....|.....|.##..|.##..|.#...',
    '!':'..#..|..#..|..#..|..#..|..#..|.....|..#..',
    '?':'.###.|#...#|....#|...#.|..#..|.....|..#..',
    ':':'.....|.##..|.##..|.....|.##..|.##..|.....',
    "'":'..#..|..#..|.....|.....|.....|.....|.....',
    '-':'.....|.....|.....|#####|.....|.....|.....',
    '_':'.....|.....|.....|.....|.....|.....|#####',
    '+':'.....|..#..|..#..|#####|..#..|..#..|.....',
    '/':'....#|...#.|...#.|..#..|.#...|.#...|#....',
    '(':'...#.|..#..|.#...|.#...|.#...|..#..|...#.',
    ')':'.#...|..#..|...#.|...#.|...#.|..#..|.#...',
    '<':'...#.|..#..|.#...|#....|.#...|..#..|...#.',
    '>':'.#...|..#..|...#.|....#|...#.|..#..|.#...',
    '=':'.....|.....|#####|.....|#####|.....|.....',
    '%':'##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
    '*':'.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
    '"':'.#.#.|.#.#.|.....|.....|.....|.....|.....',
    '#':'.#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....'
  };

  var fontAtlas = null;      // 白文字のアトラス
  var fontIndex = {};        // 文字 -> アトラス内のx
  var tintCache = {};        // 色 -> 着色済みアトラス

  function buildFont() {
    var keys = Object.keys(GLYPHS);
    var cv = document.createElement('canvas');
    cv.width = keys.length * FONT_W;
    cv.height = FONT_H;
    var c = cv.getContext('2d');
    c.fillStyle = '#FFFFFF';
    for (var i = 0; i < keys.length; i++) {
      var rows = GLYPHS[keys[i]].split('|');
      fontIndex[keys[i]] = i * FONT_W;
      for (var y = 0; y < rows.length; y++) {
        for (var x = 0; x < rows[y].length; x++) {
          if (rows[y][x] === '#') c.fillRect(i * FONT_W + x, y, 1, 1);
        }
      }
    }
    fontAtlas = cv;
    tintCache = {};
  }

  // 白アトラスを任意色に塗り替えたものを作ってキャッシュ
  function tinted(color) {
    if (tintCache[color]) return tintCache[color];
    var cv = document.createElement('canvas');
    cv.width = fontAtlas.width; cv.height = fontAtlas.height;
    var c = cv.getContext('2d');
    c.drawImage(fontAtlas, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    tintCache[color] = cv;
    return cv;
  }

  function textWidth(str, scale) {
    scale = scale || 1;
    return str.length * (FONT_W + FONT_GAP) * scale - FONT_GAP * scale;
  }

  /* text(文字列, x, y, オプション)
     opt = { color, scale, align:'left'|'center'|'right', shadow:色, outline:色 } */
  function text(str, x, y, opt) {
    opt = opt || {};
    str = String(str).toUpperCase();
    var scale = opt.scale || 1;
    var color = opt.color || api.PAL.white;
    var w = textWidth(str, scale);
    if (opt.align === 'center') x -= w / 2;
    else if (opt.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);

    if (opt.outline) drawStr(str, x, y, scale, opt.outline, true);
    else if (opt.shadow) drawStr(str, x + scale, y + scale, scale, opt.shadow, false);
    drawStr(str, x, y, scale, color, false);
    return w;
  }

  function drawStr(str, x, y, scale, color, outlineMode) {
    var atlas = tinted(color);
    var step = (FONT_W + FONT_GAP) * scale;
    for (var pass = 0; pass < (outlineMode ? 8 : 1); pass++) {
      // アウトラインは8方向にずらして描く（レトロなロゴ感が出る）
      var ox = 0, oy = 0;
      if (outlineMode) {
        var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
        ox = dirs[pass][0] * scale; oy = dirs[pass][1] * scale;
      }
      for (var i = 0; i < str.length; i++) {
        var ch = str[i];
        var sx = fontIndex[ch];
        if (sx === undefined) { sx = fontIndex[' ']; }
        if (ch === ' ') continue;
        ctx.drawImage(atlas, sx, 0, FONT_W, FONT_H,
                      x + i * step + ox, y + oy, FONT_W * scale, FONT_H * scale);
      }
    }
  }

  /* ======================================================================
     文字列パレット方式のスプライト生成
       makeSprite(['..##..','.####.'], {'#':'#FF0000'})
     '.' と ' ' は透明。生成物は <canvas> なので drawImage で高速に描ける。
     ====================================================================== */
  function makeSprite(rows, palette) {
    var h = rows.length, w = 0, i, x, y;
    for (i = 0; i < h; i++) if (rows[i].length > w) w = rows[i].length;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, w); cv.height = Math.max(1, h);
    var c = cv.getContext('2d');
    for (y = 0; y < h; y++) {
      for (x = 0; x < rows[y].length; x++) {
        var ch = rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        var col = palette[ch];
        if (!col) continue;
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  // 左右反転版を作って返す（毎フレーム transform するより速い）
  function flipSprite(src) {
    var cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    var c = cv.getContext('2d');
    c.translate(src.width, 0);
    c.scale(-1, 1);
    c.drawImage(src, 0, 0);
    return cv;
  }

  // 全体を単色に塗ったシルエット（点滅・被弾フラッシュ演出に使う）
  function silhouette(src, color) {
    var cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    var c = cv.getContext('2d');
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  function draw(img, x, y) { ctx.drawImage(img, Math.round(x), Math.round(y)); }

  /* ======================================================================
     画面演出のヘルパ
     ====================================================================== */
  // 全画面カラーフィル（フラッシュ・暗転用）
  function veil(color, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = U.clamp(alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, api.W, api.H);
    ctx.restore();
  }

  // 走査線（レトロなブラウン管っぽさ）
  function scanlines(alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 0.12 : alpha;
    ctx.fillStyle = '#000';
    for (var y = 0; y < api.H; y += 2) ctx.fillRect(0, y, api.W, 1);
    ctx.restore();
  }

  return {
    init: init, resize: resize,
    get W() { return api.W; }, get H() { return api.H; },
    get ctx() { return ctx; },
    get scale() { return api.scale; },
    get offX() { return api.offX; },
    get offY() { return api.offY; },
    PAL: api.PAL,
    clear: clear, rect: rect, rectLine: rectLine, circle: circle, blob: blob, ring: ring, line: line,
    text: text, textWidth: textWidth, FONT_H: FONT_H,
    makeSprite: makeSprite, flipSprite: flipSprite, silhouette: silhouette, draw: draw,
    veil: veil, scanlines: scanlines
  };
})();
