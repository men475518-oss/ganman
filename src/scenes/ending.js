/* =========================================================================
   scenes/ending.js  --  全ボス撃破後のエンディング
   ========================================================================= */
G.scenes.ending = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio;

  var t = 0, scroll = 0;

  var CREDITS = [
    '', 'CONGRATULATIONS!', '',
    'ALL SIX ROBOT MASTERS',
    'HAVE BEEN DEFEATED.', '',
    'PEACE RETURNS TO THE CITY',
    'ONCE AGAIN.', '', '',
    '- WEAPONS ACQUIRED -', '',
    'THUNDER BEAM', 'FIRE STORM', 'ICE SLASHER',
    'HYPER BOMB', 'ROLLING CUTTER', 'SUPER ARM', '', '',
    '- STAFF -', '',
    'GAME DESIGN    CANVAS ACTION',
    'PROGRAMMING    CANVAS ACTION',
    'PIXEL ART      CANVAS ACTION',
    'CHIP MUSIC     WEB AUDIO API', '', '',
    'THANK YOU FOR PLAYING!', '', '', 'THE END', '', ''
  ];

  function enter() {
    t = 0; scroll = 0;
    G.fx.reset();
    G.input.visible = false;
    G.music.play('clear', { restart: true });
  }
  function exit() { G.input.visible = true; }

  function update() {
    t++;
    scroll += 0.36;

    // 花火のように爆発を上げる
    if (t % 44 === 0) {
      var x = U.rndRange(30, gfx.W - 30), y = U.rndRange(20, gfx.H * 0.5);
      G.fx.explode(x, y, 1.1, ['#FCFCFC', '#F8D878', '#3CBCFC', '#F878F8']);
      A.sfx.enemyPop();
    }
    if (t % 9 === 0) {
      G.fx.part({
        x: U.rndRange(0, gfx.W), y: gfx.H + 4,
        vx: U.rndRange(-0.2, 0.2), vy: -U.rndRange(0.3, 0.9),
        life: U.rndInt(90, 200), size: U.rndInt(1, 2), shrink: false,
        color: U.pick(['#3CBCFC', '#F8D878', '#FCFCFC'])
      });
    }

    // 曲が終わったらもう一度流す
    if (t % 900 === 300) G.music.play('clear', { restart: true });

    var total = CREDITS.length * 16 + gfx.H;
    if (scroll > total || (t > 120 && G.input.anyPressed)) {
      A.sfx.menuSelect();
      G.music.fadeOut(0.6);
      // 進行状況をリセットして最初から遊べるようにする
      G.game.reset();
      G.scene.go('title', null, { fade: 40 });
    }
  }

  function draw() {
    gfx.clear('#000018');
    G.stages.starfield(t * 0.4, 0, 60, 1, ['#FCFCFC', '#3CBCFC', '#F8D878']);
    G.fx.draw(0, 0);

    // 地平線に立つ主人公のシルエット
    var groundY = gfx.H - 26;
    gfx.rect(0, groundY, gfx.W, gfx.H - groundY, '#101028');
    gfx.rect(0, groundY, gfx.W, 2, '#3CBCFC');
    var pbox = G.sprites.player.idle;
    gfx.ctx.drawImage(pbox.r, Math.round(gfx.W / 2 - 8), Math.round(groundY - pbox.h));

    // クレジットのスクロール
    for (var i = 0; i < CREDITS.length; i++) {
      var y = gfx.H + i * 16 - scroll;
      if (y < -16 || y > groundY - 32) continue;   // 主人公に重ならない位置で消す
      var line = CREDITS[i];
      var isTitle = (line.indexOf('-') === 0) || line === 'CONGRATULATIONS!' || line === 'THE END';
      gfx.text(line, gfx.W / 2, y, {
        align: 'center',
        scale: isTitle ? 2 : 1,
        color: isTitle ? '#F8D878' : '#FCFCFC',
        shadow: '#101018'
      });
    }

    G.fx.drawFlash();
    gfx.scanlines(0.12);
  }

  return { enter: enter, exit: exit, update: update, draw: draw };
})();
