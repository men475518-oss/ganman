/* =========================================================================
   fx.js  --  演出（パーティクル／画面シェイク／フラッシュ／スローモー）

   「キメ」を作るための道具箱。ゲームロジックからは
     G.fx.explode(x, y, ...)  G.fx.shake(4, 20)  G.fx.flash('#fff', 6)
   のように呼ぶだけで済むようにしてある。
   ========================================================================= */
G.fx = (function () {
  'use strict';
  var U = G.util, P;

  var parts = [];        // パーティクル
  var rings = [];        // 広がる衝撃波リング
  var texts = [];        // ふわっと浮かぶ文字

  var shakeAmt = 0, shakeTime = 0, shakeMax = 1;
  var flashCol = '#fff', flashTime = 0, flashMax = 1, flashPeak = 1;
  var slowTime = 0, slowFactor = 1;

  var api = {
    timeScale: 1,        // main のループが毎フレーム読む（スローモー用）
    shakeX: 0, shakeY: 0
  };

  /* ======================================================================
     パーティクル生成
     ====================================================================== */
  function part(o) {
    // 出しすぎるとスマホが重くなるので上限を設ける
    if (parts.length > 300) parts.shift();
    parts.push({
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      grav: o.grav || 0,
      drag: o.drag === undefined ? 1 : o.drag,
      life: o.life || 20, maxLife: o.life || 20,
      size: o.size || 2,
      color: o.color || '#FCFCFC',
      color2: o.color2 || null,     // 寿命後半で切り替わる色
      type: o.type || 'rect',       // rect / circle / spark / star
      spin: o.spin || 0, rot: 0,
      fade: o.fade !== false,
      shrink: o.shrink !== false,
      light: o.light || false       // 加算合成っぽく明るく出す
    });
  }
  api.part = part;

  /* --- 汎用の飛び散り --- */
  function burst(x, y, n, opt) {
    opt = opt || {};
    var spd = opt.speed || 2, spread = opt.spread || Math.PI * 2;
    var base = opt.dir === undefined ? 0 : opt.dir;
    for (var i = 0; i < n; i++) {
      var a = base + (spread >= Math.PI * 2 ? U.rnd() * Math.PI * 2 : base + (U.rnd() - 0.5) * spread);
      if (spread >= Math.PI * 2) a = U.rnd() * Math.PI * 2;
      var s = spd * (0.4 + U.rnd() * 0.8);
      part({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        grav: opt.grav || 0, drag: opt.drag === undefined ? 0.96 : opt.drag,
        life: (opt.life || 22) * (0.6 + U.rnd() * 0.7),
        size: opt.size || 2,
        color: opt.colors ? U.pick(opt.colors) : (opt.color || '#FCFCFC'),
        color2: opt.color2 || null,
        type: opt.type || 'rect',
        light: opt.light
      });
    }
  }
  api.burst = burst;

  /* --- ロックマン風の爆発：白〜オレンジの玉が円形に飛ぶ --- */
  function explode(x, y, scale, colors) {
    scale = scale || 1;
    colors = colors || ['#FCFCFC', '#FCE0A8', '#FC9838', '#F87858'];
    var n = Math.round(10 * scale);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + U.rnd() * 0.25;
      var s = (1.4 + U.rnd() * 1.5) * scale;
      part({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        drag: 0.965, life: 26 * scale, size: 3 * scale,
        color: colors[0], color2: colors[2], type: 'circle', light: true
      });
    }
    // 内側の細かい破片
    burst(x, y, Math.round(8 * scale), {
      speed: 3 * scale, life: 20, size: 2, colors: colors, drag: 0.93, grav: 0.06
    });
    ring(x, y, 2, 22 * scale, 10, '#FCE0A8');
  }
  api.explode = explode;

  /* --- 大爆発（ボス撃破用） --- */
  function explodeBig(x, y, colors) {
    colors = colors || ['#FCFCFC', '#FCE0A8', '#FC9838', '#D82800'];
    for (var k = 0; k < 3; k++) {
      var n = 14;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + k * 0.3;
        var s = 1.2 + k * 0.9 + U.rnd();
        part({
          x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          drag: 0.975, life: 40 + k * 12, size: 4 - k * 0.5,
          color: colors[k % colors.length], color2: colors[3],
          type: 'circle', light: true
        });
      }
    }
    burst(x, y, 26, { speed: 4.5, life: 42, size: 2, colors: colors, drag: 0.94, grav: 0.05 });
    ring(x, y, 3, 60, 24, '#FCFCFC');
    ring(x, y, 3, 40, 18, '#FC9838');
  }
  api.explodeBig = explodeBig;

  /* --- キラキラ（1UP・回復アイテム用） --- */
  function sparkle(x, y, n, color) {
    for (var i = 0; i < (n || 8); i++) {
      part({
        x: x + U.rndRange(-8, 8), y: y + U.rndRange(-8, 8),
        vx: U.rndRange(-0.4, 0.4), vy: U.rndRange(-1.4, -0.3),
        life: U.rndInt(20, 40), size: U.rndInt(1, 3),
        color: color || '#FCFCFC', type: 'star', light: true
      });
    }
  }
  api.sparkle = sparkle;

  /* --- 着地・走行の土煙 --- */
  function dust(x, y, dir) {
    for (var i = 0; i < 4; i++) {
      part({
        x: x, y: y,
        vx: (dir || U.rndRange(-1, 1)) * U.rndRange(0.3, 1.1),
        vy: U.rndRange(-0.8, -0.1),
        drag: 0.9, life: U.rndInt(10, 18), size: 2,
        color: '#BCBCBC', color2: '#7C7C7C', type: 'rect'
      });
    }
  }
  api.dust = dust;

  /* --- 弾が壁に当たったときの小さな火花 --- */
  function ricochet(x, y, color) {
    burst(x, y, 5, { speed: 1.8, life: 12, size: 2, color: color || '#FCE0A8', drag: 0.9, light: true });
  }
  api.ricochet = ricochet;

  /* --- 破片（岩・氷などが砕ける） --- */
  function debris(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      part({
        x: x, y: y,
        vx: U.rndRange(-2.2, 2.2), vy: U.rndRange(-3.2, -0.6),
        grav: 0.16, drag: 0.99, life: U.rndInt(28, 48),
        size: U.rndInt(2, 4), color: U.pick(colors || ['#8C4A20', '#D8A860']),
        type: 'rect', shrink: false, spin: U.rndRange(-0.3, 0.3)
      });
    }
  }
  api.debris = debris;

  /* ======================================================================
     衝撃波リング
     ====================================================================== */
  function ring(x, y, r0, r1, life, color, thick) {
    if (rings.length > 24) rings.shift();
    rings.push({ x: x, y: y, r0: r0, r1: r1, life: life, maxLife: life, color: color, t: thick || 1 });
  }
  api.ring = ring;

  /* ======================================================================
     浮かび上がる文字（「1UP」「WEAPON GET」などの小演出）
     ====================================================================== */
  function floatText(str, x, y, color, scale) {
    texts.push({ str: str, x: x, y: y, vy: -0.45, life: 52, maxLife: 52,
                 color: color || '#FCFCFC', scale: scale || 1 });
  }
  api.floatText = floatText;

  /* ======================================================================
     画面全体の演出
     ====================================================================== */
  function shake(amount, frames) {
    // 既に強く揺れているときは上書きしない（弱い揺れで打ち消さない）
    if (amount >= shakeAmt || shakeTime <= 0) {
      shakeAmt = amount; shakeTime = frames; shakeMax = frames;
    }
  }
  api.shake = shake;

  function flash(color, frames, peak) {
    flashCol = color || '#FCFCFC';
    flashTime = frames; flashMax = frames;
    flashPeak = peak === undefined ? 0.85 : peak;
  }
  api.flash = flash;

  // factor=0.3 なら 30% の速度。frames フレームかけて元に戻る
  function slowmo(factor, frames) {
    slowFactor = factor; slowTime = frames;
  }
  api.slowmo = slowmo;

  /* ======================================================================
     更新
     ====================================================================== */
  function update() {
    var i, p;

    // --- パーティクル ---
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.grav;
      p.vx *= p.drag; p.vy *= p.drag;
      p.rot += p.spin;
      p.life--;
      if (p.life <= 0) p.dead = true;
    }
    U.sweep(parts);

    // --- リング ---
    for (i = 0; i < rings.length; i++) {
      rings[i].life--;
      if (rings[i].life <= 0) rings[i].dead = true;
    }
    U.sweep(rings);

    // --- 浮遊テキスト ---
    for (i = 0; i < texts.length; i++) {
      texts[i].y += texts[i].vy;
      texts[i].vy *= 0.96;
      texts[i].life--;
      if (texts[i].life <= 0) texts[i].dead = true;
    }
    U.sweep(texts);

    // --- 画面シェイク（減衰する） ---
    if (shakeTime > 0) {
      shakeTime--;
      var k = shakeTime / shakeMax;
      var a = shakeAmt * k;
      api.shakeX = U.rndRange(-a, a);
      api.shakeY = U.rndRange(-a, a);
      if (shakeTime <= 0) { api.shakeX = api.shakeY = 0; shakeAmt = 0; }
    } else { api.shakeX = api.shakeY = 0; }

    // --- フラッシュ ---
    if (flashTime > 0) flashTime--;

    // --- スローモー ---
    if (slowTime > 0) {
      slowTime--;
      api.timeScale = slowFactor;
      if (slowTime <= 0) api.timeScale = 1;
    } else api.timeScale = 1;
  }
  api.update = update;

  /* ======================================================================
     描画（カメラのオフセットを引いてワールド座標→画面座標に）
     ====================================================================== */
  function draw(camX, camY) {
    camX = camX || 0; camY = camY || 0;
    var ctx = G.gfx.ctx;
    var i, p, sx, sy;

    ctx.save();
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      var t = p.life / p.maxLife;
      sx = p.x - camX; sy = p.y - camY;
      if (sx < -20 || sx > G.gfx.W + 20 || sy < -20 || sy > G.gfx.H + 20) continue;

      ctx.globalAlpha = p.fade ? Math.min(1, t * 1.6) : 1;
      if (p.light) ctx.globalCompositeOperation = 'lighter';

      var col = (p.color2 && t < 0.5) ? p.color2 : p.color;
      var s = p.shrink ? Math.max(1, p.size * (0.35 + t * 0.65)) : p.size;

      if (p.type === 'circle') {
        G.gfx.blob(sx, sy, Math.max(1, s), col);
      } else if (p.type === 'star') {
        ctx.fillStyle = col;
        ctx.fillRect((sx - s) | 0, sy | 0, s * 2, 1);
        ctx.fillRect(sx | 0, (sy - s) | 0, 1, s * 2);
      } else if (p.type === 'spark') {
        ctx.fillStyle = col;
        ctx.fillRect(sx | 0, sy | 0, Math.max(1, s), 1);
      } else {
        ctx.fillStyle = col;
        ctx.fillRect((sx - s / 2) | 0, (sy - s / 2) | 0, Math.max(1, s | 0), Math.max(1, s | 0));
      }
      if (p.light) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // --- リング ---
    ctx.save();
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      var k = 1 - r.life / r.maxLife;
      ctx.globalAlpha = (1 - k) * 0.9;
      G.gfx.ring(r.x - camX, r.y - camY, r.r0 + (r.r1 - r.r0) * U.ease.outQuad(k), r.color, r.t);
    }
    ctx.restore();

    // --- 浮遊テキスト ---
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, tx.life / tx.maxLife * 2);
      G.gfx.text(tx.str, tx.x - camX, tx.y - camY, {
        align: 'center', color: tx.color, scale: tx.scale, shadow: '#000'
      });
      ctx.restore();
    }
  }
  api.draw = draw;

  // 画面全体のフラッシュは他の描画の後（HUDより手前）に出す
  function drawFlash() {
    if (flashTime > 0) {
      var a = (flashTime / flashMax) * flashPeak;
      G.gfx.veil(flashCol, a);
    }
  }
  api.drawFlash = drawFlash;

  function reset() {
    parts.length = 0; rings.length = 0; texts.length = 0;
    shakeTime = 0; flashTime = 0; slowTime = 0;
    api.timeScale = 1; api.shakeX = api.shakeY = 0;
  }
  api.reset = reset;

  api.get = function () { return { parts: parts, rings: rings }; };
  return api;
})();
