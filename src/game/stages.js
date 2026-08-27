/* =========================================================================
   stages.js  --  ステージのテーマと地形生成

   地形は「安全だと分かっているパターン」だけを左から並べて作る。
   ジャンプ可能距離から逆算した制限を守っているので、
   絶対に越えられない穴や登れない段差は生まれない。
     ジャンプ到達（実測）：高さ 48px(3.0タイル) / 距離 69px(4.3タイル)
     → 段差は最大2タイル、穴は最大3タイル、それ以上は足場を置く
   実際の到達性能より1タイルぶん余裕を持たせてあるので、
   スマホの仮想スティックでも端ギリギリを狙わずに越えられる。

   パターンを足したければ PATTERNS に関数を1つ書くだけ。
   ========================================================================= */
G.stages = (function () {
  'use strict';
  var U = G.util, gfx = G.gfx;

  var LW = 196;    // ステージの横幅（タイル数）
  var LH = 20;     // 縦（タイル数）= 320px。画面は224pxなので少し縦スクロールする
  var GY = 15;     // 基本の地面の高さ（この行から下が地面）
  var ARENA_W = 28;// ボス部屋の幅（タイル）＝448px。どんな画面幅でも収まる
  var T = 16;

  /* ======================================================================
     背景描画のための小道具
     ====================================================================== */
  // 座標から決まる擬似乱数（カメラが動いてもチラつかない）
  function hash(n) {
    n = (n << 13) ^ n;
    return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
  }

  function starfield(camX, camY, count, par, colors, size) {
    var W = gfx.W, H = gfx.H;
    for (var i = 0; i < count; i++) {
      var bx = hash(i * 3 + 1) * 2000;
      var by = hash(i * 3 + 2) * 400;
      var x = ((bx - camX * par) % (W + 40) + W + 40) % (W + 40) - 20;
      var y = (by % (H - 60));
      gfx.rect(x, y, size || 1, size || 1, colors[i % colors.length]);
    }
  }

  // 遠景のシルエット（山・ビル・岩など）
  function skyline(camX, par, baseY, colWidth, maxH, color, jag) {
    var W = gfx.W;
    var off = camX * par;
    var i0 = Math.floor(off / colWidth) - 1;
    var n = Math.ceil(W / colWidth) + 3;
    for (var i = 0; i < n; i++) {
      var idx = i0 + i;
      var h = 12 + hash(idx * 7 + jag) * maxH;
      var x = idx * colWidth - off;
      gfx.rect(x, baseY - h, colWidth - 1, h, color);
    }
  }

  /* ======================================================================
     6つのテーマ（配色と背景）
     ====================================================================== */
  var THEMES = {
    /* --- 電気ステージ：夜の発電所 --- */
    elec: {
      key: 'elec', name: 'ELEC MAN', bgm: 'st_elec', seed: 1001,
      sky: '#080820',
      solid: '#3C3C8C', solidHi: '#6868C8', solidLo: '#202050',
      edge: '#F8D878', deco: '#00E8D8', ladder: '#F8D878',
      spike: '#BCBCBC', spikeBase: '#3C3C8C', ice: '#3CBCFC', brk: '#5C5C9C',
      mix: ['met', 'turret', 'fly', 'met', 'turret'],
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        starfield(camX, camY, 46, 0.12, ['#FCFCFC', '#F8D878', '#3CBCFC']);
        skyline(camX, 0.28, gfx.H - 20, 26, 74, '#101038', 3);
        // 送電塔っぽい格子
        skyline(camX, 0.5, gfx.H - 14, 14, 40, '#181848', 11);
        // 時々走る稲光
        var f = Math.floor(t / 140);
        if ((t % 140) < 7 && hash(f) > 0.55) {
          gfx.veil('#F8D878', 0.13);
        }
        // 床際の電飾ライン
        for (var i = 0; i < gfx.W; i += 32) {
          var on = (Math.floor(t / 8) + i / 32) % 4 === 0;
          gfx.rect(i - (camX * 0.5) % 32, gfx.H - 16, 10, 2, on ? '#00E8D8' : '#104060');
        }
      }
    },

    /* --- 火炎ステージ：溶岩の洞窟 --- */
    fire: {
      key: 'fire', name: 'FIRE MAN', bgm: 'st_fire', seed: 2002,
      sky: '#200008',
      solid: '#8C2820', solidHi: '#C85838', solidLo: '#500810',
      edge: '#FC9838', deco: '#F8D878', ladder: '#FC9838',
      spike: '#FCE0A8', spikeBase: '#8C2820', ice: '#3CBCFC', brk: '#A04030',
      mix: ['met', 'hop', 'fly', 'turret', 'hop'],
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        // 奥の溶岩の照り返し（脈打つ）
        var pulse = 0.5 + 0.5 * Math.sin(t * 0.03);
        for (var y = 0; y < 6; y++) {
          gfx.ctx.save();
          gfx.ctx.globalAlpha = 0.1 + pulse * 0.06;
          gfx.rect(0, gfx.H - 40 + y * 7, gfx.W, 7, '#FC9838');
          gfx.ctx.restore();
        }
        skyline(camX, 0.22, gfx.H - 26, 30, 66, '#400810', 5);
        skyline(camX, 0.45, gfx.H - 12, 18, 42, '#601018', 17);
        // 上から舞い上がる火の粉
        for (var i = 0; i < 22; i++) {
          var sx = (hash(i * 5 + 3) * 1400 - camX * 0.35) % (gfx.W + 20);
          if (sx < -10) sx += gfx.W + 20;
          var sy = gfx.H - ((t * (0.5 + hash(i) * 0.9) + hash(i * 2) * 400) % (gfx.H + 40));
          gfx.rect(sx, sy, 2, 2, hash(i * 9) > 0.5 ? '#FC9838' : '#F8D878');
        }
      }
    },

    /* --- 氷ステージ：吹雪の山 --- */
    ice: {
      key: 'ice', name: 'ICE MAN', bgm: 'st_ice', seed: 3003,
      sky: '#103058',
      solid: '#4878A8', solidHi: '#88B8D8', solidLo: '#204058',
      edge: '#BCE8FC', deco: '#FCFCFC', ladder: '#BCE8FC',
      spike: '#FCFCFC', spikeBase: '#4878A8', ice: '#5CC8FC', brk: '#6890B8',
      mix: ['met', 'fly', 'hop', 'spike', 'fly'],
      iceFloor: 0.35,      // 床の35%を氷にする
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        // 遠くの雪山
        skyline(camX, 0.16, gfx.H - 30, 40, 80, '#1C4470', 2);
        skyline(camX, 0.34, gfx.H - 16, 24, 54, '#28588C', 9);
        // 降る雪（手前ほど速い）
        for (var L = 0; L < 2; L++) {
          var cnt = L === 0 ? 26 : 18;
          var sp = L === 0 ? 0.8 : 1.6;
          var par = L === 0 ? 0.2 : 0.45;
          for (var i = 0; i < cnt; i++) {
            var sx = (hash(i * 7 + L * 31) * 1600 - camX * par + Math.sin(t * 0.02 + i) * 8) % (gfx.W + 20);
            if (sx < -10) sx += gfx.W + 20;
            var sy = ((t * sp + hash(i * 3 + L) * 500) % (gfx.H + 20)) - 10;
            gfx.rect(sx, sy, L === 0 ? 1 : 2, L === 0 ? 1 : 2, L === 0 ? '#88B8D8' : '#FCFCFC');
          }
        }
      }
    },

    /* --- 爆弾ステージ：兵器工場 --- */
    bomb: {
      key: 'bomb', name: 'BOMB MAN', bgm: 'st_bomb', seed: 4004,
      sky: '#0C2010',
      solid: '#3C6C3C', solidHi: '#68A868', solidLo: '#1C3C1C',
      edge: '#B8F818', deco: '#F8D878', ladder: '#B8F818',
      spike: '#BCBCBC', spikeBase: '#3C6C3C', ice: '#3CBCFC', brk: '#5C8C4C',
      mix: ['met', 'turret', 'hop', 'fly', 'spike'],
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        skyline(camX, 0.2, gfx.H - 24, 34, 70, '#14301C', 4);
        // 工場のパイプと窓
        var off = camX * 0.42;
        for (var i = -1; i < gfx.W / 40 + 2; i++) {
          var bx = i * 40 - (off % 40);
          var bh = 30 + hash(Math.floor(off / 40) + i) * 50;
          gfx.rect(bx, gfx.H - 14 - bh, 34, bh, '#1C4024');
          for (var wy = 0; wy < bh - 10; wy += 12) {
            for (var wx = 0; wx < 26; wx += 10) {
              var on = hash((Math.floor(off / 40) + i) * 13 + wy + wx + Math.floor(t / 60)) > 0.72;
              gfx.rect(bx + 4 + wx, gfx.H - 20 - bh + wy + 6, 6, 6, on ? '#B8F818' : '#28502C');
            }
          }
        }
      }
    },

    /* --- カッターステージ：金属の要塞 --- */
    cut: {
      key: 'cut', name: 'CUT MAN', bgm: 'st_cut', seed: 5005,
      sky: '#1C1C2C',
      solid: '#7C7C8C', solidHi: '#BCBCC8', solidLo: '#4C4C5C',
      edge: '#00E8D8', deco: '#D82800', ladder: '#BCBCBC',
      spike: '#FCFCFC', spikeBase: '#7C7C8C', ice: '#3CBCFC', brk: '#8C8C9C',
      mix: ['fly', 'met', 'spike', 'turret', 'fly'],
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        // 回る歯車のシルエット
        var off = camX * 0.3;
        for (var i = -1; i < gfx.W / 70 + 2; i++) {
          var gxp = i * 70 - (off % 70);
          var gyp = 40 + hash(Math.floor(off / 70) + i) * 90;
          var r = 18 + hash((Math.floor(off / 70) + i) * 3) * 14;
          var rot = t * 0.012 * (i % 2 ? 1 : -1);
          gfx.circle(gxp, gyp, r, '#2C2C40');
          for (var k = 0; k < 8; k++) {
            var a = rot + k / 8 * Math.PI * 2;
            gfx.rect(gxp + Math.cos(a) * r - 2, gyp + Math.sin(a) * r - 2, 5, 5, '#2C2C40');
          }
          gfx.circle(gxp, gyp, r * 0.4, '#1C1C2C');
        }
        skyline(camX, 0.5, gfx.H - 12, 20, 34, '#3C3C4C', 7);
      }
    },

    /* --- ガッツステージ：岩山の採掘場 --- */
    guts: {
      key: 'guts', name: 'GUTS MAN', bgm: 'st_guts', seed: 6006,
      sky: '#2C1408',
      solid: '#8C5828', solidHi: '#C89050', solidLo: '#4C2C10',
      edge: '#FCE0A8', deco: '#FC9838', ladder: '#D8A860',
      spike: '#BCBCBC', spikeBase: '#8C5828', ice: '#3CBCFC', brk: '#A06830',
      mix: ['met', 'spike', 'hop', 'met', 'turret'],
      breakable: true,
      drawBg: function (camX, camY, t) {
        gfx.clear(this.sky);
        // 大きな月
        var mx = gfx.W - 54 - camX * 0.05, my = 40;
        gfx.circle(mx, my, 20, '#FCE0A8');
        gfx.circle(mx - 6, my - 5, 4, '#D8B888');
        gfx.circle(mx + 5, my + 4, 5, '#D8B888');
        gfx.circle(mx + 2, my - 9, 3, '#D8B888');
        skyline(camX, 0.18, gfx.H - 28, 36, 78, '#4C2810', 6);
        skyline(camX, 0.4,  gfx.H - 14, 22, 50, '#6C3818', 13);
        // 舞う砂埃
        for (var i = 0; i < 14; i++) {
          var sx = (hash(i * 11) * 1200 - camX * 0.6 + t * 0.4) % (gfx.W + 20);
          if (sx < -10) sx += gfx.W + 20;
          var sy = gfx.H - 30 + Math.sin(t * 0.03 + i) * 12;
          gfx.rect(sx, sy, 2, 1, '#8C5828');
        }
      }
    }
  };

  /* ======================================================================
     地形パターン
     各関数は (S) を受け取り、地形を書き込んで S.x を進める。
     S = { g, x, gl, spawns, items, theme, rnd }
     ====================================================================== */
  function fillCol(S, x, from) {
    if (x < 0 || x >= LW) return;
    for (var y = from; y < LH; y++) S.g[y][x] = '#';
  }
  function put(S, x, y, ch) {
    if (x < 0 || x >= LW || y < 0 || y >= LH) return;
    S.g[y][x] = ch;
  }
  /* 地面に敵を置く。groundRow は「その敵が立つ床の行」 */
  function addEnemy(S, type, tx, groundRow, opts) {
    S.spawns.push({ type: type, x: tx * T + T / 2, y: groundRow * T, opts: opts || {} });
  }
  /* テーマの敵構成からランダムに1体置く（種類ごとに置き方が違う） */
  function spawnMixed(S, tx, groundRow) {
    var type = U.pick(S.theme.mix);
    if (type === 'fly') {
      // 飛行敵は空中に
      S.spawns.push({ type: 'fly', x: tx * T + 8, y: (groundRow - U.rndInt(3, 6)) * T, opts: {} });
    } else if (type === 'turret') {
      // 砲台は床の上に固定
      S.spawns.push({ type: 'turret', x: tx * T + 8, y: (groundRow - 1) * T + 4, opts: {} });
    } else {
      addEnemy(S, type, tx, groundRow);
    }
  }
  // 区間内に n 体ばらまく
  function populate(S, x0, x1, groundRow, n) {
    var span = x1 - x0;
    if (span < 2) return;
    for (var i = 0; i < n; i++) {
      var tx = x0 + Math.floor((i + 0.5) / n * span) + U.rndInt(-1, 1);
      spawnMixed(S, U.clamp(tx, x0, x1 - 1), groundRow);
    }
  }
  // 小さな回復や武器エネルギーを置く
  function maybeItem(S, tx, groundRow, chance) {
    if (U.rnd() < (chance === undefined ? 0.3 : chance)) {
      S.items.push({ kind: U.pick(['hpSmall', 'wpSmall', 'hpSmall']),
                     x: tx * T + 8, y: (groundRow - 1) * T + 8 });
    }
  }

  /* ------------------------------------------------------------------
     ジャンプの限界（歩き 1.35 / 空中 1.60 / 初速 4.9 / 重力 0.235）
       最高到達 48px = 3タイル ちょうど → 実際に「乗れる」のは 2タイルまで
       滞空中の水平移動 69px = 4.3タイル  → 穴は3タイルまでに抑える
     どちらも実測値より安全側に倒して「段差2・穴3」を上限にしている。
     数値を変えたら必ず tools/smoke.js reach を通すこと。
     ------------------------------------------------------------------ */
  var HOP = 2;      // 一度に登れる高さ（タイル）
  var GAP = 3;      // 一度に飛べる穴の幅（タイル）

  var PATTERNS = {
    /* 平地。敵とアイテム、たまに空中足場 */
    flat: function (S) {
      var len = U.rndInt(7, 11), i;
      for (i = 0; i < len; i++) {
        fillCol(S, S.x + i, S.gl);
        if (S.theme.iceFloor && U.rnd() < S.theme.iceFloor) put(S, S.x + i, S.gl, 'I');
      }
      populate(S, S.x + 2, S.x + len - 1, S.gl, U.rndInt(1, 2));
      // ときどき上に足場とごほうび
      if (U.rnd() < 0.4) {
        var px = S.x + Math.floor(len / 2);
        put(S, px, S.gl - HOP, '='); put(S, px + 1, S.gl - HOP, '=');
        S.items.push({ kind: U.rnd() < 0.18 ? 'oneUp' : 'wpSmall',
                       x: (px + 0.5) * T, y: (S.gl - HOP - 1) * T + 8 });
      } else maybeItem(S, S.x + 2, S.gl, 0.25);
      S.x += len;
    },

    /* 小さな穴（3タイルまで＝確実に飛び越えられる） */
    pit: function (S) {
      var pre = 3, w = U.rndInt(2, GAP), post = 3, i;
      for (i = 0; i < pre; i++) fillCol(S, S.x + i, S.gl);
      if (U.rnd() < 0.4) for (i = 0; i < w; i++) put(S, S.x + pre + i, LH - 1, '^');
      for (i = 0; i < post; i++) fillCol(S, S.x + pre + w + i, S.gl);
      spawnMixed(S, S.x + pre + w + 1, S.gl);
      S.x += pre + w + post;
    },

    /* 広い穴＋飛び石（石は必ず 2タイル以内の高さ・3タイル以内の間隔） */
    bigPit: function (S) {
      var pre = 3, w = U.rndInt(6, 9), post = 3, i;
      for (i = 0; i < pre; i++) fillCol(S, S.x + i, S.gl);
      for (i = 0; i < w; i++) put(S, S.x + pre + i, LH - 1, '^');
      // 3タイルおきに幅2の足場を置いて渡らせる
      var px = S.x + pre + 2;
      while (px < S.x + pre + w - 1) {
        put(S, px, S.gl - 1, '=');
        put(S, px + 1, S.gl - 1, '=');
        px += 3;
      }
      for (i = 0; i < post; i++) fillCol(S, S.x + pre + w + i, S.gl);
      S.x += pre + w + post;
    },

    /* 段差を登る（1段 2タイル） */
    stepUp: function (S) {
      var steps = U.rndInt(1, 2), s, i;
      for (s = 0; s < steps; s++) {
        if (S.gl <= 8) break;
        S.gl -= HOP;
        var len = U.rndInt(4, 6);
        for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
        populate(S, S.x + 1, S.x + len, S.gl, 1);
        S.x += len;
      }
    },

    /* 段差を降りる */
    stepDown: function (S) {
      var steps = U.rndInt(1, 2), s, i;
      for (s = 0; s < steps; s++) {
        if (S.gl >= GY) break;
        S.gl += HOP;
        var len = U.rndInt(4, 6);
        for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
        populate(S, S.x + 1, S.x + len, S.gl, 1);
        S.x += len;
      }
    },

    /* 足場を階段状に登る（各段 2タイルずつ） */
    platforms: function (S) {
      var len = 12, i;
      for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
      // 2タイルずつ上げていく＝必ず届く
      put(S, S.x + 2, S.gl - HOP, '=');     put(S, S.x + 3, S.gl - HOP, '=');
      put(S, S.x + 6, S.gl - HOP * 2, '='); put(S, S.x + 7, S.gl - HOP * 2, '=');
      put(S, S.x + 10, S.gl - HOP, '=');    put(S, S.x + 11, S.gl - HOP, '=');
      // 一番上にごほうび
      S.items.push({ kind: U.rnd() < 0.3 ? 'oneUp' : 'hpBig',
                     x: (S.x + 6.5) * T, y: (S.gl - HOP * 2 - 1) * T + 8 });
      S.spawns.push({ type: 'fly', x: (S.x + 5) * T, y: (S.gl - HOP * 2 - 3) * T, opts: {} });
      populate(S, S.x + 1, S.x + len, S.gl, 1);
      S.x += len;
    },

    /* トゲ地帯：2タイル上の足場を渡っていく */
    spikeRun: function (S) {
      var pre = 3, w = U.rndInt(5, 8), post = 3, i;
      for (i = 0; i < pre; i++) fillCol(S, S.x + i, S.gl);
      for (i = 0; i < w; i++) {
        fillCol(S, S.x + pre + i, S.gl + 1);
        put(S, S.x + pre + i, S.gl, '^');
      }
      // 足場は 2タイル上・3タイル間隔（跳んで渡れる配置）
      for (i = 1; i < w; i += 3) {
        put(S, S.x + pre + i, S.gl - HOP, '=');
        put(S, S.x + pre + i + 1, S.gl - HOP, '=');
      }
      for (i = 0; i < post; i++) fillCol(S, S.x + pre + w + i, S.gl);
      S.x += pre + w + post;
    },

    /* はしごで上の階へ（上には砲台とごほうび） */
    ladder: function (S) {
      var len = 13, i, y;
      var upper = Math.max(4, S.gl - 6);
      for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
      // 上の階の床
      for (i = 4; i < len - 1; i++) {
        put(S, S.x + i, upper, '#');
        put(S, S.x + i, upper + 1, '#');
      }
      // はしご（上の階の床の高さから、下の地面まで通す）
      var lx = S.x + 3;
      for (y = upper; y < S.gl; y++) put(S, lx, y, 'L');
      // 上の階のごほうびと敵
      S.spawns.push({ type: 'turret', x: (S.x + 9) * T, y: (upper - 1) * T + 4, opts: {} });
      S.items.push({ kind: U.rnd() < 0.35 ? 'eTank' : 'wpBig',
                     x: (S.x + 11) * T, y: (upper - 1) * T + 8 });
      populate(S, S.x + 5, S.x + len, S.gl, 1);
      S.x += len;
    },

    /* 低い天井の通路（ジャンプできないのでメットールが厄介） */
    corridor: function (S) {
      var len = U.rndInt(7, 10), i, y;
      for (i = 0; i < len; i++) {
        fillCol(S, S.x + i, S.gl);
        for (y = 0; y < S.gl - 4; y++) put(S, S.x + i, y, '#');
      }
      for (i = 2; i < len - 1; i += 3) addEnemy(S, 'met', S.x + i, S.gl);
      maybeItem(S, S.x + 1, S.gl, 0.4);
      S.x += len;
    },

    /* 壊せるブロックの壁（スーパーアームの岩で破壊できる）

       重要：高さは必ず2タイル(32px)までにする。
       ジャンプの最高到達は48pxなので、3タイル以上にすると
       スーパーアームを持っていないプレイヤーが詰んでしまう。
       壊すのはあくまで近道であって、乗り越えても先へ進める。          */
    breakWall: function (S) {
      var len = 11, i, y;
      for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
      var bx = S.x + 4;
      for (y = S.gl - 2; y < S.gl; y++) {
        put(S, bx, y, 'B'); put(S, bx + 1, y, 'B'); put(S, bx + 2, y, 'B');
      }
      // 壁の向こう側にごほうび
      S.items.push({ kind: 'eTank', x: (S.x + 8) * T, y: (S.gl - 1) * T + 8 });
      populate(S, S.x + 1, S.x + 3, S.gl, 1);
      S.x += len;
    },

    /* 動く足場で大穴を渡る */
    movingGap: function (S) {
      var pre = 3, w = 8, post = 3, i;
      for (i = 0; i < pre; i++) fillCol(S, S.x + i, S.gl);
      for (i = 0; i < w; i++) put(S, S.x + pre + i, LH - 1, '^');
      S.spawns.push({ type: 'plat',
        x: (S.x + pre + 1) * T, y: (S.gl - 1) * T,
        opts: { w: 44, ax: (w - 3) * T * 0.5, ay: 0, spd: 0.016 } });
      for (i = 0; i < post; i++) fillCol(S, S.x + pre + w + i, S.gl);
      spawnMixed(S, S.x + pre + w + 1, S.gl);
      S.x += pre + w + post;
    },

    /* 縦に高い区間：足場を交互に配置して登る */
    tower: function (S) {
      var len = 10, i;
      for (i = 0; i < len; i++) fillCol(S, S.x + i, S.gl);
      // 左右交互に 2タイルずつ上げる
      var y = S.gl - HOP, side = 0, n = 0;
      while (y > 4 && n < 4) {
        var bx = S.x + (side ? len - 5 : 2);
        put(S, bx, y, '='); put(S, bx + 1, y, '='); put(S, bx + 2, y, '=');
        y -= HOP; side ^= 1; n++;
      }
      S.items.push({ kind: 'hpBig', x: (S.x + len / 2) * T, y: (y + HOP - 1) * T + 8 });
      S.spawns.push({ type: 'fly', x: (S.x + len / 2) * T, y: (S.gl - 5) * T, opts: {} });
      populate(S, S.x + 1, S.x + len, S.gl, 1);
      S.x += len;
    }
  };

  /* 出現しやすさ（数字が大きいほどよく出る） */
  var WEIGHTS = {
    flat: 5, pit: 4, platforms: 3, stepUp: 3, stepDown: 3,
    spikeRun: 2, ladder: 3, corridor: 2, bigPit: 2, movingGap: 2, tower: 3,
    breakWall: 3
  };
  function pickPattern(names) {
    var total = 0, i;
    for (i = 0; i < names.length; i++) total += WEIGHTS[names[i]] || 1;
    var r = U.rnd() * total;
    for (i = 0; i < names.length; i++) {
      r -= (WEIGHTS[names[i]] || 1);
      if (r <= 0) return names[i];
    }
    return names[0];
  }

  /* ======================================================================
     ステージ生成
     ====================================================================== */
  var RISKY = { pit: 1, bigPit: 1, spikeRun: 1, movingGap: 1 };

  function build(key) {
    var theme = THEMES[key];
    U.seed(theme.seed);

    // 全部空白で初期化
    var g = [], y, x;
    for (y = 0; y < LH; y++) {
      var row = [];
      for (x = 0; x < LW; x++) row.push('.');
      g.push(row);
    }

    var S = { g: g, x: 0, gl: GY, spawns: [], items: [], theme: theme };

    /* --- スタート地帯（安全な平地） --- */
    for (x = 0; x < 12; x++) fillCol(S, x, GY);
    S.x = 12;
    var playerStart = { x: 4 * T + 8, y: GY * T };

    /* --- 中盤：パターンを並べる --- */
    var names = ['flat', 'pit', 'platforms', 'stepUp', 'spikeRun',
                 'stepDown', 'ladder', 'bigPit', 'corridor', 'movingGap', 'tower'];
    if (theme.breakable) names.push('breakWall');

    var endX = LW - ARENA_W - 16;
    var checkpoint = null;
    var last = '';
    var guard = 0;
    var needBreak = !!theme.breakable;   // 壊せるブロックを必ず1回は出す

    while (S.x < endX && guard++ < 300) {
      var n = pickPattern(names);
      // ステージ中盤に来てもまだ出ていなければ強制的に配置する
      if (needBreak && S.x > LW * 0.34 && endX - S.x > 20) { n = 'breakWall'; needBreak = false; }
      else if (n === 'breakWall') needBreak = false;
      // 同じパターンの連続と、危険パターンの連続は避ける
      if (n === last) n = 'flat';
      if (RISKY[last] && RISKY[n]) n = 'flat';
      // 残り幅が足りないなら平地で埋める
      if (endX - S.x < 14) n = 'flat';
      // 高いところで tower/platforms を始めると天井を突き抜けるので調整
      if ((n === 'tower' || n === 'platforms') && S.gl < 11) n = 'stepDown';
      PATTERNS[n](S);
      last = n;

      // 中間ポイント（半分を過ぎた最初の安全な平地）
      if (!checkpoint && S.x > LW * 0.46 && n === 'flat') {
        checkpoint = { x: (S.x - 4) * T, y: S.gl * T };
        S.items.push({ kind: 'hpBig', x: (S.x - 6) * T, y: (S.gl - 1) * T + 8 });
      }
    }

    /* --- 地面の高さを基準に戻してボス前の通路へ --- */
    while (S.gl < GY) {
      S.gl += HOP;
      for (x = 0; x < 3; x++) fillCol(S, S.x + x, S.gl);
      S.x += 3;
    }
    S.gl = GY;
    while (S.x < LW - ARENA_W - 2) { fillCol(S, S.x, S.gl); S.x++; }

    // ボス前の補給ゾーン
    S.items.push({ kind: 'hpBig', x: (LW - ARENA_W - 9) * T, y: (GY - 1) * T + 8 });
    S.items.push({ kind: 'wpBig', x: (LW - ARENA_W - 6) * T, y: (GY - 1) * T + 8 });

    /* --- 扉とボス部屋 --- */
    var doorTx = LW - ARENA_W - 2;
    var arenaTx0 = LW - ARENA_W;
    var arenaTx1 = LW - 2;

    // 扉（幅2・高さ4）とその上の壁
    for (y = GY - 4; y < GY; y++) { g[y][doorTx] = 'D'; g[y][doorTx + 1] = 'D'; }
    for (y = 0; y < GY - 4; y++) { g[y][doorTx] = '#'; g[y][doorTx + 1] = '#'; }
    fillCol(S, doorTx, GY); fillCol(S, doorTx + 1, GY);

    // アリーナの床と天井
    for (x = arenaTx0; x <= arenaTx1 + 1 && x < LW; x++) {
      fillCol(S, x, GY);
      for (y = 0; y < 3; y++) g[y][x] = '#';
    }
    // 右端の壁
    for (y = 0; y < GY; y++) {
      if (arenaTx1 + 1 < LW) g[y][arenaTx1 + 1] = '#';
      g[y][LW - 1] = '#';
    }

    /* --- 文字列に変換 --- */
    var rows = [];
    for (y = 0; y < LH; y++) rows.push(g[y].join(''));

    return {
      key: key,
      theme: theme,
      rows: rows,
      w: LW, h: LH,
      playerStart: playerStart,
      spawns: S.spawns,
      items: S.items,
      checkpoint: checkpoint || { x: ((LW * 0.5) | 0) * T, y: GY * T },
      boss: {
        key: key,
        doorX: doorTx * T,
        triggerX: (doorTx - 1) * T,
        arena: { x0: arenaTx0 * T, x1: (arenaTx1 + 1) * T, floorY: GY * T },
        spawnX: (arenaTx0 + ARENA_W - 8) * T,
        spawnY: GY * T
      }
    };
  }

  return {
    THEMES: THEMES, build: build,
    LW: LW, LH: LH, GY: GY, ARENA_W: ARENA_W,
    hash: hash, starfield: starfield, skyline: skyline
  };
})();
