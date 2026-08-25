/* =========================================================================
   input.js  --  入力（タッチ最優先／キーボードは開発&PC用のおまけ）

   ・左下：フローティング仮想スティック（触った場所が中心になる方式）
   ・右下：JUMP / SHOT の大きめ丸ボタン
   ・右上：武器切替、左上：ポーズ
   ・ボタンはキャンバスに直接描くので、拡大率が変わってもズレない

   状態は「押した瞬間(pressed)」「押しっぱなし(held)」「離した瞬間(released)」の
   3種類を毎フレーム更新する。長押しチャージは held の継続時間で判定する。
   ========================================================================= */
G.input = (function () {
  'use strict';
  var U = G.util;

  var BTN = ['left', 'right', 'up', 'down', 'jump', 'shot', 'weapon', 'pause', 'start'];

  var held = {}, pressed = {}, released = {}, prevHeld = {};
  BTN.forEach(function (b) { held[b] = pressed[b] = released[b] = prevHeld[b] = false; });

  var api = {
    axisX: 0,            // -1..1（アナログ量。歩行はしきい値で0/1化する）
    held: held,
    pressed: pressed,
    released: released,
    shotHeldFrames: 0,   // チャージ判定用
    anyPressed: false,   // タイトルの「PRESS START」用
    touchCount: 0,
    stick: { active: false, cx: 0, cy: 0, x: 0, y: 0 },  // 描画用
    taps: [],            // このフレームに発生したタップ（メニューの直接選択用）
    visible: true        // コントローラを描くか（デモやカットシーンでは隠す）
  };

  /* ---------------- レイアウト（画面サイズから毎回計算） ---------------- */
  var L = {};
  function layout() {
    var W = G.gfx.W, H = G.gfx.H;
    L.stickBase = { x: 40, y: H - 42, r: 26 };   // スティックの定位置
    L.stickZone = { x: 0, y: H * 0.30, w: W * 0.42, h: H };  // ここを触るとスティック
    L.jump   = { x: W - 34, y: H - 34, r: 23, label: 'JUMP' };
    L.shot   = { x: W - 84, y: H - 46, r: 23, label: 'SHOT' };
    L.weapon = { x: W - 20, y: 20,     r: 15, label: 'WPN'  };
    L.pause  = { x: W - 54, y: 16,     r: 11, label: 'II'   };
    return L;
  }
  api.layout = layout;

  /* ---------------- 座標変換：画面座標 → 仮想解像度座標 ---------------- */
  function toVirtual(clientX, clientY) {
    return {
      x: (clientX - G.gfx.offX) / G.gfx.scale,
      y: (clientY - G.gfx.offY) / G.gfx.scale
    };
  }
  function inCircle(p, c) {
    var dx = p.x - c.x, dy = p.y - c.y;
    // 指は太いので当たり判定は見た目より一回り大きくする（押しやすさ優先）
    var r = c.r + 10;
    return dx * dx + dy * dy <= r * r;
  }

  /* ---------------- タッチの割り当て管理 ----------------
     touchId -> { type:'stick'|'btn', name }                                 */
  var touches = {};
  var pendingTaps = [];   // フレーム間に発生したタップを溜めておく
  var touchHeld = {};   // タッチ由来の押下状態
  // 「押した」ラッチ：押下が1フレーム未満でも必ず1回は pressed が立つようにする。
  // （素早いタップやキー連打が取りこぼされるのを防ぐ）
  var latch = {};
  function clearTouchHeld() { BTN.forEach(function (b) { touchHeld[b] = false; latch[b] = false; }); }
  clearTouchHeld();
  function pressLatch(name) { touchHeld[name] = true; latch[name] = true; }

  function assign(id, p) {
    layout();
    // タップ判定のため、開始位置と時刻を覚えておく
    var meta = { sx: p.x, sy: p.y, st: Date.now(), moved: 0 };
    // ボタンを先に判定（重なった場合はボタン優先）
    var btns = [['jump', L.jump], ['shot', L.shot], ['weapon', L.weapon], ['pause', L.pause]];
    for (var i = 0; i < btns.length; i++) {
      if (inCircle(p, btns[i][1])) {
        touches[id] = { type: 'btn', name: btns[i][0], meta: meta };
        pressLatch(btns[i][0]);
        return;
      }
    }
    // 左側エリアならスティック
    if (p.x < G.gfx.W * 0.45) {
      touches[id] = { type: 'stick', ox: p.x, oy: p.y, meta: meta };
      api.stick.active = true;
      api.stick.cx = p.x; api.stick.cy = p.y;
      api.stick.x = p.x;  api.stick.y = p.y;
      return;
    }
    // それ以外（画面中央〜右の空白）は「決定/スタート」扱いにする
    touches[id] = { type: 'btn', name: 'start', meta: meta };
    pressLatch('start');
  }

  function moveTouch(id, p) {
    var t = touches[id];
    if (!t) return;
    if (t.meta) {
      var mdx = p.x - t.meta.sx, mdy = p.y - t.meta.sy;
      t.meta.moved = Math.max(t.meta.moved, Math.sqrt(mdx * mdx + mdy * mdy));
      t.meta.lx = p.x; t.meta.ly = p.y;
    }
    if (t.type === 'stick') {
      api.stick.x = p.x; api.stick.y = p.y;
      var dx = p.x - t.ox, dy = p.y - t.oy;
      var maxR = 26;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxR) { // 引っ張りすぎたら中心を追従させる（指がズレても操作不能にならない）
        t.ox += dx * (1 - maxR / d);
        t.oy += dy * (1 - maxR / d);
        api.stick.cx = t.ox; api.stick.cy = t.oy;
        dx = p.x - t.ox; dy = p.y - t.oy;
      }
      var dead = 5;                       // 遊び。指の微ブレで動かないように
      touchHeld.left  = dx < -dead;
      touchHeld.right = dx >  dead;
      touchHeld.up    = dy < -dead * 2;   // 上下は誤爆しやすいので鈍く
      touchHeld.down  = dy >  dead * 2;
      api.axisX = U.clamp(dx / maxR, -1, 1);
    }
  }

  function endTouch(id) {
    var t = touches[id];
    if (!t) return;
    // 短く・ほとんど動かずに離した＝「タップ」としてメニュー側へ渡す
    if (t.meta && t.meta.moved < 14 && (Date.now() - t.meta.st) < 500) {
      pendingTaps.push({ x: t.meta.sx, y: t.meta.sy });
    }
    if (t.type === 'stick') {
      api.stick.active = false;
      touchHeld.left = touchHeld.right = touchHeld.up = touchHeld.down = false;
      api.axisX = 0;
    } else {
      touchHeld[t.name] = false;
    }
    delete touches[id];
  }

  /* ---------------- DOM イベント登録 ---------------- */
  function bind(el) {
    function tstart(e) {
      // ダブルタップズームやスクロールを完全に止める
      if (e.cancelable) e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        assign(t.identifier, toVirtual(t.clientX, t.clientY));
      }
      api.touchCount = e.touches.length;
    }
    function tmove(e) {
      if (e.cancelable) e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        moveTouch(t.identifier, toVirtual(t.clientX, t.clientY));
      }
    }
    function tend(e) {
      if (e.cancelable) e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) endTouch(e.changedTouches[i].identifier);
      api.touchCount = e.touches.length;
    }
    el.addEventListener('touchstart',  tstart, { passive: false });
    el.addEventListener('touchmove',   tmove,  { passive: false });
    el.addEventListener('touchend',    tend,   { passive: false });
    el.addEventListener('touchcancel', tend,   { passive: false });

    // --- マウス（PCで同じUIを試せるように。IDは -1 固定） ---
    var mouseDown = false;
    el.addEventListener('mousedown', function (e) {
      mouseDown = true; assign(-1, toVirtual(e.clientX, e.clientY));
    });
    window.addEventListener('mousemove', function (e) {
      if (mouseDown) moveTouch(-1, toVirtual(e.clientX, e.clientY));
    });
    window.addEventListener('mouseup', function () { mouseDown = false; endTouch(-1); });

    // --- キーボード（開発用／PCプレイ用） ---
    var KEYMAP = {
      ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
      ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
      KeyZ:'shot', KeyJ:'shot',
      KeyX:'jump', KeyK:'jump', Space:'jump',
      KeyC:'weapon', KeyL:'weapon', ShiftLeft:'weapon', KeyQ:'weapon',
      Enter:'start', Escape:'pause', KeyP:'pause'
    };
    var keyHeld = {};
    window.addEventListener('keydown', function (e) {
      var b = KEYMAP[e.code];
      if (b) { keyHeld[b] = true; latch[b] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
      var b = KEYMAP[e.code];
      if (b) { keyHeld[b] = false; e.preventDefault(); }
    });
    api._keyHeld = keyHeld;

    // ブラウザのコンテキストメニュー（長押しで出る）を殺す
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // タブ非表示になったら全入力をリセット（押しっぱなし事故を防ぐ）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { touches = {}; pendingTaps.length = 0; clearTouchHeld(); api.stick.active = false; api.axisX = 0; }
    });
  }

  /* ---------------- 毎フレームの状態更新 ---------------- */
  function update() {
    // 前フレームからこのフレームまでに溜まったタップを公開し、バッファを空にする
    api.taps.length = 0;
    for (var ti = 0; ti < pendingTaps.length; ti++) api.taps.push(pendingTaps[ti]);
    pendingTaps.length = 0;
    api.anyPressed = false;
    for (var i = 0; i < BTN.length; i++) {
      var b = BTN[i];
      prevHeld[b] = held[b];
      held[b] = !!(touchHeld[b] || api._keyHeld[b] || latch[b]);
      latch[b] = false;                       // ラッチは1フレームだけ有効
      pressed[b]  = held[b] && !prevHeld[b];
      released[b] = !held[b] && prevHeld[b];
      if (pressed[b]) api.anyPressed = true;
    }
    // キーボードで動かしたときも axisX を埋める
    if (!api.stick.active) {
      api.axisX = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    }
    api.shotHeldFrames = held.shot ? api.shotHeldFrames + 1 : 0;
  }

  // シーン切り替え時に押下状態をリセット（前シーンのタップが誤爆しないように）
  function consumeAll() {
    BTN.forEach(function (b) { prevHeld[b] = held[b] = true; pressed[b] = released[b] = false; latch[b] = false; });
    api.anyPressed = false;
  }

  /* ---------------- コントローラの描画 ----------------
     ゲーム画面と同じキャンバスに描くのでピクセル感が統一される        */
  function drawControls(alpha) {
    if (!api.visible) return;
    var ctx = G.gfx.ctx, P = G.gfx.PAL;
    alpha = alpha === undefined ? 1 : alpha;
    if (alpha <= 0) return;
    layout();
    ctx.save();
    ctx.globalAlpha = 0.42 * alpha;

    // --- 仮想スティック ---
    var base = api.stick.active ? { x: api.stick.cx, y: api.stick.cy, r: L.stickBase.r } : L.stickBase;
    G.gfx.circle(base.x, base.y, base.r, '#0A1420');
    G.gfx.ring(base.x, base.y, base.r, P.lblue, 2);
    var kx = base.x, ky = base.y;
    if (api.stick.active) {
      var dx = U.clamp(api.stick.x - base.x, -base.r, base.r);
      var dy = U.clamp(api.stick.y - base.y, -base.r, base.r);
      kx += dx; ky += dy;
      ctx.globalAlpha = 0.75 * alpha;
    }
    G.gfx.circle(kx, ky, 11, P.lblue);
    G.gfx.circle(kx, ky, 8, P.white);

    // --- 丸ボタン共通の描画 ---
    function button(c, label, col, isHeld, scale) {
      ctx.globalAlpha = (isHeld ? 0.85 : 0.42) * alpha;
      var r = c.r + (isHeld ? -1 : 0);
      G.gfx.circle(c.x, c.y, r, isHeld ? col : '#0A1420');
      G.gfx.ring(c.x, c.y, r, col, 2);
      ctx.globalAlpha = (isHeld ? 1 : 0.75) * alpha;
      G.gfx.text(label, c.x, c.y - 3, {
        align: 'center', scale: scale || 1,
        color: isHeld ? '#001428' : P.white
      });
    }
    button(L.shot,   'SHOT', P.yellow, held.shot);
    button(L.jump,   'JUMP', P.lgreen, held.jump);
    button(L.weapon, 'WPN',  P.pink,   held.weapon);
    button(L.pause,  'II',   P.lgray,  held.pause);

    ctx.restore();
  }

  api.bind = bind;
  api.update = update;
  api.consumeAll = consumeAll;
  api.drawControls = drawControls;
  api.toVirtual = toVirtual;
  return api;
})();
