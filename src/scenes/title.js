/* =========================================================================
   scenes/title.js  --  タイトル画面

   演出:
     ロゴが上から落下 → バウンドして着地 → 衝撃波＋画面揺れ＋土煙
     → サブタイトルがフェードイン → 「PRESS START」が点滅
     背景は星＋スクロールする格子＋走査線でレトロ感を出す
   ========================================================================= */
G.scenes = G.scenes || {};
G.scenes.title = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio;

  var t = 0;
  var logoY = 0, logoLanded = false;
  var DROP_FRAMES = 46;
  var ready = false;

  function enter() {
    t = 0;
    logoLanded = false;
    ready = false;
    G.fx.reset();
    G.input.visible = false;      // タイトルでは仮想パッドを隠す
    G.music.play('title');
  }

  function exit() { G.input.visible = true; }

  function update() {
    t++;

    /* --- ロゴの落下 --- */
    var targetY = gfx.H * 0.30;
    if (t <= DROP_FRAMES) {
      var k = t / DROP_FRAMES;
      logoY = U.lerp(-70, targetY, U.ease.outBounce(k));
    } else {
      logoY = targetY;
      if (!logoLanded) {
        logoLanded = true;
        // 着地の衝撃
        A.sfx.land2();
        A.sfx.explode();
        G.fx.shake(5, 22);
        G.fx.flash('#FCFCFC', 5, 0.5);
        G.fx.ring(gfx.W / 2, logoY + 24, 6, gfx.W * 0.75, 26, '#3CBCFC', 2);
        G.fx.burst(gfx.W / 2, logoY + 26, 26, {
          speed: 3.4, life: 30, size: 3, dir: -Math.PI / 2,
          colors: ['#FCFCFC', '#3CBCFC', '#0058F8'], grav: 0.12, light: true
        });
        // 左右に土煙
        for (var i = 0; i < 10; i++) {
          G.fx.part({
            x: gfx.W / 2 + U.rndRange(-70, 70), y: logoY + 26,
            vx: U.rndRange(-3, 3), vy: U.rndRange(-1.4, -0.2),
            drag: 0.93, life: U.rndInt(20, 34), size: 3,
            color: '#BCBCBC', color2: '#7C7C7C'
          });
        }
      }
    }

    if (t > DROP_FRAMES + 40) ready = true;

    // 背景の漂う粒
    if (t % 7 === 0) {
      G.fx.part({
        x: U.rndRange(0, gfx.W), y: gfx.H + 4,
        vx: U.rndRange(-0.2, 0.2), vy: -U.rndRange(0.25, 0.8),
        life: U.rndInt(90, 180), size: U.rndInt(1, 2), fade: true, shrink: false,
        color: U.pick(['#3CBCFC', '#0058F8', '#FCFCFC'])
      });
    }

    /* --- スタート待ち --- */
    if (ready && (G.input.anyPressed || G.input.pressed.start)) {
      A.sfx.menuSelect();
      G.fx.flash('#FCFCFC', 10, 1);
      G.music.fadeOut(0.35);
      G.scene.go('select', null, { fade: 26 });
    }
  }

  function draw() {
    /* --- 背景 --- */
    gfx.clear('#000018');
    G.stages.starfield(t * 0.6, 0, 60, 1, ['#FCFCFC', '#3CBCFC', '#0058F8']);

    // 奥へ向かう格子（レトロSF感）
    var ctx = gfx.ctx;
    ctx.save();
    ctx.globalAlpha = 0.22;
    var horizon = gfx.H * 0.62;
    for (var i = 0; i < 14; i++) {
      var yy = horizon + Math.pow(i / 14, 2.2) * (gfx.H - horizon) + (t * 0.5 % 12);
      if (yy < gfx.H) gfx.rect(0, yy, gfx.W, 1, '#0058F8');
    }
    for (var j = -8; j <= 8; j++) {
      gfx.line(gfx.W / 2 + j * 12, horizon, gfx.W / 2 + j * 90, gfx.H, '#0058F8', 1);
    }
    ctx.restore();

    G.fx.draw(0, 0);

    /* --- ロゴ --- */
    var cx = gfx.W / 2;
    var scale = gfx.W < 300 ? 4 : 5;
    gfx.text('GANMAN', cx, logoY, { align: 'center', scale: scale, color: '#3CBCFC', outline: '#101018' });
    // 文字の上だけを白く光らせる「ツヤ」を左から右へ走らせる
    if (logoLanded) {
      var lw = gfx.textWidth('GANMAN', scale);
      var sweep = ((t * 3) % (lw + 160)) - 80;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - lw / 2 + sweep, logoY - 4, 12, gfx.FONT_H * scale + 8);
      ctx.clip();
      gfx.text('GANMAN', cx, logoY, { align: 'center', scale: scale, color: '#FCFCFC' });
      ctx.restore();
    }

    /* --- サブタイトル --- */
    if (t > DROP_FRAMES + 8) {
      var a = U.clamp((t - DROP_FRAMES - 8) / 24, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      gfx.text('- ROBOT MASTER WARS -', cx, logoY + gfx.FONT_H * scale + 10,
        { align: 'center', scale: 1, color: '#FCE0A8', shadow: '#101018' });
      ctx.restore();
    }

    /* --- PRESS START --- */
    if (ready && (Math.floor(t / 22) % 2 === 0)) {
      gfx.text('PRESS START', cx, gfx.H - 58,
        { align: 'center', scale: 2, color: '#FCFCFC', outline: '#101018' });
    }
    if (ready) {
      gfx.text('TAP ANYWHERE TO BEGIN', cx, gfx.H - 34,
        { align: 'center', scale: 1, color: '#7C88A0' });
    }

    gfx.text('2024  CANVAS ACTION', cx, gfx.H - 16,
      { align: 'center', scale: 1, color: '#4C5468' });

    G.fx.drawFlash();
    gfx.scanlines(0.14);
  }

  return { enter: enter, exit: exit, update: update, draw: draw };
})();
