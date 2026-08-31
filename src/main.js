/* =========================================================================
   main.js  --  起動・シーン管理・メインループ

   ・固定タイムステップ(60Hz)＋アキュムレータで、
     120Hz端末でも処理落ち時でもゲーム速度が変わらないようにしている
   ・スローモー演出は「更新を間引く」ことで実現（描画は毎フレーム）
   ========================================================================= */
(function () {
  'use strict';

  /* ======================================================================
     ゲーム全体の進行データ（ステージをまたいで持ち越す）
     ====================================================================== */
  G.game = {
    cleared: {},                 // ボスkey -> true
    weapons: ['buster'],
    lives: 2,
    tanks: 0,
    ammo: {},
    reset: function () {
      this.cleared = {};
      this.weapons = ['buster'];
      this.lives = 2;
      this.tanks = 0;
      this.ammo = {};
      var list = G.weapons.WEAPONS;
      for (var i = 0; i < list.length; i++) this.ammo[list[i].id] = G.Player.MAX_AMMO;
    }
  };

  /* ======================================================================
     シーン管理（フェードで切り替え）
     ====================================================================== */
  G.scene = (function () {
    var cur = null, curName = '';
    var pending = null;
    var transT = 0, transDur = 0, swapped = false;

    function go(name, params, opts) {
      if (pending) return;                 // 遷移中の多重呼び出しは無視
      opts = opts || {};
      pending = { name: name, params: params || null };
      transDur = opts.fade === undefined ? 24 : opts.fade;
      transT = 0;
      swapped = false;
      if (transDur <= 0) doSwap();
    }

    function doSwap() {
      if (!pending) return;
      if (cur && cur.exit) cur.exit();
      curName = pending.name;
      cur = G.scenes[curName];
      G.input.consumeAll();                // 前シーンのタップが誤爆しないように
      if (cur && cur.enter) cur.enter(pending.params);
      pending = null;
      swapped = true;
    }

    function update() {
      if (pending) {
        transT++;
        if (!swapped && transT >= transDur / 2) doSwap();
      } else if (transT > 0) {
        transT++;
        if (transT >= transDur) { transT = 0; transDur = 0; }
      }
      if (cur && cur.update) cur.update();
    }

    function draw() {
      if (cur && cur.draw) cur.draw();
      // フェードの黒幕（中間で真っ黒になる三角波）
      if (transDur > 0) {
        var k = transT / transDur;
        var a = 1 - Math.abs(k * 2 - 1);
        G.gfx.veil('#000000', Math.min(1, a * 1.15));
      }
    }

    return {
      go: go, update: update, draw: draw,
      get name() { return curName; },
      get current() { return cur; },
      get transitioning() { return !!pending; }
    };
  })();

  /* ======================================================================
     メインループ
     ====================================================================== */
  var STEP = 1000 / 60;
  var acc = 0, last = 0, slowAcc = 0;
  var running = false;
  var fpsSamples = [], fps = 60;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    var dt = now - last;
    last = now;
    if (dt > 250) dt = STEP;      // タブ復帰などの巨大な差分は無視
    acc += dt;

    // FPS 計測（デバッグ表示用）
    if (dt > 0) {
      fpsSamples.push(1000 / dt);
      if (fpsSamples.length > 30) fpsSamples.shift();
      fps = fpsSamples.reduce(function (a, b) { return a + b; }, 0) / fpsSamples.length;
    }

    var steps = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP;
      steps++;

      /* スローモー：timeScale の分だけ更新回数を間引く。
         入力の更新もここに含めるのが重要。外に出すと、間引かれた
         フレームで「押した瞬間」が消費され、シーンに届かないまま
         失われてしまう（ボタンが効かない原因になる）。          */
      slowAcc += G.fx.timeScale;
      if (slowAcc >= 1) {
        slowAcc -= 1;
        G.input.update();
        G.fx.update();
        G.scene.update();
      }
    }
    if (steps >= 5) acc = 0;      // 追いつけない時は諦めてリセット

    G.scene.draw();
    if (G.debug) drawDebug();
  }

  function drawDebug() {
    G.gfx.text('FPS ' + Math.round(fps), G.gfx.W - 4, 4,
      { align: 'right', color: fps > 50 ? '#B8F818' : '#F87858', shadow: '#000' });
  }

  /* ======================================================================
     起動
     ====================================================================== */
  function boot() {
    // 埋め込み先に viewport メタが無い場合（別ページに差し込まれた時など）は
    // 自前で挿入する。これが無いと端末が仮想980px幅で描画してしまう
    if (!document.querySelector('meta[name="viewport"]')) {
      var mv = document.createElement('meta');
      mv.name = 'viewport';
      mv.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
      document.head.appendChild(mv);
    }

    var canvas = document.getElementById('screen');
    G.gfx.init(canvas);
    G.sprites.build();
    G.input.bind(canvas);
    G.game.reset();

    var overlay = document.getElementById('boot');
    var started = false;

    function start() {
      if (started) return;
      started = true;
      // iOS はユーザー操作の中で音声を解禁する必要がある
      G.audio.unlock();
      overlay.style.display = 'none';
      running = true;
      last = performance.now();
      G.scene.go('title', null, { fade: 0 });
      requestAnimationFrame(frame);
    }

    overlay.addEventListener('touchstart', function (e) { e.preventDefault(); start(); }, { passive: false });
    overlay.addEventListener('mousedown', start);
    overlay.addEventListener('click', start);
    window.addEventListener('keydown', function (e) {
      if (!started) { start(); }
      // F1 でデバッグ表示（FPS）
      if (e.code === 'F1') { G.debug = !G.debug; e.preventDefault(); }
    });

    // タブが裏に回ったら音を止める（バッテリー節約＆復帰時の暴走防止）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        G.audio.chargeStop();
        G.music.duck(0);
      } else {
        G.music.duck(0.55);
        last = performance.now();
        acc = 0;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})();
