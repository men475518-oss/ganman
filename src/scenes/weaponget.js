/* =========================================================================
   scenes/weaponget.js  --  武器ゲット画面（ロックマンの醍醐味）

   演出:
     暗転 → 倒したボスの顔がぼんやり浮かぶ → 白フラッシュで武器アイコンに変化
     → 「YOU GOT [武器名]!」がタイプライター風に1文字ずつ表示
     → 専用ファンファーレ → 数秒後にステージセレクトへ
   ========================================================================= */
G.scenes.weaponget = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio;

  var t = 0;
  var weaponId = 'buster';
  var bossKey = 'cut';
  var typed = 0;          // タイプライターで表示済みの文字数
  var line1 = 'YOU GOT';
  var line2 = '';
  var done = false;

  var T_FACE = 20;        // ボスの顔が出るタイミング
  var T_MORPH = 62;       // 武器アイコンに変わる
  var T_TYPE = 82;        // 文字が出はじめる

  function enter(params) {
    t = 0; typed = 0; done = false;
    weaponId = (params && params.weapon) || 'buster';
    bossKey = (params && params.boss) || 'cut';
    line2 = G.weapons.BY_ID[weaponId].name + '!';
    G.fx.reset();
    G.input.visible = false;
    G.music.stop();
  }
  function exit() { G.input.visible = true; }

  function update() {
    t++;

    if (t === T_MORPH) {
      // 変身の瞬間
      A.sfx.explode();
      G.fx.flash('#FCFCFC', 12, 1);
      G.fx.ring(gfx.W / 2, gfx.H * 0.38, 4, 90, 26, G.weapons.BY_ID[weaponId].color, 2);
      G.fx.burst(gfx.W / 2, gfx.H * 0.38, 28, {
        speed: 3.6, life: 30, size: 3, light: true,
        colors: ['#FCFCFC', G.weapons.BY_ID[weaponId].color, G.weapons.BY_ID[weaponId].color2]
      });
      G.music.play('weaponget', { restart: true });
    }

    // 1文字ずつ表示（音つき）
    if (t >= T_TYPE) {
      var total = line1.length + line2.length;
      if (typed < total && (t - T_TYPE) % 4 === 0) {
        typed++;
        var ch = (typed <= line1.length) ? line1[typed - 1] : line2[typed - line1.length - 1];
        if (ch && ch !== ' ') A.sfx.blip();
        if (typed === total) A.sfx.pickup();
      }
    }

    // キラキラを漂わせる
    if (t > T_MORPH && t % 6 === 0) {
      G.fx.part({
        x: U.rndRange(0, gfx.W), y: gfx.H + 4,
        vx: U.rndRange(-0.3, 0.3), vy: -U.rndRange(0.5, 1.4),
        life: U.rndInt(60, 130), size: U.rndInt(1, 3),
        color: G.weapons.BY_ID[weaponId].color, color2: '#FCFCFC',
        type: 'star', light: true
      });
    }

    if (t > T_TYPE + 40) done = true;

    // 自動で戻る／タップでスキップ
    if ((done && t > 300) || (done && G.input.anyPressed)) {
      A.sfx.menuSelect();
      G.music.fadeOut(0.3);
      G.scene.go('select', null, { fade: 30 });
    }
  }

  function draw() {
    gfx.clear('#000008');

    // 中心から広がる光の筋（お祝い感）
    var ctx = gfx.ctx;
    if (t > T_MORPH) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.globalCompositeOperation = 'lighter';
      var cx = gfx.W / 2, cy = gfx.H * 0.38;
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2 + t * 0.006;
        gfx.line(cx, cy, cx + Math.cos(a) * 300, cy + Math.sin(a) * 300,
          G.weapons.BY_ID[weaponId].color, 3);
      }
      ctx.restore();
    }

    G.fx.draw(0, 0);

    var cx2 = gfx.W / 2, cy2 = gfx.H * 0.38;

    /* --- ボスの顔 → 武器アイコン --- */
    if (t >= T_FACE && t < T_MORPH) {
      var k = U.clamp((t - T_FACE) / 24, 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      // だんだん大きくなりながら現れる
      G.bosses.drawFace(bossKey, cx2, cy2, 48 + k * 8, false);
      ctx.restore();
      // 変身直前は震える
      if (t > T_MORPH - 14) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        G.bosses.drawFace(bossKey, cx2 + U.rndRange(-2, 2), cy2 + U.rndRange(-2, 2), 52, false);
        ctx.restore();
      }
    } else if (t >= T_MORPH) {
      // 武器アイコンを大きく表示（少し弾んで登場）
      var kk = U.clamp((t - T_MORPH) / 20, 0, 1);
      var scale = 2.4 * U.ease.outBack(kk) + 1.2;
      var bob = Math.sin(t * 0.08) * 2;
      // 台座の光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      gfx.circle(cx2, cy2 + bob, 30 + Math.sin(t * 0.1) * 3, '#101830');
      ctx.restore();
      G.weapons.drawIcon(weaponId, cx2, cy2 + bob, scale);
    }

    /* --- タイプライター文字 --- */
    if (t >= T_TYPE) {
      var n1 = Math.min(typed, line1.length);
      var n2 = Math.max(0, typed - line1.length);
      var s1 = line1.substring(0, n1);
      var s2 = line2.substring(0, n2);
      gfx.text(s1, cx2, gfx.H - 74, { align: 'center', scale: 2, color: '#FCFCFC', outline: '#101018' });
      if (n2 > 0) {
        gfx.text(s2, cx2, gfx.H - 48,
          { align: 'center', scale: 2, color: G.weapons.BY_ID[weaponId].color, outline: '#101018' });
      }
      // カーソル
      if (typed < line1.length + line2.length && Math.floor(t / 6) % 2 === 0) {
        var y = n2 > 0 ? gfx.H - 48 : gfx.H - 74;
        var wdt = gfx.textWidth(n2 > 0 ? s2 : s1, 2);
        gfx.rect(cx2 + wdt / 2 + 2, y, 8, 14, '#FCFCFC');
      }
    }

    if (done && Math.floor(t / 20) % 2 === 0) {
      gfx.text('TAP TO CONTINUE', cx2, gfx.H - 18, { align: 'center', color: '#7C88A0' });
    }

    G.fx.drawFlash();
    gfx.scanlines(0.12);
  }

  return { enter: enter, exit: exit, update: update, draw: draw };
})();
