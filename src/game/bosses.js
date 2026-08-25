/* =========================================================================
   bosses.js  --  ボス6体

   共通の流れ:
     entrance（落下 or スライドイン）→ pose（名前表示中の待機）
       → loop: wait → telegraph（予備動作）→ attack → recover
     HP が半分を切ると enraged = true になり、行動が速く・激しくなる。

   弱点は輪になっている（どのボスから始めても攻略可能）:
     ガッツ ← ボム ← ファイアー ← アイス ← エレック ← カッター ← ガッツ
   ========================================================================= */
G.bosses = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles, W = G.weapons;

  var MAX_HP = 28;
  var WEAK_MULT = 3;      // 弱点武器のダメージ倍率

  /* ======================================================================
     汎用ハザード（雷柱・ビーム・氷の壁・衝撃波などに使う矩形の攻撃判定）
     ====================================================================== */
  function Hazard(x, y, w, h, opt) {
    opt = opt || {};
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = opt.vx || 0; this.vy = opt.vy || 0;
    this.dmg = opt.dmg || 4;
    this.team = 'enemy';
    this.element = opt.element || 'enemy';
    this.life = opt.life || 60;
    this.age = 0;
    this.dead = false;
    this.pierce = true;
    this.warn = opt.warn || 0;        // 予告フレーム数（この間は判定なし）
    this.drawFn = opt.draw || null;
    this.color = opt.color || '#F8D878';
    this.stickFloor = opt.stickFloor || false;
    this.onStep = opt.onStep || null;
  }
  Hazard.prototype.hitbox = function () {
    // 予告中は当たり判定を出さない（理不尽にしないため）
    if (this.age < this.warn) return { x: -9999, y: -9999, w: 0, h: 0 };
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };
  Hazard.prototype.cx = function () { return this.x + this.w / 2; };
  Hazard.prototype.cy = function () { return this.y + this.h / 2; };
  Hazard.prototype.onHit = function () { return false; };
  Hazard.prototype.update = function (st) {
    this.age++;
    this.x += this.vx; this.y += this.vy;
    if (this.onStep) this.onStep(this, st);
    if (--this.life <= 0) this.dead = true;
  };
  Hazard.prototype.draw = function (cx, cy) {
    if (this.drawFn) { this.drawFn(this, cx, cy); return; }
    var a = this.age < this.warn ? 0.35 : 1;
    var ctx = gfx.ctx;
    ctx.save(); ctx.globalAlpha = a;
    gfx.rect(this.x - cx, this.y - cy, this.w, this.h, this.color);
    ctx.restore();
  };

  /* ======================================================================
     ボス共通ベース
     ====================================================================== */
  function Boss(def, x, y) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.col = def.col;
    this.weakness = def.weakness;
    this.drop = def.drop;

    this.w = 24; this.h = 30;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    this.homeX = x; this.homeY = y;
    this.vx = 0; this.vy = 0;
    this.face = -1;

    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.contactDmg = 5;

    this.state = 'entrance';
    this.act = 'wait';
    this.actT = 0;
    this.lastAct = '';
    this.age = 0;
    this.flash = 0;
    this.invul = 0;
    this.enraged = false;
    this.dead = false;
    this.defeated = false;
    this.dyingT = 0;
    this.frozen = 0;
    this.onGround = false;
    this.active = false;        // 名前表示が終わるまでは動かない

    this.pose = { lean: 0, armL: 0, armR: 0, crouch: 0, legSpread: 4, headY: 0 };
    this.arena = null;          // { x0, x1, floorY } をステージが入れる
    this.entranceT = 0;
    this.entranceType = def.entrance || 'drop';
  }
  var B = Boss.prototype;

  B.hitbox = function () { return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 2 }; };
  B.cx = function () { return this.x + this.w / 2; };
  B.cy = function () { return this.y + this.h / 2; };
  B.feetY = function () { return this.y + this.h; };

  /* ---------------- ダメージ ---------------- */
  B.damage = function (n, element, st) {
    if (this.invul > 0 || this.state === 'dying' || this.state === 'entrance' || !this.active) return false;
    var dmg = n;
    var isWeak = (element === this.weakness);
    if (isWeak) dmg = n * WEAK_MULT;
    if (element === 'buster' && this.def.busterResist) dmg = Math.max(1, Math.floor(dmg * 0.5));

    this.hp -= dmg;
    this.flash = 6;
    this.invul = 12;            // 連続ヒットしすぎないように短い無敵

    if (isWeak) {
      A.sfx.bossHurt();
      G.fx.burst(this.cx(), this.cy(), 10, { speed: 2.4, life: 18, size: 3,
        color: '#FCFCFC', color2: this.col.main, light: true });
      G.fx.shake(2, 8);
    } else {
      A.sfx.bossHurt();
      G.fx.burst(this.cx(), this.cy(), 5, { speed: 1.6, life: 12, size: 2, color: '#FCFCFC' });
    }

    // --- 半減で強化モードへ ---
    if (!this.enraged && this.hp <= this.maxHp / 2 && this.hp > 0) {
      this.enraged = true;
      this.onEnrage(st);
    }

    if (this.hp <= 0) { this.hp = 0; this.startDying(st); return true; }
    return true;
  };

  B.onEnrage = function (st) {
    A.sfx.bossWarn();
    G.fx.flash(this.col.main, 8, 0.5);
    G.fx.shake(4, 20);
    G.fx.ring(this.cx(), this.cy(), 4, 46, 20, this.col.light);
    G.fx.burst(this.cx(), this.cy(), 20, { speed: 3, life: 26, size: 3,
      color: this.col.light, color2: this.col.main, light: true });
    this.act = 'wait'; this.actT = 30;
  };

  /* ---------------- 撃破演出 ---------------- */
  B.startDying = function (st) {
    this.state = 'dying';
    this.dyingT = 0;
    this.vx = 0;
    A.sfx.explode();
    G.fx.slowmo(0.35, 44);        // 少しスローに
    G.fx.shake(3, 30);
    if (st) st.onBossDying();
  };

  B.updateDying = function (st) {
    this.dyingT++;
    var t = this.dyingT;
    // ゆっくり点滅しながら小爆発を繰り返す
    if (t < 100 && t % 7 === 0) {
      var a = U.rnd() * Math.PI * 2, r = U.rnd() * 18;
      G.fx.explode(this.cx() + Math.cos(a) * r, this.cy() + Math.sin(a) * r, 0.7);
      A.sfx.enemyPop();
    }
    // 短い無音の後に大爆発
    if (t === 108) {
      G.fx.explodeBig(this.cx(), this.cy());
      G.fx.explodeBig(this.cx() - 8, this.cy() + 6);
      G.fx.explodeBig(this.cx() + 8, this.cy() - 6);
      A.sfx.explodeBig();
      G.fx.flash('#FCFCFC', 14, 0.95);
      G.fx.shake(6, 40);
      G.fx.slowmo(0.25, 30);
      this.dead = true;
      this.defeated = true;
      if (st) st.onBossDefeated();
    }
  };

  /* ---------------- 登場演出 ---------------- */
  B.updateEntrance = function (st) {
    this.entranceT++;
    var t = this.entranceT;

    if (this.entranceType === 'drop') {
      // 天井から落ちてきて着地で衝撃
      if (t < 6) { this.y = this.homeY - this.h - 200; }
      this.vy = Math.min(this.vy + 0.75, 13);
      this.y += this.vy;
      if (this.feetY() >= this.arena.floorY) {
        this.y = this.arena.floorY - this.h;
        this.vy = 0;
        this.state = 'pose';
        this.actT = 0;
        A.sfx.bossStep();
        G.fx.shake(5, 22);
        G.fx.ring(this.cx(), this.feetY(), 4, 50, 18, this.col.light);
        G.fx.dust(this.cx() - 10, this.feetY(), -1.6);
        G.fx.dust(this.cx() + 10, this.feetY(), 1.6);
        G.fx.burst(this.cx(), this.feetY(), 12, { speed: 2.6, life: 22, size: 3,
          color: '#BCBCBC', dir: -Math.PI / 2, spread: Math.PI });
      }
    } else {
      // 横からスライドイン
      if (t === 1) { this.x = this.arena.x1 + 30; this.y = this.arena.floorY - this.h; }
      this.x -= 2.6;
      if (this.age % 6 === 0) G.fx.dust(this.cx(), this.feetY(), 1);
      if (this.x <= this.homeX - this.w / 2) {
        this.x = this.homeX - this.w / 2;
        this.state = 'pose';
        this.actT = 0;
        A.sfx.bossStep();
        G.fx.shake(3, 14);
      }
    }
  };

  /* ---------------- 行動の切り替え ---------------- */
  B.setAct = function (name, dur) {
    this.lastAct = this.act;
    this.act = name;
    this.actT = 0;
    this.actDur = dur;
  };

  /* ---------------- 共通の物理 ---------------- */
  B.physics = function () {
    this.vy = Math.min(this.vy + 0.36, 11);
    this.x += this.vx;
    this.y += this.vy;
    // 床
    if (this.feetY() >= this.arena.floorY) {
      this.y = this.arena.floorY - this.h;
      if (!this.onGround && this.vy > 3) this.onLandHeavy();
      this.vy = 0;
      this.onGround = true;
    } else this.onGround = false;
    // 壁（アリーナの端）
    if (this.x < this.arena.x0) { this.x = this.arena.x0; this.vx = Math.abs(this.vx); }
    if (this.x + this.w > this.arena.x1) { this.x = this.arena.x1 - this.w; this.vx = -Math.abs(this.vx); }
  };
  B.onLandHeavy = function () {
    A.sfx.land2();
    G.fx.dust(this.cx() - 8, this.feetY(), -1);
    G.fx.dust(this.cx() + 8, this.feetY(), 1);
    G.fx.shake(2, 8);
  };

  B.facePlayer = function (st) {
    this.face = st.player.cx() < this.cx() ? -1 : 1;
  };

  /* ---------------- メイン更新 ---------------- */
  B.update = function (st) {
    this.age++;
    if (this.flash > 0) this.flash--;
    if (this.invul > 0) this.invul--;

    if (this.state === 'dying') { this.updateDying(st); return; }
    if (this.state === 'entrance') { this.updateEntrance(st); return; }
    if (this.state === 'pose') {
      // 名前表示の間はポーズを取って待つ
      this.actT++;
      this.pose.armR = -Math.round(Math.sin(this.actT * 0.1) * 2);
      if (this.active) { this.state = 'fight'; this.setAct('wait', 34); }
      return;
    }

    if (this.frozen > 0) { this.frozen--; this.physics(); return; }

    this.actT++;
    this.runAct(st);
    this.physics();
  };

  /* ---------------- 攻撃選択の共通ヘルパ ---------------- */
  B.pickAttack = function (st, list) {
    // 直前と同じ技を続けにくくする
    var pool = list.filter(function (n) { return n !== this.lastAttack; }, this);
    if (!pool.length) pool = list;
    var chosen = U.pick(pool);
    this.lastAttack = chosen;
    return chosen;
  };

  // 待機 -> 攻撃選択の共通処理。各ボスの runAct から呼ぶ
  B.doWait = function (st, attacks) {
    this.facePlayer(st);
    // 仮想スティックは実機のパッドより反応が遅れるので、
    // 技と技の間に少しだけ余裕を持たせている
    var dur = this.enraged ? 26 : 46;
    // 少し歩いて間合いを取る
    this.vx = Math.sin(this.age * 0.06) * (this.enraged ? 1.0 : 0.6) * this.face;
    if (this.actT >= dur) {
      this.setAct(this.pickAttack(st, attacks), 0);
      return true;
    }
    return false;
  };

  /* ---------------- 描画（共通部分） ---------------- */
  B.draw = function (camX, camY) {
    if (this.state === 'dying') {
      // 撃破中：だんだん速く点滅し、最後は消える
      var t = this.dyingT;
      var speed = t < 40 ? 8 : (t < 80 ? 5 : 3);
      if (t > 100) return;
      if (Math.floor(t / speed) % 2 === 0) {
        this.drawBody(camX, camY, '#FCFCFC');
        return;
      }
    }
    if (this.frozen > 0 && this.age % 4 < 2) { this.drawBody(camX, camY, '#BCE8FC'); return; }
    // HPが低いほど速く点滅する（原作の「瀕死」表現）
    if (this.enraged && this.state === 'fight') {
      var rate = this.hp <= this.maxHp * 0.22 ? 6 : 12;
      if (this.age % rate < 2) { this.drawBody(camX, camY, this.col.light); return; }
    }
    this.drawBody(camX, camY, this.flash > 0 ? '#FCFCFC' : null);
  };

  /* 単色で塗りたい場合は override 色を渡す */
  B.drawBody = function (camX, camY, override) {
    var col = this.col;
    if (override) {
      col = { main: override, dark: override, light: override, trim: override, eye: override };
    }
    var h = G.sprites.chassis({
      x: this.cx() - camX, y: this.feetY() - camY,
      face: this.face, col: col, size: 1.18, pose: this.pose
    });
    if (this.decorate) this.decorate(h, override);
  };

  function extend(def, proto) {
    function C(x, y) { Boss.call(this, def, x, y); if (this.init) this.init(); }
    C.prototype = Object.create(B);
    C.prototype.constructor = C;
    for (var k in proto) if (proto.hasOwnProperty(k)) C.prototype[k] = proto[k];
    C.def = def;
    return C;
  }

  /* ======================================================================
     ① エレックマン風  ─ 電撃弾連射 / 垂直電撃柱 / 電撃ビーム
     ====================================================================== */
  var ElecMan = extend({
    id: 'elec', name: 'ELEC MAN', drop: 'thunder', weakness: 'cutter', entrance: 'drop',
    col: { main:'#F8D878', dark:'#B08000', light:'#FCE0A8', trim:'#FCFCFC', eye:'#00E8D8' },
    faceCol: '#F8D878', bgm: 'boss'
  }, {
    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['volley', 'pillar', 'beam'])) A.sfx.blip();
          break;

        /* --- 電撃弾の連射 --- */
        case 'volley':
          this.vx = 0;
          this.pose.armR = -6;
          if (this.actT === 1) A.sfx.charge();
          if (this.actT > 16) {
            var every = this.enraged ? 8 : 13;
            var count = this.enraged ? 5 : 3;
            if ((this.actT - 16) % every === 0) {
              var n = Math.floor((this.actT - 16) / every);
              if (n < count) {
                var p = st.player;
                var a = Math.atan2(p.cy() - this.cy(), p.cx() - this.cx());
                var spread = (n - (count - 1) / 2) * 0.14;
                st.shots.push(new W.EnemyShot(this.cx() + this.face * 14, this.cy() - 2,
                  Math.cos(a + spread) * 4.2, Math.sin(a + spread) * 4.2,
                  { dmg: 4, size: 10, style: 'spark', color: '#F8D878', color2: '#FCFCFC' }));
                A.sfx.thunder();
                G.fx.burst(this.cx() + this.face * 16, this.cy() - 2, 5,
                  { speed: 1.5, life: 10, size: 2, color: '#FCFCFC', light: true });
              } else { this.pose.armR = 0; this.setAct('wait', 0); }
            }
          }
          break;

        /* --- 垂直の電撃柱（プレイヤーの足元に予告→発生） --- */
        case 'pillar':
          this.vx = 0;
          this.pose.armL = -8; this.pose.armR = -8;
          if (this.actT === 1) { A.sfx.charge(); st.requestZoom(0.9, 90); }
          var pn = this.enraged ? 4 : 3;
          if (this.actT >= 20 && (this.actT - 20) % 22 === 0) {
            var idx = (this.actT - 20) / 22;
            if (idx < pn) {
              var px = idx === 0 ? st.player.cx()
                     : U.clamp(st.player.cx() + U.rndRange(-70, 70), this.arena.x0 + 12, this.arena.x1 - 12);
              this.spawnPillar(st, px);
            } else {
              this.pose.armL = this.pose.armR = 0;
              this.setAct('wait', 0);
            }
          }
          break;

        /* --- 水平の電撃ビーム（大技：カメラを少し引く） --- */
        case 'beam':
          this.vx = 0;
          if (this.actT === 1) {
            A.sfx.bossWarn();
            st.requestZoom(0.86, 110);
            this.facePlayer(st);
          }
          this.pose.armR = -10 + Math.round(Math.sin(this.actT * 0.4) * 2);
          if (this.actT === 46) {
            var self = this;
            var y0 = this.cy() - 9;
            var hz = new Hazard(this.arena.x0, y0, this.arena.x1 - this.arena.x0, 18, {
              dmg: 6, element: 'thunder', life: 40, warn: 0, color: '#F8D878',
              draw: function (hzd, cx, cy) {
                var ctx = gfx.ctx;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                var k = Math.min(1, hzd.age / 4);
                var hh = 18 * k;
                gfx.rect(hzd.x - cx, hzd.cy() - cy - hh / 2, hzd.w, hh, '#F8D878');
                gfx.rect(hzd.x - cx, hzd.cy() - cy - hh / 4, hzd.w, hh / 2, '#FCFCFC');
                // ちりちりした電気
                for (var i = 0; i < hzd.w; i += 10) {
                  var o = ((i + hzd.age * 5) % 20 < 10) ? -6 : 6;
                  gfx.rect(hzd.x - cx + i, hzd.cy() - cy + o, 6, 2, '#FCE0A8');
                }
                ctx.restore();
              }
            });
            st.hazards.push(hz);
            A.sfx.thunder(); A.sfx.explode();
            G.fx.flash('#F8D878', 8, 0.55);
            G.fx.shake(4, 24);
          }
          if (this.actT > 96) { this.pose.armR = 0; this.setAct('wait', 0); }
          break;
      }
    },

    spawnPillar: function (st, px) {
      var floorY = this.arena.floorY;
      var hz = new Hazard(px - 9, floorY - 96, 18, 96, {
        dmg: 5, element: 'thunder', life: 54, warn: 20, color: '#F8D878',
        draw: function (h, cx, cy) {
          var ctx = gfx.ctx;
          if (h.age < h.warn) {
            // 予告：床が光る
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.4 * Math.sin(h.age * 0.6);
            gfx.rect(h.x - cx, h.y + h.h - 4 - cy, h.w, 4, '#FCE0A8');
            ctx.restore();
            return;
          }
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          var k = Math.min(1, (h.age - h.warn) / 5);
          var wdt = h.w * k;
          for (var y = 0; y < h.h; y += 8) {
            var o = ((y / 8) % 2 === 0) ? 2 : -2;
            gfx.rect(h.cx() - cx - wdt / 2 + o, h.y + y - cy, wdt, 8, '#F8D878');
            gfx.rect(h.cx() - cx - wdt / 4 + o, h.y + y - cy, wdt / 2, 8, '#FCFCFC');
          }
          ctx.restore();
        }
      });
      st.hazards.push(hz);
      A.sfx.thunder();
      G.fx.shake(2, 10);
    },

    decorate: function (h, override) {
      // 頭の稲妻クレスト
      var c = override || '#FCFCFC';
      h.Blk(-4, h.headY - 8, 4, 7, c, null, null);
      h.Blk(1, h.headY - 6, 4, 6, c, null, null);
      h.R(-1, h.headY - 4, 3, 3, override || '#00E8D8');
    }
  });

  /* ======================================================================
     ② ファイアーマン風  ─ 火炎放射 / 放射状火弾 / 火の玉投下
     ====================================================================== */
  var FireMan = extend({
    id: 'fire', name: 'FIRE MAN', drop: 'fire', weakness: 'ice', entrance: 'drop',
    col: { main:'#D82800', dark:'#8C1400', light:'#F87858', trim:'#FCE0A8', eye:'#F8D878' },
    faceCol: '#D82800'
  }, {
    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['flame', 'radial', 'rain'])) A.sfx.blip();
          break;

        /* --- 火炎放射：前方に炎を吐き続ける --- */
        case 'flame':
          this.vx = 0;
          this.faceIfEarly(st);
          this.pose.armR = -4; this.pose.crouch = 2;
          if (this.actT === 1) A.sfx.charge();
          var dur = this.enraged ? 76 : 54;
          if (this.actT > 20 && this.actT < 20 + dur && this.actT % 4 === 0) {
            var sp = 3.4 + U.rndRange(-0.4, 0.6);
            var spread = U.rndRange(-0.16, 0.16);
            st.shots.push(new W.EnemyShot(this.cx() + this.face * 15, this.cy(),
              Math.cos(spread) * sp * this.face, Math.sin(spread) * sp,
              { dmg: 4, size: 12, style: 'flame', life: 70 }));
            if (this.actT % 8 === 0) A.sfx.fire();
            G.fx.part({ x: this.cx() + this.face * 16, y: this.cy(),
              vx: this.face * 1.4, vy: U.rndRange(-0.7, 0.3), life: 16, size: 4,
              color: '#FCE0A8', color2: '#D82800', type: 'circle', light: true });
          }
          if (this.actT > 24 + dur) { this.pose.armR = 0; this.pose.crouch = 0; this.setAct('wait', 0); }
          break;

        /* --- 放射状の火弾 --- */
        case 'radial':
          this.vx = 0;
          this.pose.armL = -6; this.pose.armR = -6;
          if (this.actT === 1) { A.sfx.charge(); st.requestZoom(0.9, 80); }
          if (this.actT === 34 || (this.enraged && this.actT === 62)) {
            var n = this.enraged ? 10 : 8;
            for (var i = 0; i < n; i++) {
              var a = (i / n) * Math.PI * 2 + (this.actT > 40 ? Math.PI / n : 0);
              st.shots.push(new W.EnemyShot(this.cx(), this.cy(),
                Math.cos(a) * 3.0, Math.sin(a) * 3.0,
                { dmg: 4, size: 12, style: 'flame', life: 120, hitsWall: true }));
            }
            A.sfx.fire(); A.sfx.explode();
            G.fx.ring(this.cx(), this.cy(), 4, 40, 16, '#FC9838');
            G.fx.flash('#FC9838', 5, 0.35);
            G.fx.shake(3, 14);
          }
          if (this.actT > (this.enraged ? 84 : 56)) {
            this.pose.armL = this.pose.armR = 0; this.setAct('wait', 0);
          }
          break;

        /* --- 火の玉投下：天井から降ってくる --- */
        case 'rain':
          if (this.actT === 1) { A.sfx.bossWarn(); st.requestZoom(0.88, 130); }
          // 跳んで撃つ
          if (this.actT === 12) { this.vy = -6.4; this.facePlayer(st); this.vx = this.face * 1.2; }
          var cnt = this.enraged ? 8 : 5;
          if (this.actT >= 30 && (this.actT - 30) % 12 === 0) {
            var idx = (this.actT - 30) / 12;
            if (idx < cnt) {
              var px = U.rndRange(this.arena.x0 + 16, this.arena.x1 - 16);
              st.shots.push(new W.EnemyShot(px, this.arena.floorY - 150,
                U.rndRange(-0.4, 0.4), 1.4,
                { dmg: 4, size: 12, style: 'flame', grav: 0.09, life: 200 }));
              A.sfx.fire();
            } else if (idx > cnt + 1) { this.setAct('wait', 0); }
          }
          break;
      }
    },
    faceIfEarly: function (st) { if (this.actT < 18) this.facePlayer(st); },

    decorate: function (h, override) {
      // 頭の炎
      var t = this.age * 0.2;
      var c1 = override || '#FC9838', c2 = override || '#FCE0A8';
      h.Blk(-4, h.headY - 9 + Math.sin(t) * 1, 4, 8, c1, null, null);
      h.Blk(0, h.headY - 11 + Math.cos(t) * 1, 4, 10, c1, null, null);
      h.R(1, h.headY - 9, 2, 5, c2);
      // 腕の砲口
      h.R(11, h.bodyTop + 9 + this.pose.armR, 4, 5, override || '#FCE0A8');
    }
  });

  /* ======================================================================
     ③ アイスマン風  ─ 3方向氷弾 / 滑る床生成 / 氷の壁で挟み込み
     ====================================================================== */
  var IceMan = extend({
    id: 'ice', name: 'ICE MAN', drop: 'ice', weakness: 'thunder', entrance: 'slide',
    col: { main:'#0058F8', dark:'#00107C', light:'#3CBCFC', trim:'#BCE8FC', eye:'#FCFCFC' },
    faceCol: '#3CBCFC'
  }, {
    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['shards', 'slick', 'walls'])) A.sfx.blip();
          break;

        /* --- 3方向（強化時は5方向）氷弾 --- */
        case 'shards':
          this.vx = 0;
          this.faceIfEarly(st);
          this.pose.armR = -5;
          if (this.actT === 22 || (this.enraged && this.actT === 46)) {
            var n = this.enraged ? 5 : 3;
            for (var i = 0; i < n; i++) {
              var a = ((i - (n - 1) / 2) * 0.30);
              var vx = Math.cos(a) * 4.6 * this.face;
              var vy = Math.sin(a) * 4.6;
              st.shots.push(new W.EnemyShot(this.cx() + this.face * 13, this.cy() - 2, vx, vy,
                { dmg: 4, size: 12, style: 'shard', life: 160 }));
            }
            A.sfx.ice();
          }
          if (this.actT > (this.enraged ? 68 : 44)) { this.pose.armR = 0; this.setAct('wait', 0); }
          break;

        /* --- 滑る床を作る（床タイルを氷に変える） --- */
        case 'slick':
          this.vx = 0;
          this.pose.crouch = 4; this.pose.armL = 3; this.pose.armR = 3;
          if (this.actT === 1) A.sfx.charge();
          if (this.actT === 26) {
            var t = TL.T;
            var ty = Math.floor(this.arena.floorY / t);
            var tx0 = Math.floor(this.arena.x0 / t) + 1;
            var tx1 = Math.floor(this.arena.x1 / t) - 1;
            for (var tx = tx0; tx <= tx1; tx++) {
              if (TL.at(tx, ty) === '#') TL.setAt(tx, ty, 'I');
              G.fx.part({ x: tx * t + 8, y: ty * t, vx: U.rndRange(-0.6, 0.6), vy: -U.rndRange(0.4, 1.4),
                life: 26, size: 3, color: '#FCFCFC', color2: '#3CBCFC', type: 'star' });
            }
            A.sfx.freeze();
            G.fx.flash('#BCE8FC', 6, 0.4);
            G.fx.shake(2, 12);
          }
          if (this.actT > 52) { this.pose.crouch = 0; this.pose.armL = this.pose.armR = 0; this.setAct('wait', 0); }
          break;

        /* --- 氷の壁が左右から迫る（ジャンプで避ける） --- */
        case 'walls':
          this.vx = 0;
          if (this.actT === 1) { A.sfx.bossWarn(); st.requestZoom(0.85, 150); }
          this.pose.armL = -8; this.pose.armR = -8;
          if (this.actT === 30) {
            var speed = this.enraged ? 2.3 : 1.7;
            var hgt = this.enraged ? 42 : 30;
            st.hazards.push(this.makeWall(st, this.arena.x0 - 20, speed, hgt));
            st.hazards.push(this.makeWall(st, this.arena.x1 + 4, -speed, hgt));
            A.sfx.ice();
            G.fx.shake(2, 16);
          }
          if (this.actT > 120) { this.pose.armL = this.pose.armR = 0; this.setAct('wait', 0); }
          break;
      }
    },
    faceIfEarly: function (st) { if (this.actT < 18) this.facePlayer(st); },

    makeWall: function (st, x, vx, hgt) {
      return new Hazard(x, this.arena.floorY - hgt, 16, hgt, {
        dmg: 5, element: 'ice', life: 130, vx: vx, color: '#BCE8FC',
        draw: function (h, cx, cy) {
          var x0 = h.x - cx, y0 = h.y - cy;
          gfx.rect(x0, y0, h.w, h.h, '#0058F8');
          gfx.rect(x0 + 1, y0 + 1, h.w - 2, h.h - 2, '#3CBCFC');
          gfx.rect(x0 + 2, y0 + 2, 3, h.h - 6, '#BCE8FC');
          gfx.rect(x0 + h.w - 5, y0 + 5, 2, h.h - 10, '#BCE8FC');
          gfx.rect(x0, y0, h.w, 2, '#FCFCFC');
          if (h.age % 4 === 0) {
            G.fx.part({ x: h.cx(), y: h.y + U.rnd() * h.h, vx: U.rndRange(-0.5, 0.5),
              vy: -0.4, life: 14, size: 2, color: '#FCFCFC', type: 'star' });
          }
        }
      });
    },

    decorate: function (h, override) {
      // かまくら風のフード＋ゴーグル
      var c = override || '#BCE8FC';
      h.Blk(-9, h.headY - 5, 18, 7, c, override || '#FCFCFC', override || '#3CBCFC');
      h.R(-6, h.headY + 2, 12, 2, override || '#00107C');
      // つらら
      h.R(-8, h.headY + 2, 2, 4, c);
      h.R(6, h.headY + 2, 2, 3, c);
    }
  });

  /* ======================================================================
     ④ ボンバーマン風  ─ 遅延爆弾 / 時限地雷 / 爆弾の雨
     ====================================================================== */
  var BombMan = extend({
    id: 'bomb', name: 'BOMB MAN', drop: 'bomb', weakness: 'fire', entrance: 'drop',
    col: { main:'#00A800', dark:'#005000', light:'#B8F818', trim:'#FCFCFC', eye:'#F8D878' },
    faceCol: '#00A800'
  }, {
    /* 落ちて転がり、時間で爆発する爆弾 */
    makeBomb: function (st, x, y, vx, vy, fuse) {
      var self = this;
      var hz = new Hazard(x - 7, y - 7, 14, 14, {
        dmg: 6, element: 'bomb', life: fuse + 30, warn: 99999,   // 接触判定は爆発時のみ
        vx: vx, vy: vy,
        onStep: function (h, stt) {
          h.vy += 0.22;
          // 床でバウンド
          if (h.y + h.h >= self.arena.floorY) {
            h.y = self.arena.floorY - h.h;
            h.vy = -h.vy * 0.34;
            h.vx *= 0.72;
            if (Math.abs(h.vy) < 0.5) h.vy = 0;
          }
          if (h.x < self.arena.x0) { h.x = self.arena.x0; h.vx = -h.vx * 0.5; }
          if (h.x + h.w > self.arena.x1) { h.x = self.arena.x1 - h.w; h.vx = -h.vx * 0.5; }
          if (h.age === fuse) {
            h.dead = true;
            stt.spawnBlast(h.cx(), h.cy(), 38, 6, 'bomb', 'enemy');
            A.sfx.explode();
            G.fx.shake(3, 14);
          }
          if (h.age > fuse - 24 && h.age % 6 < 3) {
            G.fx.part({ x: h.cx(), y: h.y - 4, vx: 0, vy: -0.4, life: 8, size: 2,
              color: '#FCE0A8', light: true });
          }
        },
        draw: function (h, cx, cy) {
          var x0 = h.cx() - cx, y0 = h.cy() - cy;
          var blink = h.age > fuse - 24 && (h.age % 6 < 3);
          gfx.circle(x0, y0, 7, '#101018');
          gfx.circle(x0, y0, 6, blink ? '#F87858' : '#00A800');
          gfx.circle(x0 - 2, y0 - 2, 2, blink ? '#FCFCFC' : '#B8F818');
          gfx.rect(x0 - 1, y0 - 10, 2, 4, '#8C4A20');
          if (blink) gfx.rect(x0 - 1, y0 - 12, 3, 3, '#FCE0A8');
        }
      });
      st.hazards.push(hz);
      A.sfx.bombThrow();
      return hz;
    },

    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['lob', 'mines', 'rain'])) A.sfx.blip();
          break;

        /* --- 遅延爆弾を投げる --- */
        case 'lob':
          this.vx = 0;
          if (this.actT < 16) this.facePlayer(st);
          this.pose.armR = -8 + Math.round(this.actT / 4);
          if (this.actT === 20 || (this.enraged && this.actT === 40)) {
            var n = this.enraged ? 2 : 1;
            for (var i = 0; i < n; i++) {
              var dx = st.player.cx() - this.cx();
              var vx = U.clamp(dx / 46, -3.6, 3.6) + U.rndRange(-0.4, 0.4);
              this.makeBomb(st, this.cx() + this.face * 12, this.cy() - 6, vx, -4.6, 66);
            }
          }
          if (this.actT > (this.enraged ? 62 : 44)) { this.pose.armR = 0; this.setAct('wait', 0); }
          break;

        /* --- 地雷を並べて設置 --- */
        case 'mines':
          if (this.actT === 1) { A.sfx.charge(); this.facePlayer(st); }
          this.vx = this.face * 2.0;
          var cnt = this.enraged ? 5 : 3;
          if (this.actT >= 14 && (this.actT - 14) % 16 === 0) {
            var idx = (this.actT - 14) / 16;
            if (idx < cnt) {
              this.makeBomb(st, this.cx(), this.feetY() - 8, 0, 0, 96 - idx * 14);
              this.pose.crouch = 4;
            } else { this.pose.crouch = 0; this.vx = 0; this.setAct('wait', 0); }
          }
          if (this.actT % 8 === 0) this.pose.crouch = 0;
          break;

        /* --- 爆弾の雨 --- */
        case 'rain':
          this.vx = 0;
          if (this.actT === 1) { A.sfx.bossWarn(); st.requestZoom(0.85, 160); }
          if (this.actT === 14) { this.vy = -7.2; }
          var rn = this.enraged ? 8 : 5;
          if (this.actT >= 34 && (this.actT - 34) % 14 === 0) {
            var ri = (this.actT - 34) / 14;
            if (ri < rn) {
              var px = U.rndRange(this.arena.x0 + 20, this.arena.x1 - 20);
              this.makeBomb(st, px, this.arena.floorY - 160, U.rndRange(-0.6, 0.6), 0, 56);
            } else if (ri > rn + 1) this.setAct('wait', 0);
          }
          break;
      }
    },

    decorate: function (h, override) {
      // 頭の導火線
      var c = override || '#8C4A20';
      h.R(-1, h.headY - 8, 2, 6, c);
      var spark = (this.age % 8 < 4);
      h.R(-2, h.headY - 11, 4, 3, override || (spark ? '#FCE0A8' : '#FC9838'));
      // 胸の爆弾マーク
      h.R(-3, h.bodyTop + 12, 6, 6, override || '#101018');
      h.R(-2, h.bodyTop + 13, 4, 4, override || '#B8F818');
    }
  });

  /* ======================================================================
     ⑤ カットマン風  ─ ブーメランカッター / 突進斬り / 空中複数カッター
     ====================================================================== */
  var CutMan = extend({
    id: 'cut', name: 'CUT MAN', drop: 'cutter', weakness: 'arm', entrance: 'slide',
    col: { main:'#FCFCFC', dark:'#7C7C7C', light:'#BCBCBC', trim:'#D82800', eye:'#00E8D8' },
    faceCol: '#BCBCBC'
  }, {
    init: function () { this.boomer = null; },

    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['boomerang', 'dash', 'aerial'])) A.sfx.blip();
          break;

        /* --- 戻ってくるカッター --- */
        case 'boomerang':
          this.vx = 0;
          if (this.actT < 14) this.facePlayer(st);
          this.pose.armR = -7;
          if (this.actT === 18) {
            this.throwCutter(st, this.face, -0.9, true);
            if (this.enraged) this.throwCutter(st, this.face, -2.4, true);
          }
          if (this.actT > 66) { this.pose.armR = 0; this.setAct('wait', 0); }
          break;

        /* --- 突進斬り --- */
        case 'dash':
          if (this.actT === 1) { this.facePlayer(st); A.sfx.charge(); }
          if (this.actT < 18) {
            // 予備動作：かがんで溜める
            this.pose.crouch = 5; this.pose.lean = -3; this.vx = 0;
          } else if (this.actT < (this.enraged ? 56 : 44)) {
            this.pose.crouch = 0; this.pose.lean = 4;
            this.vx = this.face * (this.enraged ? 5.2 : 4.0);
            if (this.actT % 3 === 0) {
              G.fx.part({ x: this.cx() - this.face * 10, y: this.cy() + U.rndRange(-10, 10),
                vx: -this.face * 1.2, vy: 0, life: 12, size: 3,
                color: '#FCFCFC', color2: '#00E8D8', type: 'spark' });
            }
            // 端に着いたら折り返す
            if (this.x <= this.arena.x0 + 1 || this.x + this.w >= this.arena.x1 - 1) {
              this.face = -this.face;
              A.sfx.deflect();
              G.fx.shake(2, 8);
            }
          } else {
            this.pose.lean = 0; this.vx = 0;
            if (this.actT > (this.enraged ? 66 : 54)) this.setAct('wait', 0);
          }
          break;

        /* --- 空中から複数カッター --- */
        case 'aerial':
          if (this.actT === 1) { this.facePlayer(st); A.sfx.bossWarn(); st.requestZoom(0.88, 120); }
          if (this.actT === 10) { this.vy = -7.6; this.vx = this.face * 1.6; }
          this.pose.crouch = this.onGround ? 0 : 3;
          if (this.actT === 34) {
            var n = this.enraged ? 5 : 3;
            for (var i = 0; i < n; i++) {
              var a = -0.9 + (i / (n - 1)) * 1.8;
              this.throwCutterAngle(st, a + (this.face > 0 ? 0 : Math.PI), false);
            }
            A.sfx.cutter();
            G.fx.flash('#BCBCBC', 4, 0.28);
          }
          if (this.actT > 76 && this.onGround) { this.pose.crouch = 0; this.setAct('wait', 0); }
          break;
      }
    },

    throwCutter: function (st, dir, vy, ret) {
      var self = this;
      var sh = new W.EnemyShot(this.cx() + dir * 12, this.cy() - 4, dir * 4.4, vy, {
        dmg: 5, size: 14, style: 'blade', color: '#BCBCBC', life: 200, hitsWall: false
      });
      sh.returning = ret;
      sh.startAge = 0;
      var baseUpdate = sh.update;
      sh.update = function (stt) {
        this.age++;
        this.spin += 0.5;
        if (this.returning && this.age > 30) {
          var a = Math.atan2(self.cy() - this.cy(), self.cx() - this.cx());
          this.vx = U.lerp(this.vx, Math.cos(a) * 5.4, 0.16);
          this.vy = U.lerp(this.vy, Math.sin(a) * 5.4, 0.16);
          if (U.dist(this.cx(), this.cy(), self.cx(), self.cy()) < 16 && this.age > 46) this.dead = true;
        } else {
          this.vy += 0.035;
        }
        this.x += this.vx; this.y += this.vy;
        if (--this.life <= 0) this.dead = true;
      };
      st.shots.push(sh);
      A.sfx.cutter();
    },

    throwCutterAngle: function (st, ang, ret) {
      var sp = 4.2;
      var sh = new W.EnemyShot(this.cx(), this.cy(), Math.cos(ang) * sp, Math.sin(ang) * sp, {
        dmg: 5, size: 14, style: 'blade', color: '#BCBCBC', life: 150, hitsWall: false, grav: 0.05
      });
      st.shots.push(sh);
    },

    decorate: function (h, override) {
      // 頭のハサミ
      var c = override || '#D82800';
      h.Blk(-6, h.headY - 10, 5, 10, c, override || '#F87858', null);
      h.Blk(2, h.headY - 10, 5, 10, c, override || '#F87858', null);
      h.R(-4, h.headY - 12, 2, 4, override || '#BCBCBC');
      h.R(3, h.headY - 12, 2, 4, override || '#BCBCBC');
    }
  });

  /* ======================================================================
     ⑥ ガッツマン風  ─ 岩投げ / 着地衝撃波 / 岩連打＋破片
     ====================================================================== */
  var GutsMan = extend({
    id: 'guts', name: 'GUTS MAN', drop: 'arm', weakness: 'bomb', entrance: 'drop',
    col: { main:'#FC9838', dark:'#8C4A20', light:'#FCE0A8', trim:'#D8A860', eye:'#00E8D8' },
    faceCol: '#FC9838', busterResist: true
  }, {
    runAct: function (st) {
      switch (this.act) {
        case 'wait':
          if (this.doWait(st, ['throw', 'quake', 'barrage'])) A.sfx.blip();
          break;

        /* --- 岩を持ち上げて投げる --- */
        case 'throw':
          this.vx = 0;
          if (this.actT < 16) this.facePlayer(st);
          // 持ち上げるモーション
          if (this.actT < 26) { this.pose.crouch = 5; this.pose.armL = 4; this.pose.armR = 4; }
          else { this.pose.crouch = 0; this.pose.armL = -10; this.pose.armR = -10; }
          if (this.actT === 34) {
            this.throwRock(st, 3.6, -3.0);
            if (this.enraged) this.throwRock(st, 2.4, -4.4);
          }
          if (this.actT > 62) { this.pose.armL = this.pose.armR = 0; this.setAct('wait', 0); }
          break;

        /* --- 大ジャンプ→着地衝撃波 --- */
        case 'quake':
          if (this.actT === 1) { this.facePlayer(st); A.sfx.charge(); st.requestZoom(0.85, 140); }
          if (this.actT < 20) { this.pose.crouch = 6; this.vx = 0; }
          if (this.actT === 20) {
            this.pose.crouch = 0;
            this.vy = -9.4;
            this.vx = this.face * 1.9;
            A.sfx.jump();
          }
          if (this.actT > 24 && this.onGround) {
            // 着地！ 両側へ衝撃波
            this.quakeLand(st);
            this.setAct('recover', 0);
          }
          if (this.actT > 150) this.setAct('wait', 0);
          break;

        /* --- 岩の連打（当たると破片が散る） --- */
        case 'barrage':
          this.vx = 0;
          if (this.actT === 1) { this.facePlayer(st); A.sfx.bossWarn(); }
          this.pose.armR = -9;
          var n = this.enraged ? 4 : 3;
          if (this.actT >= 22 && (this.actT - 22) % 15 === 0) {
            var i = (this.actT - 22) / 15;
            if (i < n) {
              this.throwRock(st, 4.6, -1.2 - i * 0.5, true);
            } else { this.pose.armR = 0; this.setAct('wait', 0); }
          }
          break;

        case 'recover':
          this.vx = 0;
          this.pose.crouch = Math.max(0, 6 - this.actT);
          if (this.actT > 26) this.setAct('wait', 0);
          break;
      }
    },

    quakeLand: function (st) {
      A.sfx.quake();
      G.fx.shake(7, 40);
      G.fx.flash('#FCE0A8', 5, 0.35);
      G.fx.ring(this.cx(), this.feetY(), 4, 70, 22, '#FCE0A8');
      G.fx.debris(this.cx(), this.feetY(), 14, ['#8C4A20', '#D8A860', '#FC9838']);
      // 地面を走る衝撃波を左右に
      [-1, 1].forEach(function (d) {
        st.hazards.push(new Hazard(this.cx() - 10, this.arena.floorY - 18, 20, 18, {
          dmg: 5, element: 'quake', life: 100, vx: d * (this.enraged ? 3.6 : 2.8),
          draw: function (h, cx, cy) {
            var x0 = h.cx() - cx, y0 = h.y - cy;
            var k = 1 - h.age / h.life;
            var hh = 18 * (0.5 + k * 0.5);
            var ctx = gfx.ctx;
            ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
            // ぎざぎざの地割れ
            for (var i = 0; i < 3; i++) {
              gfx.rect(x0 - 8 + i * 6, y0 + 18 - hh + (i % 2) * 4, 5, hh - (i % 2) * 4, '#8C4A20');
              gfx.rect(x0 - 8 + i * 6, y0 + 18 - hh + (i % 2) * 4, 5, 3, '#FCE0A8');
            }
            ctx.restore();
            if (h.age % 4 === 0) {
              G.fx.part({ x: h.cx(), y: h.y + 16, vx: U.rndRange(-1, 1), vy: -U.rndRange(0.6, 2),
                grav: 0.14, life: 20, size: 3, color: '#8C4A20', color2: '#D8A860' });
            }
          }
        }));
      }, this);
      // プレイヤーが地上にいたら少し浮かされる（原作の「動けなくなる」感じ）
      if (st.player.onGround) { st.player.vy = -2.2; }
    },

    throwRock: function (st, sp, vy, shatter) {
      var self = this;
      var sh = new W.EnemyShot(this.cx() + this.face * 15, this.cy() - 6,
        this.face * sp, vy, {
          dmg: 6, size: 18, style: 'rock', color: '#8C4A20', grav: 0.20, life: 200
        });
      // 何かに当たった/落ちたら破片を撒く
      var origUpdate = sh.update;
      sh.update = function (stt) {
        origUpdate.call(this, stt);
        if (this.dead && shatter) {
          for (var i = 0; i < 3; i++) {
            stt.shots.push(new W.EnemyShot(this.cx(), this.cy(),
              U.rndRange(-2.4, 2.4), -U.rndRange(1.4, 3),
              { dmg: 3, size: 10, style: 'rock', grav: 0.24, life: 90 }));
          }
          G.fx.debris(this.cx(), this.cy(), 6, ['#8C4A20', '#D8A860']);
        }
      };
      st.shots.push(sh);
      A.sfx.rockThrow();
      G.fx.shake(2, 8);
    },

    decorate: function (h, override) {
      // ずんぐりした肩アーマー
      var c = override || '#FCE0A8';
      h.Blk(-15, h.bodyTop + 4 + this.pose.armL, 9, 7, c, null, override || '#8C4A20');
      h.Blk(7, h.bodyTop + 4 + this.pose.armR, 9, 7, c, null, override || '#8C4A20');
      // ヘルメットのライン
      h.R(-7, h.headY - 3, 14, 3, override || '#D8A860');
    }
  });

  /* ======================================================================
     一覧（ステージセレクトの並び順もここ）
     ====================================================================== */
  var LIST = [
    { key: 'cut',  Ctor: CutMan },
    { key: 'elec', Ctor: ElecMan },
    { key: 'ice',  Ctor: IceMan },
    { key: 'fire', Ctor: FireMan },
    { key: 'bomb', Ctor: BombMan },
    { key: 'guts', Ctor: GutsMan }
  ];
  var BY_KEY = {};
  LIST.forEach(function (b) { BY_KEY[b.key] = b; b.def = b.Ctor.def; });

  function create(key, x, y) {
    var e = BY_KEY[key];
    return e ? new e.Ctor(x, y) : null;
  }

  /* 2色を混ぜる（クリア済みの顔を「色味は残しつつ暗く」するのに使う） */
  function mix(hex, hex2, t) {
    function p(h) {
      return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    }
    var a = p(hex), b = p(hex2), o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(a[i] + (b[i] - a[i]) * t);
      o += ('0' + v.toString(16)).slice(-2);
    }
    return o;
  }

  /* ステージセレクト用の顔アイコン（本体と同じ配色で描く）
     dim=true（撃破済み）でも、どのボスか分かるよう色味は残す */
  function drawFace(key, x, y, size, dim) {
    var d = BY_KEY[key].def;
    var c = d.col;
    var s = size / 24;
    function R(dx, dy, w, h, col) {
      gfx.rect(x + dx * s, y + dy * s, Math.max(1, w * s), Math.max(1, h * s), col);
    }
    var D = 0.72;                       // どれだけ暗くするか
    function dc(col) { return dim ? mix(col, '#1C1C2C', D) : col; }
    var main = dc(c.main);
    var light = dc(c.light);
    var dark = dc(c.dark);
    var eye = dc(c.eye);

    // 頭のベース
    R(-10, -10, 20, 20, '#101018');
    R(-9, -9, 18, 18, main);
    R(-9, -9, 18, 3, light);
    R(-9, 6, 18, 3, dark);
    // 顔（暗い面）
    R(-6, -3, 12, 9, '#101018');
    R(-4, 0, 3, 3, eye);
    R(1, 0, 3, 3, eye);
    // 口元
    R(-3, 4, 6, 1, dc(c.trim));

    // ボスごとの特徴（ここが各ボスの見分けどころ）
    if (key === 'elec') { R(-5, -14, 4, 5, light); R(1, -13, 4, 5, light); }
    if (key === 'fire') { R(-4, -15, 4, 6, dc('#FC9838'));
                          R(1, -16, 4, 7, dc('#FCE0A8')); }
    if (key === 'ice')  { R(-11, -7, 22, 5, dc('#BCE8FC')); }
    if (key === 'bomb') { R(-1, -14, 2, 5, dc('#8C4A20'));
                          R(-2, -17, 4, 3, dc('#FCE0A8')); }
    if (key === 'cut')  { R(-7, -16, 4, 8, dc('#D82800'));
                          R(3, -16, 4, 8, dc('#D82800')); }
    if (key === 'guts') { R(-12, -4, 5, 8, light); R(7, -4, 5, 8, light);
                          R(-9, -5, 18, 3, dc('#D8A860')); }
  }

  return {
    LIST: LIST, BY_KEY: BY_KEY, create: create, drawFace: drawFace,
    Hazard: Hazard, MAX_HP: MAX_HP,
    ElecMan: ElecMan, FireMan: FireMan, IceMan: IceMan,
    BombMan: BombMan, CutMan: CutMan, GutsMan: GutsMan
  };
})();
