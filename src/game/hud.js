/* =========================================================================
   hud.js  --  画面表示（体力ゲージ・武器ゲージ・ボスHP・残機）

   ロックマンらしい「横向きの目盛りゲージ」を再現。
   武器エネルギーが少ないときは点滅して警告する。
   ========================================================================= */
G.hud = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, W = G.weapons;

  var SEG_H = 2;      // 目盛り1本の高さ
  var SEG_GAP = 1;
  var BAR_W = 8;

  /* 縦型の目盛りゲージを描く（下から積み上がる） */
  function gauge(x, y, value, max, colHi, colLo, blink) {
    var segs = 28;
    var filled = Math.ceil(U.clamp(value / max, 0, 1) * segs);
    var h = segs * (SEG_H + SEG_GAP) + 3;

    // 枠
    gfx.rect(x - 2, y - 2, BAR_W + 4, h, '#101018');
    gfx.rect(x - 1, y - 1, BAR_W + 2, h - 2, '#FCFCFC');
    gfx.rect(x, y, BAR_W, h - 4, '#101018');

    for (var i = 0; i < segs; i++) {
      var sy = y + (segs - 1 - i) * (SEG_H + SEG_GAP) + 1;
      if (i < filled) {
        if (blink && (Math.floor(Date.now() / 120) % 2 === 0)) continue;
        gfx.rect(x + 1, sy, BAR_W - 2, SEG_H, colHi);
        gfx.rect(x + 1, sy, 2, SEG_H, colLo);
      }
    }
  }

  /* --- ステージ中のHUD --- */
  function drawStage(st) {
    var pl = st.player;
    var x = 10, y = 12;

    // 体力
    gauge(x, y, pl.hp, pl.maxHp, '#3CBCFC', '#FCFCFC', false);
    gfx.text('P', x + 1, y - 11, { color: '#FCFCFC', shadow: '#101018' });

    // 武器エネルギー（バスター以外を選んでいる時だけ）
    var wid = pl.weaponId();
    if (wid !== 'buster') {
      var def = W.BY_ID[wid];
      var amt = pl.ammo[wid];
      var low = amt <= def.cost * 2;      // あと2発以下なら警告点滅
      gauge(x + 18, y, amt, G.Player.MAX_AMMO, def.color, '#FCFCFC', low);
      gfx.text(def.short.charAt(0), x + 19, y - 11, { color: def.color, shadow: '#101018' });
    }

    // 選択中の武器アイコン（右上：切り替えボタンの近く）
    var ix = gfx.W - 20, iy = 44;
    gfx.rect(ix - 12, iy - 12, 24, 24, '#101018');
    gfx.rectLine(ix - 12, iy - 12, 24, 24, W.BY_ID[wid].color, 1);
    W.drawIcon(wid, ix, iy, 1);
    if (pl.weapons.length > 1) {
      gfx.text((pl.weaponIndex + 1) + '/' + pl.weapons.length, ix, iy + 14,
        { align: 'center', color: '#BCBCBC', shadow: '#101018' });
    }

    // 残機
    gfx.text('x' + pl.lives, 24, gfx.H - 14, { color: '#FCFCFC', shadow: '#101018' });
    var box = G.sprites.item.oneUp;
    gfx.ctx.drawImage(box.r, 8, gfx.H - 18);

    // E缶
    if (st.tanks > 0) {
      gfx.ctx.drawImage(G.sprites.item.eTank.r, 52, gfx.H - 18);
      gfx.text('x' + st.tanks, 68, gfx.H - 14, { color: '#B8F818', shadow: '#101018' });
    }
  }

  /* --- ボスの体力ゲージ（右側に縦置き。原作と同じ位置） --- */
  function drawBoss(boss) {
    if (!boss || !boss.active) return;
    var x = 34, y = 12;
    var col = boss.col.light;
    gauge(x, y, boss.hp, boss.maxHp, col, '#FCFCFC', false);
    gfx.text('B', x + 1, y - 11, { color: col, shadow: '#101018' });
  }

  /* --- 汎用：中央の大きなメッセージ（READY / GO! など） --- */
  function bigText(str, y, opt) {
    opt = opt || {};
    gfx.text(str, gfx.W / 2, y, {
      align: 'center', scale: opt.scale || 3,
      color: opt.color || '#FCFCFC',
      outline: opt.outline || '#101018'
    });
  }

  return { drawStage: drawStage, drawBoss: drawBoss, gauge: gauge, bigText: bigText };
})();
