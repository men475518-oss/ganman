/* =========================================================================
   scenes/stage.js  --  ステージ本編

   フェーズの流れ:
     intro   … 暗転明け → READY → テレポート着地 → 小ジャンプ → GO!
     play    … 通常プレイ（スクロール／敵／アイテム）
     door    … ボス部屋の扉が開いて中へ歩いていく
     bossin  … ボス登場（落下 or スライドイン）＋名前表示
     boss    … ボス戦
     dying   … ボス撃破演出（スロー＋爆発＋無音＋ファンファーレ）
     dead    … やられ演出 → 復活 or ゲームオーバー
     pause   … ポーズメニュー（武器選択・E缶）
   ========================================================================= */
G.scenes.stage = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles, WP = G.weapons, BS = G.bosses;

  var st = null;      // 現在のステージ状態（オブジェクトにまとめておく）

  /* ======================================================================
     初期化
     ====================================================================== */
  function enter(params) {
    var key = (params && params.key) || 'cut';
    var data = G.stages.build(key);

    var level = TL.makeLevel(data.rows, data.theme);
    TL.setLevel(level);

    st = {
      key: key,
      data: data,
      level: level,
      theme: data.theme,

      player: new G.Player(data.playerStart.x, data.playerStart.y),
      enemies: [], shots: [], hazards: [], items: [],
      spawners: [],
      boss: null,

      camX: 0, camY: 0,
      zoom: 1, zoomTarget: 1, zoomTimer: 0,

      phase: 'intro',
      phaseT: 0,
      introStep: 0,
      t: 0,

      checkpoint: null,       // 中間ポイントを通過したら入る
      midBoss: null,          // 中ボス（戦闘中だけ入る）
      midBossDone: false,
      lockArena: null,        // カメラを固定する部屋（中ボス戦で使う）
      tanks: G.game.tanks || 0,
      deathT: 0,
      clearT: 0,
      pauseSel: 0,
      pausedFrom: 'play',
      doorOpen: 0,
      bossNameT: 0,
      silence: 0,            // 撃破後の「短い無音」用
      bigMsg: null           // 画面中央に大きく出すメッセージ
    };

    // プレイヤーに引き継ぎデータを反映
    var pl = st.player;
    pl.lives = G.game.lives;
    pl.weapons = G.game.weapons.slice();
    pl.weaponIndex = 0;
    for (var id in G.game.ammo) if (G.game.ammo.hasOwnProperty(id)) pl.ammo[id] = G.game.ammo[id];
    pl.controlEnabled = false;

    // 敵の出現ポイント（画面に入ったら湧く／出たら消える＝原作方式）
    data.spawns.forEach(function (sp) {
      st.spawners.push({ type: sp.type, x: sp.x, y: sp.y, opts: sp.opts, entity: null, armed: true });
    });
    // 固定配置アイテム
    data.items.forEach(function (it) {
      st.items.push(new G.items.Item(it.kind, it.x, it.y - 8, { permanent: true }));
    });

    G.fx.reset();
    G.input.visible = false;      // READY/GO の間はパッドを隠す
    G.music.stop();
    updateCamera(true);
  }

  function exit() {
    G.input.visible = true;
    A.chargeStop();
  }

  /* ======================================================================
     ステージ側がゲーム部品に提供する機能（弾やボスから呼ばれる）
     ====================================================================== */
  function makeApi() {
    st.spawnBlast = function (x, y, radius, dmg, element, team) {
      var b = new WP.Blast(x, y, radius, dmg, element, team || 'player');
      st.shots.push(b);
      G.fx.explode(x, y, radius / 24);
      A.sfx.explode();
      G.fx.shake(3, 14);
      return b;
    };
    st.dropItem = function (x, y) { st.items.push(G.items.randomDrop(x, y)); };
    st.requestZoom = function (z, frames) {
      st.zoomTarget = z; st.zoomTimer = frames;
    };
    /* 画面中央に大きく文字を出す（ラスボスの形態変化などで使う） */
    st.showBigMessage = function (text, color, frames) {
      st.bigMsg = { text: text, color: color || '#FCFCFC', t: 0, max: frames || 120 };
    };

    /* --- 中ボス --- */
    st.onMidBossDying = function () {
      // 撃破演出中に残り弾で死なないよう、敵の攻撃を消す
      for (var i = 0; i < st.shots.length; i++) {
        if (st.shots[i].team === 'enemy') st.shots[i].dead = true;
      }
      for (var j = 0; j < st.hazards.length; j++) st.hazards[j].dead = true;
      st.player.invul = 99999;
      G.music.fadeOut(0.3);
    };
    st.onMidBossDefeated = function () {
      st.midBossDone = true;
      st.midBoss = null;
      st.lockArena = null;
      st.phase = 'play';
      st.player.invul = 60;
      st.player.controlEnabled = true;
      // ごほうび（回復と武器エネルギー）
      var mb = st.data.midBoss;
      var cx = (mb.arena.x0 + mb.arena.x1) / 2;
      st.items.push(new G.items.Item('hpBig', cx - 14, mb.arena.floorY - 20, { permanent: true }));
      st.items.push(new G.items.Item('wpBig', cx + 14, mb.arena.floorY - 20, { permanent: true }));
      G.fx.floatText('CLEAR!', cx, mb.arena.floorY - 60, '#F8D878', 2);
      G.music.play(st.theme.bgm, { restart: true });
    };

    st.onBossDying = function () {
      st.phase = 'dying'; st.phaseT = 0;
      // 撃破演出中に残り弾で死ぬのは理不尽なので、敵の攻撃を全部消して無敵にする
      // （配列を作り直すと当たり判定のループ中に壊れるので dead フラグで消す）
      for (var i = 0; i < st.shots.length; i++) {
        if (st.shots[i].team === 'enemy') st.shots[i].dead = true;
      }
      for (var j = 0; j < st.hazards.length; j++) st.hazards[j].dead = true;
      st.player.invul = 99999;
      G.music.fadeOut(0.5);
    };
    st.onBossDefeated = function () {
      st.silence = 46;   // 大爆発のあと少し無音にしてから勝利ファンファーレ
    };
  }

  /* ======================================================================
     カメラ
     ====================================================================== */
  function updateCamera(snap) {
    var pl = st.player;
    var viewW = gfx.W / st.zoom;
    var viewH = gfx.H / st.zoom;
    var lv = st.level;

    var tx, ty;

    var bossPhase = (st.phase === 'door' || st.phase === 'bossin' || st.phase === 'boss' ||
                     st.phase === 'dying' || st.phase === 'clear');
    if (bossPhase || st.lockArena) {
      /* --- ボス部屋のカメラ ---
         アリーナ幅(432px)は画面幅(端末により256〜400px)より広いので、
         中央固定にするとプレイヤーが端に行ったとき画面外に消えてしまう。
         そこでプレイヤーを追う方式にし、次の3段階で位置を決める。
           ① 基本はプレイヤーとボスの中間（やや自機寄り）を見る
           ② プレイヤーが画面端に張り付かないよう必ず余白を確保する
           ③ アリーナから大きく外れない（壁を少し見せる程度の余裕は持つ）
         縦は固定のまま。床を画面の64%の高さに置くことで、
         戦闘が仮想パッドより上で行われ、指でキャラが隠れない。        */
      var ar = bossPhase ? st.data.boss.arena : st.lockArena;
      var foe = (st.boss && !st.boss.dead) ? st.boss
              : ((st.midBoss && !st.midBoss.dead) ? st.midBoss : null);
      var pcx = pl.cx();
      var bcx = foe ? foe.cx() : pcx;

      // ① 自機寄りの中間点を見る（ボスもなるべく画面に残す）
      tx = (pcx + (bcx - pcx) * 0.35) - viewW / 2;

      // ② プレイヤーの画面内位置に下限・上限を設ける
      var margin = Math.min(76, viewW * 0.24);
      tx = U.clamp(tx, pcx + margin - viewW, pcx - margin);

      // ③ アリーナの範囲に収める（扉から入ってくる間は扉側も映す）
      var pad = 34;
      var leftLimit = (st.phase === 'door') ? (st.data.boss.doorX - 90) : (ar.x0 - pad);
      tx = U.clamp(tx, leftLimit, ar.x1 - viewW + pad);

      ty = ar.floorY - viewH * 0.64;
    } else {
      // 通常：プレイヤーを画面の少し左寄りに置く
      tx = pl.cx() - viewW * 0.42;
      // 縦は「遊び」を持たせて追う（細かい上下でカメラが揺れないように）
      var py = pl.cy();
      var top = st.camY + viewH * 0.32, bot = st.camY + viewH * 0.62;
      ty = st.camY;
      if (py < top) ty = py - viewH * 0.32;
      else if (py > bot) ty = py - viewH * 0.62;
    }

    tx = U.clamp(tx, 0, Math.max(0, lv.pxW - viewW));
    ty = U.clamp(ty, 0, Math.max(0, lv.pxH - viewH));

    if (snap) { st.camX = tx; st.camY = ty; }
    else {
      st.camX = U.lerp(st.camX, tx, 0.22);
      st.camY = U.lerp(st.camY, ty, 0.12);
    }
  }

  /* ======================================================================
     敵の湧き／消え（原作準拠：画面外に出ると消え、戻ると復活）
     ====================================================================== */
  function updateSpawners() {
    var viewW = gfx.W / st.zoom, viewH = gfx.H / st.zoom;
    var L = st.camX - 48, R = st.camX + viewW + 48;
    var farL = st.camX - viewW * 0.8, farR = st.camX + viewW * 1.8;

    for (var i = 0; i < st.spawners.length; i++) {
      var s = st.spawners[i];
      if (s.entity) {
        // 画面から大きく離れたら消す（次に近づいた時に復活する）
        if (s.entity.dead) { s.entity = null; }
        else if (s.entity.x < farL || s.entity.x > farR) { s.entity.dead = true; s.entity = null; s.armed = true; }
      } else {
        if (s.x < L || s.x > R) { s.armed = true; continue; }
        if (!s.armed) continue;
        // 縦にも離れすぎていたら湧かせない
        if (s.y < st.camY - 64 || s.y > st.camY + viewH + 64) continue;
        var e = G.enemies.create(s.type, s.x, s.y, s.opts);
        if (!e) continue;
        e.x = s.x - e.w / 2;
        e.y = s.y - e.h;
        if (s.type === 'plat') { e.ox = e.x; e.oy = e.y; }
        e.spawner = s;
        s.entity = e;
        s.armed = false;
        st.enemies.push(e);
      }
    }
  }

  /* ======================================================================
     当たり判定
     ====================================================================== */
  function collisions() {
    var pl = st.player, i, j;

    /* --- プレイヤーの弾 vs 敵/ボス --- */
    for (i = 0; i < st.shots.length; i++) {
      var s = st.shots[i];
      if (s.dead || s.team !== 'player') continue;

      // 雑魚敵
      for (j = 0; j < st.enemies.length; j++) {
        var e = st.enemies[j];
        if (e.dead || e.isPlatform) continue;
        if (!U.overlap(s.hitbox(), e.hitbox())) continue;
        // 無敵の相手、または盾で正面を守っている相手には弾かれる
        var blocked = e.blocks(s);
        if (e.invulnerable || blocked) {
          A.sfx.deflect();
          G.fx.ricochet(s.cx(), s.cy(), blocked ? '#BCE8FC' : '#FCFCFC');
          if (blocked) e.deflectGlow = 8;
          if (!s.pierce) s.dead = true;
          continue;
        }
        if (s.freeze) e.freezeMe(s.freeze);
        e.damage(s.dmg, s.element, st);
        if (s.onHit(e, st)) s.dead = true;
        if (s.dead) break;
      }
      if (s.dead) continue;

      // ボス
      var b = st.boss;
      if (b && !b.dead && b.state !== 'entrance' && U.overlap(s.hitbox(), b.hitbox())) {
        if (s.freeze) b.frozen = Math.min(60, s.freeze / 3);
        b.damage(s.dmg, s.element, st, s);
        if (s.onHit(b, st)) s.dead = true;
      }
    }

    /* --- 敵の弾・ハザード vs プレイヤー ---
       弾は dmg、敵本体は contactDmg を持つので取り違えないようにする      */
    function hurtPlayer(src, amount) {
      if (pl.invul > 0 || pl.state === 'dead') return;
      var dmg = (amount === undefined) ? src.dmg : amount;
      if (!(dmg > 0)) return;                       // undefined/NaN を弾く
      pl.damage(dmg, src.cx ? src.cx() : src.x);
    }
    for (i = 0; i < st.shots.length; i++) {
      var es = st.shots[i];
      if (es.dead || es.team !== 'enemy') continue;
      if (U.overlap(es.hitbox(), pl.hitbox())) {
        hurtPlayer(es);
        if (es.onHit(pl, st)) es.dead = true;
      }
    }
    for (i = 0; i < st.hazards.length; i++) {
      var hz = st.hazards[i];
      if (hz.dead) continue;
      if (U.overlap(hz.hitbox(), pl.hitbox())) hurtPlayer(hz);
    }

    /* --- 敵本体 vs プレイヤー（接触ダメージ） --- */
    for (i = 0; i < st.enemies.length; i++) {
      var en = st.enemies[i];
      if (en.dead || en.isPlatform || !en.contactDmg) continue;
      if (en.frozen > 0) continue;
      if (U.overlap(en.hitbox(), pl.hitbox())) hurtPlayer(en, en.contactDmg);
    }
    if (st.boss && !st.boss.dead && st.boss.state === 'fight' &&
        U.overlap(st.boss.hitbox(), pl.hitbox())) {
      hurtPlayer(st.boss, st.boss.contactDmg);
    }

    /* --- アイテム --- */
    for (i = 0; i < st.items.length; i++) {
      var it = st.items[i];
      if (it.dead) continue;
      if (U.overlap(it.hitbox(), pl.hitbox())) it.collect(st);
    }

    /* --- 動く足場に乗る --- */
    for (i = 0; i < st.enemies.length; i++) {
      var p = st.enemies[i];
      if (!p.isPlatform) continue;
      var feet = pl.y + pl.h;
      var prevFeet = pl.prevY + pl.h;
      if (pl.vy >= 0 &&
          pl.x + pl.w > p.x + 2 && pl.x < p.x + p.w - 2 &&
          feet >= p.y && feet <= p.y + 12 && prevFeet <= p.y + 4) {
        pl.y = p.y - pl.h;
        pl.vy = 0;
        pl.onGround = true;
        // 足場と一緒に運ばれる
        pl.x += p.x - p.prevX;
        pl.y += p.y - p.prevY;
      }
    }
  }

  /* ======================================================================
     フェーズごとの進行
     ====================================================================== */

  /* --- 開始演出 --- */
  function updateIntro() {
    var pl = st.player;
    st.phaseT++;
    var t = st.phaseT;

    if (t === 8) {
      // 短いファンファーレ
      [523, 659, 784].forEach(function (f, i) {
        A.tone({ type: 'square', freq: f, dur: 0.14, vol: 0.22, delay: i * 0.09 });
      });
    }
    if (t === 76) { pl.startTeleport(); }

    // テレポート着地 → 小さくジャンプ
    if (st.introStep === 0 && t > 76 && pl.state !== 'teleport') {
      st.introStep = 1;
      pl.vy = -3.6;
      pl.onGround = false;
      A.sfx.jump();
    }
    if (st.introStep === 1) {
      pl.update(st);   // 物理だけ動かす（操作は無効のまま）
      if (pl.onGround && pl.vy >= 0 && st.phaseT > 90) {
        st.introStep = 2;
        st.goT = 0;
        A.sfx.land();
        A.sfx.menuSelect();
        G.fx.flash('#FCFCFC', 6, 0.4);
        G.fx.dust(pl.cx() - 4, pl.y + pl.h, -1);
        G.fx.dust(pl.cx() + 4, pl.y + pl.h, 1);
        G.music.play(st.theme.bgm);
      }
    } else if (st.introStep === 2) {
      st.goT++;
      pl.update(st);
      if (st.goT > 40) {
        st.phase = 'play';
        st.phaseT = 0;
        pl.controlEnabled = true;
        G.input.visible = true;
        G.input.consumeAll();
      }
    } else if (st.introStep === 0 && t > 76) {
      pl.update(st);
    }
  }

  /* --- 通常プレイ --- */
  function updatePlay() {
    var pl = st.player;
    pl.prevY = pl.y;
    pl.update(st);

    // 中間ポイント通過
    var cp = st.data.checkpoint;
    if (!st.checkpoint && cp && pl.cx() > cp.x) {
      st.checkpoint = { x: cp.x, y: cp.y };
      A.sfx.pickup();
      A.sfx.chargeMax();
      G.fx.floatText('CHECK POINT', cp.x, cp.y - 54, '#F8D878');
      G.fx.sparkle(cp.x, cp.y - 40, 16, '#F8D878');
      G.fx.ring(cp.x, cp.y - 40, 3, 34, 18, '#F8D878');
    }

    // 中ボスの部屋に踏み込んだら戦闘開始
    var mb = st.data.midBoss;
    if (mb && !st.midBossDone && !st.midBoss && pl.cx() > mb.triggerX) {
      startMidBoss();
      return;
    }

    // ボス部屋の手前まで来たら扉のシーケンスへ
    if (pl.cx() > st.data.boss.triggerX && pl.onGround) {
      st.phase = 'door'; st.phaseT = 0;
      pl.controlEnabled = false;
      pl.cancelCharge();
      A.sfx.doorOpen();
    }
  }

  /* --- 中ボス戦の開始 --- */
  function startMidBoss() {
    var mb = st.data.midBoss;
    st.phase = 'midboss';
    st.phaseT = 0;
    st.lockArena = mb.arena;
    var b = BS.create('hornet', mb.spawnX, mb.spawnY);
    // 部屋の端に張り付かないよう、内側に寄せた範囲で動かす
    b.arena = { x0: mb.arena.x0 + 18, x1: mb.arena.x1 - 18, floorY: mb.arena.floorY };
    st.midBoss = b;
    st.player.cancelCharge();
    G.music.fadeOut(0.25);
    A.sfx.bossWarn();
    G.fx.flash('#F8D878', 6, 0.35);
    G.fx.shake(2, 12);
  }

  /* --- 中ボス戦 --- */
  function updateMidBoss() {
    var pl = st.player;
    st.phaseT++;
    pl.prevY = pl.y;
    pl.update(st);

    // 部屋の外へは出られない
    var ar = st.data.midBoss.arena;
    if (pl.x < ar.x0 + 2) { pl.x = ar.x0 + 2; if (pl.vx < 0) pl.vx = 0; }
    if (pl.x + pl.w > ar.x1 - 2) { pl.x = ar.x1 - 2 - pl.w; if (pl.vx > 0) pl.vx = 0; }

    var b = st.midBoss;
    if (!b) return;
    b.update(st);
    // 登場ポーズが終わったら戦闘開始（ボスより短め）
    if (b.state === 'pose' && b.actT > 44 && !b.active) {
      b.active = true;
      G.music.play('boss');
    }
  }

  /* --- 扉が開いてボス部屋へ --- */
  function updateDoor() {
    var pl = st.player;
    st.phaseT++;
    var t = st.phaseT;

    // 扉のタイルを消して「開いた」状態にする
    if (t === 14) {
      var d = st.data.boss;
      var tx = Math.floor(d.doorX / TL.T);
      var ty0 = Math.floor((d.arena.floorY - 64) / TL.T);
      for (var y = ty0; y < Math.floor(d.arena.floorY / TL.T); y++) {
        TL.setAt(tx, y, '.'); TL.setAt(tx + 1, y, '.');
      }
      st.doorOpen = 1;
      G.fx.burst(d.doorX + 16, d.arena.floorY - 30, 12,
        { speed: 2, life: 18, size: 2, color: '#00E8D8', light: true });
    }

    // 自動で右に歩かせる
    if (t > 14) {
      pl.face = 1;
      pl.vx = 1.35;
      pl.prevY = pl.y;
      pl.vy = Math.min(pl.vy + 0.25, 7);
      TL.moveX(pl, pl.vx);
      TL.moveY(pl, pl.vy);
      pl.onGround = TL.onGround(pl);
      pl.state = 'run';
      pl.animT++;
      if (pl.animT % 7 === 0) pl.runFrame = (pl.runFrame + 1) % 3;
    }

    // 部屋の中まで入ったら扉を閉じてボス登場へ
    if (pl.cx() > st.data.boss.arena.x0 + 104) {
      pl.vx = 0;
      pl.state = 'idle';
      A.sfx.doorClose();
      // 扉を元に戻す（戻れないようにする）
      var d2 = st.data.boss;
      var tx2 = Math.floor(d2.doorX / TL.T);
      for (var y2 = 0; y2 < Math.floor(d2.arena.floorY / TL.T); y2++) {
        TL.setAt(tx2, y2, '#'); TL.setAt(tx2 + 1, y2, '#');
      }
      st.phase = 'bossin';
      st.phaseT = 0;
      st.bossNameT = 0;
      G.music.fadeOut(0.3);
      // ボスを生成
      var b = BS.create(st.key, d2.spawnX, d2.spawnY);
      // ボスが動ける範囲は壁より少し内側にする（画面端＝指の下に隠れないため）
      b.arena = { x0: d2.arena.x0 + 20, x1: d2.arena.x1 - 34, floorY: d2.arena.floorY };
      st.boss = b;
      st.requestZoom(1.12, 999);   // 少しズームイン
    }
  }

  /* --- ボス登場演出 --- */
  function updateBossIn() {
    var pl = st.player;
    st.phaseT++;
    var b = st.boss;

    pl.prevY = pl.y;
    // プレイヤーは物理だけ効かせる
    pl.vy = Math.min(pl.vy + 0.25, 7);
    TL.moveY(pl, pl.vy);
    pl.onGround = TL.onGround(pl);

    b.update(st);

    // 着地後に名前を表示
    if (b.state === 'pose') {
      st.bossNameT++;
      if (st.bossNameT === 1) A.sfx.bossWarn();
      if (st.bossNameT === 30) { st.requestZoom(1.0, 30); }
      if (st.bossNameT > 96) {
        b.active = true;
        st.phase = 'boss';
        st.phaseT = 0;
        pl.controlEnabled = true;
        G.input.consumeAll();
        G.music.play(st.key === 'final' ? 'final' : 'boss');
      }
    }
  }

  /* --- ボス戦 --- */
  function updateBoss() {
    var pl = st.player;
    pl.prevY = pl.y;
    pl.update(st);
    if (st.boss) st.boss.update(st);
  }

  /* --- ボス撃破演出 --- */
  function updateDying() {
    var pl = st.player;
    st.phaseT++;
    pl.prevY = pl.y;
    pl.controlEnabled = false;
    pl.vx *= 0.85;
    pl.update(st);
    if (st.boss) st.boss.update(st);

    // 大爆発のあとの「無音」→ 勝利ファンファーレ
    if (st.silence > 0) {
      st.silence--;
      if (st.silence === 0) {
        G.music.play('victory', { restart: true });
        pl.state = 'victory';
        st.clearT = 0;
        st.phase = 'clear';
      }
    }
  }

  /* --- クリア（勝利ポーズ → 武器ゲット画面へ） --- */
  function updateClear() {
    st.clearT++;
    var pl = st.player;
    pl.state = 'victory';
    if (st.clearT % 16 === 0) {
      G.fx.sparkle(pl.cx(), pl.cy(), 6, '#FCE0A8');
    }
    // 「STAGE CLEAR」の文字は drawOverlay 側で画面中央に出すので、
    // ここでは光の粒だけを足す（二重表示になっていた）
    if (st.clearT === 40) {
      G.fx.ring(pl.cx(), pl.cy(), 4, 40, 20, '#F8D878');
      G.fx.sparkle(pl.cx(), pl.cy(), 14, '#FCE0A8');
    }
    if (st.clearT > 170) {
      // 進行状況を保存
      G.game.cleared[st.key] = true;
      G.game.lives = pl.lives;
      G.game.tanks = st.tanks;
      for (var id in pl.ammo) if (pl.ammo.hasOwnProperty(id)) G.game.ammo[id] = pl.ammo[id];

      // 最終ステージには奪う武器が無いので、そのままエンディングへ
      if (st.key === 'final') {
        G.scene.go('ending', null, { fade: 40 });
        return;
      }

      var dropId = st.boss.drop;
      if (dropId && G.game.weapons.indexOf(dropId) < 0) G.game.weapons.push(dropId);
      if (dropId) G.game.ammo[dropId] = G.Player.MAX_AMMO;
      G.scene.go('weaponget', { weapon: dropId, boss: st.key }, { fade: 30 });
    }
  }

  /* --- やられ --- */
  function updateDead() {
    st.deathT++;
    if (st.deathT === 1) { G.music.fadeOut(0.4); A.chargeStop(); }
    if (st.deathT > 130) {
      var pl = st.player;
      pl.lives--;
      G.game.lives = pl.lives;
      if (pl.lives < 0) {
        st.phase = 'gameover';
        st.phaseT = 0;
        st.pauseSel = 0;          // ポーズメニューと共用なので YES に戻す
        G.music.play('gameover', { restart: true });
      } else {
        respawn();
      }
    }
  }

  function respawn() {
    var pl = st.player;
    var sp = st.checkpoint || st.data.playerStart;
    pl.x = sp.x - pl.w / 2;
    pl.y = sp.y - pl.h;
    pl.vx = pl.vy = 0;
    pl.hp = pl.maxHp;
    pl.invul = 60;
    pl.state = 'idle';
    pl.dead = false;
    pl.deathTimer = 0;
    pl.hurtTimer = 0;
    pl.controlEnabled = false;
    pl.climbing = false;

    // 敵と弾を全部リセット
    st.shots.length = 0;
    st.hazards.length = 0;
    st.enemies.length = 0;
    st.spawners.forEach(function (s) { s.entity = null; s.armed = true; });
    st.items = st.items.filter(function (i) { return i.permanent && !i.dead; });

    // 中ボス戦中に死んだら、部屋の手前から再挑戦
    st.midBoss = null;
    st.lockArena = null;

    // ボス戦中に死んだらボスも作り直し
    if (st.boss) {
      st.boss = null;
      st.phase = 'intro';
      st.introStep = 0;
      // ボス部屋の扉を開け直す
      var d = st.data.boss;
      var tx = Math.floor(d.doorX / TL.T);
      for (var y = 0; y < Math.floor(d.arena.floorY / TL.T); y++) {
        TL.setAt(tx, y, y >= Math.floor((d.arena.floorY - 64) / TL.T) ? 'D' : '#');
      }
    } else {
      st.phase = 'intro';
      st.introStep = 0;
    }
    st.phaseT = 40;      // READY を短めに
    st.deathT = 0;
    st.zoom = 1; st.zoomTarget = 1;
    G.fx.reset();
    G.input.visible = false;
    updateCamera(true);
  }

  /* --- ゲームオーバー / コンティニュー --- */
  function updateGameOver() {
    st.phaseT++;
    var inp = G.input;
    if (st.phaseT < 100) return;

    if (inp.pressed.left || inp.pressed.right || inp.pressed.up || inp.pressed.down) {
      st.pauseSel = st.pauseSel === 0 ? 1 : 0;
      A.sfx.menuMove();
    }
    // タップでも選べるように
    for (var i = 0; i < inp.taps.length; i++) {
      var ty = inp.taps[i].y;
      var yes = gfx.H / 2 + 18, no = gfx.H / 2 + 40;
      if (Math.abs(ty - yes) < 12) { st.pauseSel = 0; A.sfx.menuMove(); }
      else if (Math.abs(ty - no) < 12) { st.pauseSel = 1; A.sfx.menuMove(); }
      else continue;
    }
    if (inp.pressed.jump || inp.pressed.shot || inp.pressed.start) {
      A.sfx.menuSelect();
      G.music.fadeOut(0.3);
      if (st.pauseSel === 0) {
        // コンティニュー：残機を戻して同じステージをやり直す（クリア状況は保持）
        G.game.lives = 2;
        G.scene.go('stage', { key: st.key }, { fade: 24 });
      } else {
        // タイトルへ戻る＝最初からやり直し
        G.game.reset();
        G.scene.go('title', null, { fade: 30 });
      }
    }
  }

  /* --- ポーズメニュー --- */
  function updatePause() {
    var inp = G.input;
    var pl = st.player;
    var n = pl.weapons.length + (st.tanks > 0 ? 1 : 0);

    if (inp.pressed.up)   { st.pauseSel = (st.pauseSel - 1 + n) % n; A.sfx.menuMove(); }
    if (inp.pressed.down) { st.pauseSel = (st.pauseSel + 1) % n; A.sfx.menuMove(); }

    // タップで直接選ぶ
    for (var i = 0; i < inp.taps.length; i++) {
      var idx = pauseHitTest(inp.taps[i]);
      if (idx >= 0) {
        if (idx === st.pauseSel) { applyPause(); return; }
        st.pauseSel = idx; A.sfx.menuMove();
      }
    }

    if (inp.pressed.jump || inp.pressed.shot) { applyPause(); return; }
    if (inp.pressed.pause || inp.pressed.start) { closePause(); }
  }

  function pauseHitTest(tap) {
    var pl = st.player;
    var n = pl.weapons.length + (st.tanks > 0 ? 1 : 0);
    var y0 = gfx.H / 2 - n * 11 + 8;
    for (var i = 0; i < n; i++) {
      var y = y0 + i * 22;
      if (tap.y >= y - 11 && tap.y <= y + 11 &&
          tap.x > gfx.W / 2 - 90 && tap.x < gfx.W / 2 + 90) return i;
    }
    return -1;
  }

  function applyPause() {
    var pl = st.player;
    if (st.pauseSel < pl.weapons.length) {
      pl.selectWeapon(st.pauseSel);
      closePause();
    } else {
      // E缶を使う
      if (st.tanks > 0 && pl.hp < pl.maxHp) {
        st.tanks--;
        pl.hp = pl.maxHp;
        A.sfx.oneUp();
        G.fx.sparkle(pl.cx(), pl.cy(), 20, '#B8F818');
        closePause();
      } else A.sfx.deny();
    }
  }

  function openPause() {
    st.pausedFrom = st.phase;
    st.phase = 'pause';
    st.pauseSel = st.player.weaponIndex;
    A.sfx.pause();
    G.music.duck(0.16);
    st.player.cancelCharge();
  }
  function closePause() {
    st.phase = st.pausedFrom;
    A.sfx.pause();
    G.music.duck(0.55);
    G.input.consumeAll();
  }

  /* ======================================================================
     メイン update
     ====================================================================== */
  function update() {
    if (!st.spawnBlast) makeApi();
    st.t++;
    var inp = G.input;
    var pl = st.player;

    /* --- ポーズの開閉 --- */
    if (st.phase === 'pause') { updatePause(); return; }
    if (inp.pressed.pause &&
        (st.phase === 'play' || st.phase === 'boss' || st.phase === 'midboss')) { openPause(); return; }

    /* --- ズームの補間 --- */
    if (st.zoomTimer > 0) { st.zoomTimer--; if (st.zoomTimer === 0) st.zoomTarget = 1; }
    st.zoom = U.lerp(st.zoom, st.zoomTarget, 0.06);

    /* --- プレイヤーがやられたら dead フェーズへ --- */
    if (pl.state === 'dead' && st.phase !== 'dead' && st.phase !== 'gameover') {
      st.phase = 'dead'; st.deathT = 0;
    }

    /* --- フェーズごとの処理 --- */
    switch (st.phase) {
      case 'intro':    updateIntro(); break;
      case 'play':     updatePlay(); break;
      case 'midboss':  updateMidBoss(); break;
      case 'door':     updateDoor(); break;
      case 'bossin':   updateBossIn(); break;
      case 'boss':     updateBoss(); break;
      case 'dying':    updateDying(); break;
      case 'clear':    updateClear(); break;
      case 'dead':     pl.update(st); updateDead(); break;
      case 'gameover': updateGameOver(); break;
    }

    /* --- 共通の更新（演出中も弾やパーティクルは動かす） --- */
    if (st.phase !== 'gameover') {
      TL.tick();                 // 明滅ブロック・崩れる床・コンベアの時間を進める
      updateSpawners();

      var i;
      // 分裂などで生まれた「湧き元を持たない敵」は、画面から離れたら片付ける
      var cullL = st.camX - gfx.W, cullR = st.camX + gfx.W * 2;
      for (i = 0; i < st.enemies.length; i++) {
        var en = st.enemies[i];
        if (en.dead) continue;
        if (!en.spawner && !en.isPlatform && (en.x < cullL || en.x > cullR)) { en.dead = true; continue; }
        en.update(st);
      }
      for (i = 0; i < st.shots.length; i++)   if (!st.shots[i].dead)   st.shots[i].update(st);
      for (i = 0; i < st.hazards.length; i++) if (!st.hazards[i].dead) st.hazards[i].update(st);
      for (i = 0; i < st.items.length; i++)   if (!st.items[i].dead)   st.items[i].update(st);

      if (st.phase !== 'dead' && st.phase !== 'clear') collisions();

      U.sweep(st.enemies); U.sweep(st.shots); U.sweep(st.hazards); U.sweep(st.items);
    }

    if (st.bigMsg) { st.bigMsg.t++; if (st.bigMsg.t > st.bigMsg.max) st.bigMsg = null; }

    // G.fx.update() はメインループ側で毎ステップ呼ばれるのでここでは呼ばない
    updateCamera(false);
  }

  /* ======================================================================
     描画
     ====================================================================== */
  function draw() {
    var ctx = gfx.ctx;
    var camX = st.camX + G.fx.shakeX;
    var camY = st.camY + G.fx.shakeY;

    /* --- 背景（ズームの影響を受けない） --- */
    st.theme.drawBg(st.camX, st.camY, st.t);

    /* --- ワールド（ズーム適用） --- */
    ctx.save();
    if (Math.abs(st.zoom - 1) > 0.002) ctx.scale(st.zoom, st.zoom);

    TL.draw(camX, camY);
    drawCheckpoint(camX, camY);

    var i;
    for (i = 0; i < st.items.length; i++) st.items[i].draw(camX, camY);
    for (i = 0; i < st.enemies.length; i++) st.enemies[i].draw(camX, camY);
    if (st.boss) st.boss.draw(camX, camY);
    if (st.midBoss) st.midBoss.draw(camX, camY);
    st.player.draw(camX, camY);
    for (i = 0; i < st.hazards.length; i++) st.hazards[i].draw(camX, camY);
    for (i = 0; i < st.shots.length; i++) st.shots[i].draw(camX, camY);

    G.fx.draw(camX, camY);
    ctx.restore();

    /* --- 前景の演出 --- */
    drawBossMarker(camX, camY);
    G.fx.drawFlash();

    /* --- 画面上の文字 --- */
    drawOverlay();

    /* --- HUD とコントローラ --- */
    if (st.phase !== 'gameover') {
      G.hud.drawStage(st);
      if (st.boss && (st.phase === 'boss' || st.phase === 'dying')) G.hud.drawBoss(st.boss);
      if (st.midBoss) G.hud.drawBoss(st.midBoss);
    }
    G.input.drawControls(st.phase === 'pause' ? 0.25 : 1);

    if (st.phase === 'pause') drawPauseMenu();

    gfx.scanlines(0.10);
  }

  /* ボスが画面外にいるときに画面端へ出す矢印。
     アリーナは画面より広いので、自機とボスが両端に離れると
     ボスが見えなくなる。攻撃の予兆を見逃さないための目印。       */
  function drawBossMarker(camX, camY) {
    var b = st.boss;
    if (!b || b.dead || !b.active) return;
    if (st.phase !== 'boss' && st.phase !== 'dying') return;

    var z = st.zoom;
    var sx = (b.cx() - camX) * z;
    var sy = (b.cy() - camY) * z;
    var edge = 14;
    if (sx >= edge && sx <= gfx.W - edge) return;   // 画面内なら不要

    var dir = (sx < edge) ? -1 : 1;
    var x = (dir < 0) ? edge : gfx.W - edge;
    var y = U.clamp(sy, 26, gfx.H - 64);
    var ctx = gfx.ctx;
    var pulse = (st.t % 34 < 17);

    ctx.save();
    ctx.globalAlpha = pulse ? 1 : 0.6;
    // 三角の矢印（輪郭 → 本体の順に描く）
    for (var i = 0; i <= 7; i++) {
      var h = (7 - i) * 2 + 2;
      var px = x + dir * i;
      gfx.rect(px - (dir < 0 ? 1 : 0), y - h / 2 - 1, 2, h + 2, '#101018');
    }
    for (var j = 0; j <= 6; j++) {
      var h2 = (6 - j) * 2 + 2;
      var px2 = x + dir * j;
      gfx.rect(px2, y - h2 / 2, 1, h2, j < 2 ? '#FCFCFC' : b.col.light);
    }
    ctx.restore();
  }

  /* 中間ポイントの目印。通過前は暗く、通過すると点灯する */
  function drawCheckpoint(camX, camY) {
    var cp = st.data.checkpoint;
    if (!cp) return;
    var x = Math.round(cp.x - camX), y = Math.round(cp.y - camY);
    if (x < -30 || x > gfx.W + 30) return;
    var on = !!st.checkpoint;

    // 支柱
    gfx.rect(x - 2, y - 36, 4, 36, '#101018');
    gfx.rect(x - 1, y - 36, 2, 36, on ? '#7C7C7C' : '#4C4C5C');
    gfx.rect(x - 6, y - 3, 12, 3, '#101018');
    gfx.rect(x - 5, y - 2, 10, 2, on ? '#BCBCBC' : '#5C5C6C');

    // 先端のランプ
    var pulse = on ? (Math.sin(st.t * 0.12) * 0.5 + 0.5) : 0;
    var col = on ? '#F8D878' : '#3C3C4C';
    gfx.circle(x, y - 40, 5, '#101018');
    gfx.circle(x, y - 40, 4, col);
    if (on) {
      var ctx = gfx.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + pulse * 0.5;
      gfx.circle(x, y - 40, 8 + pulse * 3, '#F8D878');
      ctx.restore();
      if (st.t % 12 === 0) {
        G.fx.part({ x: cp.x, y: cp.y - 40, vx: U.rndRange(-0.3, 0.3), vy: -0.6,
          life: 22, size: 2, color: '#FCE0A8', type: 'star', light: true });
      }
    }
  }

  function drawOverlay() {
    var cy = gfx.H / 2;

    /* --- READY / GO! --- */
    if (st.phase === 'intro') {
      var t = st.phaseT;
      // 暗転からのフェード
      if (t < 30) gfx.veil('#000000', 1 - t / 30);
      if (st.introStep < 2 && t > 10 && Math.floor(t / 12) % 2 === 0) {
        G.hud.bigText('READY', cy - 12, { scale: 3, color: '#FCFCFC' });
      }
      if (st.introStep === 2) {
        var k = Math.min(1, st.goT / 8);
        var sc = 3 + (1 - U.ease.outCubic(k)) * 5;
        G.hud.bigText('GO!', cy - 14, { scale: sc, color: '#F8D878' });
      }
    }

    /* --- ボス名の表示 --- */
    if (st.phase === 'bossin' && st.bossNameT > 0) {
      var b = st.boss;
      var kk = U.clamp(st.bossNameT / 16, 0, 1);
      var slide = (1 - U.ease.outCubic(kk)) * 90;
      var alpha = Math.min(1, st.bossNameT / 8);
      var ctx = gfx.ctx;
      ctx.save(); ctx.globalAlpha = alpha;
      // 帯
      gfx.rect(0, gfx.H * 0.30, gfx.W, 30, '#101018');
      gfx.rect(0, gfx.H * 0.30, gfx.W, 1, b.col.light);
      gfx.rect(0, gfx.H * 0.30 + 29, gfx.W, 1, b.col.light);
      gfx.text(b.name, gfx.W / 2 + slide, gfx.H * 0.30 + 8,
        { align: 'center', scale: 3, color: b.col.light, outline: '#101018' });
      ctx.restore();
    }

    /* --- 中ボスの名前（ボスより控えめに、短く出す） --- */
    if (st.phase === 'midboss' && st.midBoss && st.midBoss.state === 'pose') {
      var mb2 = st.midBoss;
      var ka = Math.min(1, mb2.actT / 8);
      var ctx2 = gfx.ctx;
      ctx2.save(); ctx2.globalAlpha = ka;
      gfx.rect(0, gfx.H * 0.24, gfx.W, 18, '#101018');
      gfx.rect(0, gfx.H * 0.24, gfx.W, 1, mb2.col.light);
      gfx.rect(0, gfx.H * 0.24 + 17, gfx.W, 1, mb2.col.light);
      gfx.text(mb2.name, gfx.W / 2, gfx.H * 0.24 + 5,
        { align: 'center', scale: 1, color: mb2.col.light, shadow: '#101018' });
      ctx2.restore();
    }

    /* --- 大きなメッセージ（ラスボスの形態変化など） --- */
    if (st.bigMsg) {
      var bm = st.bigMsg;
      var ki = Math.min(1, bm.t / 12);
      var fade = bm.t > bm.max - 20 ? (bm.max - bm.t) / 20 : 1;
      var ctx3 = gfx.ctx;
      ctx3.save();
      ctx3.globalAlpha = Math.max(0, fade);
      var sc = 3 + (1 - U.ease.outCubic(ki)) * 4;
      gfx.text(bm.text, gfx.W / 2, gfx.H * 0.34,
        { align: 'center', scale: sc, color: bm.color, outline: '#101018' });
      ctx3.restore();
    }

    /* --- ボス撃破後の「STAGE CLEAR」 --- */
    if (st.phase === 'clear' && st.clearT > 40) {
      var a2 = Math.min(1, (st.clearT - 40) / 16);
      gfx.ctx.save(); gfx.ctx.globalAlpha = a2;
      G.hud.bigText('STAGE CLEAR', cy - 40, { scale: 3, color: '#F8D878' });
      gfx.ctx.restore();
    }

    /* --- やられ演出 --- */
    if (st.phase === 'dead' && st.deathT > 70) {
      gfx.veil('#000000', U.clamp((st.deathT - 70) / 50, 0, 1));
    }

    /* --- ゲームオーバー --- */
    if (st.phase === 'gameover') {
      gfx.veil('#000000', 1);
      var t2 = st.phaseT;
      var ga = U.clamp(t2 / 60, 0, 1);
      gfx.ctx.save(); gfx.ctx.globalAlpha = ga;
      G.hud.bigText('GAME OVER', cy - 46, { scale: 3, color: '#D82800' });
      gfx.ctx.restore();

      if (t2 > 100) {
        G.hud.bigText('CONTINUE?', cy - 8, { scale: 2, color: '#FCFCFC' });
        var yes = cy + 18, no = cy + 40;
        var blink = Math.floor(t2 / 10) % 2 === 0;
        gfx.text('YES', gfx.W / 2, yes - 4,
          { align: 'center', scale: 2, color: st.pauseSel === 0 ? (blink ? '#F8D878' : '#FCFCFC') : '#7C7C7C' });
        gfx.text('NO', gfx.W / 2, no - 4,
          { align: 'center', scale: 2, color: st.pauseSel === 1 ? (blink ? '#F8D878' : '#FCFCFC') : '#7C7C7C' });
        if (st.pauseSel === 0) gfx.text('>', gfx.W / 2 - 40, yes - 4, { scale: 2, color: '#F8D878' });
        else gfx.text('>', gfx.W / 2 - 34, no - 4, { scale: 2, color: '#F8D878' });
      }
    }
  }

  /* --- ポーズメニュー --- */
  function drawPauseMenu() {
    var pl = st.player;
    gfx.veil('#000018', 0.72);
    gfx.text('PAUSE', gfx.W / 2, 18, { align: 'center', scale: 2, color: '#3CBCFC', outline: '#101018' });

    var n = pl.weapons.length + (st.tanks > 0 ? 1 : 0);
    var y0 = gfx.H / 2 - n * 11 + 8;

    for (var i = 0; i < pl.weapons.length; i++) {
      var id = pl.weapons[i];
      var def = G.weapons.BY_ID[id];
      var y = y0 + i * 22;
      var on = (i === st.pauseSel);
      if (on) {
        gfx.rect(gfx.W / 2 - 92, y - 10, 184, 20, '#102040');
        gfx.rectLine(gfx.W / 2 - 92, y - 10, 184, 20, '#3CBCFC', 1);
      }
      G.weapons.drawIcon(id, gfx.W / 2 - 76, y, 1);
      gfx.text(def.name, gfx.W / 2 - 60, y - 3, { color: on ? '#FCFCFC' : '#9CA8B8' });
      // 残量ゲージ（横向き）
      if (id !== 'buster') {
        var amt = pl.ammo[id] / G.Player.MAX_AMMO;
        gfx.rect(gfx.W / 2 + 40, y - 4, 46, 8, '#101018');
        gfx.rect(gfx.W / 2 + 41, y - 3, 44 * amt, 6, def.color);
      } else {
        gfx.text('INF', gfx.W / 2 + 52, y - 3, { color: '#3CBCFC' });
      }
    }

    if (st.tanks > 0) {
      var yT = y0 + pl.weapons.length * 22;
      var onT = (st.pauseSel === pl.weapons.length);
      if (onT) {
        gfx.rect(gfx.W / 2 - 92, yT - 10, 184, 20, '#102040');
        gfx.rectLine(gfx.W / 2 - 92, yT - 10, 184, 20, '#B8F818', 1);
      }
      gfx.ctx.drawImage(G.sprites.item.eTank.r, gfx.W / 2 - 82, yT - 6);
      gfx.text('E TANK  x' + st.tanks, gfx.W / 2 - 60, yT - 3,
        { color: onT ? '#FCFCFC' : '#9CA8B8' });
    }

    gfx.text('TAP TO SELECT   II TO RESUME', gfx.W / 2, gfx.H - 16,
      { align: 'center', color: '#7C88A0' });
  }

  return { enter: enter, exit: exit, update: update, draw: draw,
           get state() { return st; } };
})();
