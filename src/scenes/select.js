/* =========================================================================
   scenes/select.js  --  ステージセレクト

   演出:
     入場時にボスの顔パネルが1枚ずつ順番に点灯（音つき）
     選択中のパネルは拡大＋枠が光り、下に名前を表示
     決定すると選択音＋画面が白くフラッシュしてステージへ

   操作:
     パネルを直接タップ → 選択（もう一度タップで決定）
     スティックで移動、JUMP/SHOT/START で決定
   ========================================================================= */
G.scenes.select = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, BS = G.bosses;

  /* 3x3 の配置。null は空きパネル、'center' は中央 */
  var GRID = [
    'cut',  'elec',  'ice',
    'fire', 'center','bomb',
    null,   'guts',  null
  ];

  var t = 0;
  var lit = 0;              // 何枚まで点灯したか
  var sel = 0;              // 選択中のセル番号
  var confirmT = -1;        // 決定演出のカウンタ
  var pulse = 0;

  var PANEL_W = 62, PANEL_H = 46, GAP = 6;

  function cellRect(i) {
    var col = i % 3, row = (i / 3) | 0;
    var gw = PANEL_W * 3 + GAP * 2;
    var gh = PANEL_H * 3 + GAP * 2;
    var ox = (gfx.W - gw) / 2;
    var oy = (gfx.H - gh) / 2 + 8;
    return { x: ox + col * (PANEL_W + GAP), y: oy + row * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H };
  }

  function isSelectable(i) {
    var k = GRID[i];
    if (!k) return false;
    if (k === 'center') return allCleared();     // 全部倒したら中央が最終ステージに
    return !G.game.cleared[k];
  }
  function allCleared() {
    return BS.LIST.every(function (b) { return G.game.cleared[b.key]; });
  }

  function firstSelectable() {
    for (var i = 0; i < 9; i++) if (isSelectable(i)) return i;
    return 4;
  }

  function enter() {
    t = 0; lit = 0; confirmT = -1;
    G.fx.reset();
    G.input.visible = false;
    sel = firstSelectable();
    G.music.play('select');
  }
  function exit() { G.input.visible = true; }

  /* 十字方向にセルを探す（空きパネルは飛ばす） */
  function move(dx, dy) {
    var col = sel % 3, row = (sel / 3) | 0;
    for (var step = 1; step <= 3; step++) {
      var nc = (col + dx * step + 3) % 3;
      var nr = (row + dy * step + 3) % 3;
      var ni = nr * 3 + nc;
      if (isSelectable(ni)) {
        if (ni !== sel) { sel = ni; A.sfx.menuMove(); pulse = 8; }
        return;
      }
    }
  }

  function confirm() {
    if (!isSelectable(sel)) { A.sfx.deny(); return; }
    confirmT = 0;
    A.sfx.menuSelect();
    G.music.fadeOut(0.4);
  }

  function update() {
    t++;
    if (pulse > 0) pulse--;

    /* --- 順番に点灯する演出 --- */
    if (lit < 9) {
      if (t % 7 === 0) {
        lit++;
        if (GRID[lit - 1]) A.sfx.blip();
        if (lit === 9) A.sfx.menuMove();
      }
      return;
    }

    /* --- 決定演出中 --- */
    if (confirmT >= 0) {
      confirmT++;
      if (confirmT === 1) G.fx.flash('#FCFCFC', 22, 1);
      if (confirmT === 4) {
        var r = cellRect(sel);
        G.fx.burst(r.x + r.w / 2, r.y + r.h / 2, 24,
          { speed: 4, life: 24, size: 3, color: '#FCFCFC', light: true });
      }
      if (confirmT > 30) {
        var k = GRID[sel];
        if (k === 'center') G.scene.go('ending', null, { fade: 30 });
        else G.scene.go('stage', { key: k }, { fade: 24 });
      }
      return;
    }

    // 選択中のパネルが選べなくなっていたら（クリア直後など）選び直す
    if (!isSelectable(sel)) sel = firstSelectable();

    /* --- キー／スティック操作 --- */
    var inp = G.input;
    if (inp.pressed.left)  move(-1, 0);
    if (inp.pressed.right) move(1, 0);
    if (inp.pressed.up)    move(0, -1);
    if (inp.pressed.down)  move(0, 1);
    if (inp.pressed.jump || inp.pressed.shot || inp.pressed.start) confirm();

    /* --- パネルを直接タップ ---
       1回目のタップで選択、同じパネルをもう一度タップで決定。
       （押し間違いでいきなりステージが始まらないようにするため）      */
    for (var ti = 0; ti < inp.taps.length; ti++) {
      var tap = inp.taps[ti];
      for (var i = 0; i < 9; i++) {
        if (!isSelectable(i)) continue;
        var r = cellRect(i);
        if (tap.x >= r.x - 4 && tap.x <= r.x + r.w + 4 &&
            tap.y >= r.y - 4 && tap.y <= r.y + r.h + 4) {
          if (i === sel) { confirm(); }
          else { sel = i; A.sfx.menuMove(); pulse = 8; }
          break;
        }
      }
    }
  }

  /* ---------------- 1枚のパネルを描く ---------------- */
  function drawPanel(i) {
    var k = GRID[i];
    var r = cellRect(i);
    var isSel = (i === sel) && isSelectable(i);
    var cleared = k && k !== 'center' && G.game.cleared[k];
    var ctx = gfx.ctx;

    // 選択中は少し拡大する
    var grow = isSel ? (2 + (pulse > 0 ? 2 : 0)) : 0;
    var x = r.x - grow, y = r.y - grow, w = r.w + grow * 2, h = r.h + grow * 2;

    // 枠
    var border = '#2C2C4C';
    if (isSel) border = (Math.floor(t / 6) % 2 === 0) ? '#FCFCFC' : '#3CBCFC';
    else if (cleared) border = '#5C2020';

    gfx.rect(x, y, w, h, '#080814');
    gfx.rectLine(x, y, w, h, border, 2);

    if (!k) {
      // 空きパネル：暗いままノイズだけ
      for (var n = 0; n < 6; n++) {
        var nx = x + 6 + ((n * 37 + t) % (w - 12));
        gfx.rect(nx, y + 8 + ((n * 13) % (h - 16)), 2, 1, '#181828');
      }
      return;
    }

    var cx = x + w / 2, cy = y + h / 2 - 4;

    if (k === 'center') {
      // 中央：自機の顔（全ボス撃破後は「FINAL」になる）
      var can = allCleared();
      var pbox = G.sprites.player.idle;
      ctx.save();
      if (!can) ctx.globalAlpha = 0.55;
      // 顔だけ切り出して2倍で描く
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pbox.r, 0, 0, 16, 11, Math.round(cx - 16), Math.round(cy - 12), 32, 22);
      ctx.restore();
      gfx.text(can ? 'FINAL' : 'GANMAN', cx, y + h - 12,
        { align: 'center', color: can ? '#F8D878' : '#7C88A0' });
      if (can && Math.floor(t / 8) % 2 === 0) {
        gfx.rectLine(x - 2, y - 2, w + 4, h + 4, '#F8D878', 1);
      }
      return;
    }

    // ボスの顔
    BS.drawFace(k, cx, cy, 34, cleared);

    // 名前
    var def = BS.BY_KEY[k].def;
    var label = def.name.split(' ')[0];
    gfx.text(label, cx, y + h - 11, {
      align: 'center',
      color: cleared ? '#7C3030' : (isSel ? '#FCFCFC' : '#9CA8B8')
    });

    // 撃破済みマーク
    if (cleared) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      gfx.line(x + 8, y + 8, x + w - 8, y + h - 14, '#D82800', 2);
      gfx.line(x + w - 8, y + 8, x + 8, y + h - 14, '#D82800', 2);
      ctx.restore();
    }

    // 選択中はキラッと光る粒
    if (isSel && t % 6 === 0) {
      G.fx.part({ x: cx + U.rndRange(-w / 2, w / 2), y: cy + U.rndRange(-h / 2, h / 2),
        vx: 0, vy: -0.5, life: 16, size: 2, color: '#FCFCFC', type: 'star', light: true });
    }
  }

  function draw() {
    /* --- 背景 --- */
    gfx.clear('#0C0C1C');
    G.stages.starfield(t * 0.3, 0, 40, 1, ['#1C1C3C', '#2C2C5C']);
    // 走る横線
    var ctx = gfx.ctx;
    ctx.save(); ctx.globalAlpha = 0.3;
    for (var y = (t * 0.6) % 16; y < gfx.H; y += 16) gfx.rect(0, y, gfx.W, 1, '#141428');
    ctx.restore();

    /* --- 見出し --- */
    gfx.text('STAGE SELECT', gfx.W / 2, 10,
      { align: 'center', scale: 2, color: '#3CBCFC', outline: '#101018' });

    /* --- パネル --- */
    for (var i = 0; i < 9; i++) {
      if (i < lit) drawPanel(i);
    }

    /* --- 選択中のボス名（フルネーム） --- */
    var k = GRID[sel];
    if (lit >= 9 && k && k !== 'center') {
      var def = G.bosses.BY_KEY[k].def;
      gfx.text(def.name, gfx.W / 2, gfx.H - 30,
        { align: 'center', scale: 2, color: def.col.light, outline: '#101018' });
      // 弱点のヒント（その武器を持っていたら教えてあげる）
      var weak = def.weakness;
      if (G.game.weapons.indexOf(weak) >= 0) {
        gfx.text('WEAK: ' + G.weapons.BY_ID[weak].name, gfx.W / 2, gfx.H - 12,
          { align: 'center', color: '#F8D878' });
      } else {
        gfx.text('TAP AGAIN TO START', gfx.W / 2, gfx.H - 12,
          { align: 'center', color: '#7C88A0' });
      }
    } else if (lit >= 9 && k === 'center' && allCleared()) {
      gfx.text('ALL STAGES CLEAR', gfx.W / 2, gfx.H - 30,
        { align: 'center', scale: 2, color: '#F8D878', outline: '#101018' });
    }

    /* --- 入手済み武器の一覧（左上。下部の文字と重ならない位置） --- */
    var wx = 8, wy = 16;
    for (var wi = 0; wi < G.game.weapons.length; wi++) {
      var id = G.game.weapons[wi];
      gfx.rect(wx - 1, wy - 9, 18, 18, '#0A0A18');
      gfx.rectLine(wx - 1, wy - 9, 18, 18, '#2C2C4C', 1);
      G.weapons.drawIcon(id, wx + 8, wy, 1);
      wx += 20;
    }

    /* --- 残機 --- */
    gfx.text('x' + G.game.lives, gfx.W - 14, gfx.H - 18,
      { align: 'right', color: '#FCFCFC', shadow: '#101018' });
    gfx.ctx.drawImage(G.sprites.item.oneUp.r, gfx.W - 12, gfx.H - 22);

    G.fx.draw(0, 0);
    G.fx.drawFlash();
    gfx.scanlines(0.12);
  }

  return { enter: enter, exit: exit, update: update, draw: draw };
})();
