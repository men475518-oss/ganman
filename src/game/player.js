/* =========================================================================
   player.js  --  主人公「ガンマン」

   操作感は原作(ファミコン版)の数値に寄せてある：
     歩行速度 1.35px/F ／ ジャンプ初速 -4.9 ／ 重力 0.25 ／ 落下上限 7
     加速度は付けない（押した瞬間に最高速＝キビキビした操作感）
   ========================================================================= */
G.Player = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles, W = G.weapons;

  /* ---------------- 調整用の定数（ここをいじれば挙動が変わる） ----------------

     ジャンプの「飛距離」と「高さ」は別々に効く量で決まる：
       高さ   = JUMP_V^2 / (2 * GRAV)
       滞空   = 2 * JUMP_V / GRAV
       飛距離 = 横速度 * 滞空
     重力やジャンプ初速をいじると高さの方が大きく伸びてしまうので、
     飛距離だけを伸ばしたいときは AIR（空中の横速度）を上げる。       */
  var WALK      = 1.35;   // 地上の歩行速度
  var AIR       = 1.60;   // 空中の横移動速度。歩行より少し速く、跳ぶと遠くまで届く
  var JUMP_V    = -4.90;
  var GRAV      = 0.235;  // 少しだけ軽くして滞空時間を伸ばしている
  var MAX_FALL  = 7.0;
  var CLIMB_SP  = 1.20;
  /* --- 水中：重力が弱まり、ゆっくり沈み、ジャンプが高くなる --- */
  /* 水中は重力が弱いので、ジャンプ初速はむしろ下げないと跳びすぎる。
     高さ = 初速^2 / (2 * 重力) なので、重力を 0.55 倍にしたぶん
     初速を 0.85 倍にして、地上の約1.3倍の高さに収めている。      */
  var WATER_GRAV = 0.55;   // 重力の倍率
  var WATER_FALL = 0.45;   // 落下上限の倍率（ゆっくり沈む）
  var WATER_JUMP = 0.85;   // ジャンプ初速の倍率
  /* --- ベルトコンベアに乗ったときに流される速さ --- */
  var BELT_PUSH  = 0.78;
  var ICE_ACCEL = 0.09;   // 氷の上での加速
  var ICE_FRIC  = 0.985;  // 氷の上での減速（1に近いほど滑る）
  var HURT_TIME = 22;     // のけぞって動けない時間
  var INVUL     = 84;     // 無敵時間
  var CHARGE_1  = 30;     // ここからチャージ段階1
  var CHARGE_2  = 68;     // ここから最大チャージ
  var MAX_HP    = 28;
  var MAX_AMMO  = 28;

  function Player(x, y) {
    this.w = 12; this.h = 22;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    this.vx = 0; this.vy = 0;
    this.face = 1;

    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.lives = 2;

    this.state = 'idle';     // idle/run/jump/climb/hurt/dead/teleport/victory
    this.onGround = false;
    this.wasGround = false;

    this.invul = 0;
    this.hurtTimer = 0;
    this.animT = 0;
    this.runFrame = 0;
    this.shootTimer = 0;     // 撃った直後の腕を出すポーズ
    this.charge = 0;
    this.chargeSfx = false;

    this.controlEnabled = true;
    this.dead = false;
    this.deathTimer = 0;

    this.onIce = false;
    this.inWater = false;
    this.belt = 0;
    this.climbing = false;
    this.ladderX = 0;

    /* --- 武器 --- */
    this.weapons = ['buster'];     // 所持している武器ID
    this.weaponIndex = 0;
    this.ammo = {};
    for (var i = 0; i < W.WEAPONS.length; i++) this.ammo[W.WEAPONS[i].id] = MAX_AMMO;

    this.teleportY = -60;          // 登場演出用
  }

  Player.MAX_HP = MAX_HP;
  Player.MAX_AMMO = MAX_AMMO;

  var P = Player.prototype;

  P.hitbox = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  P.cx = function () { return this.x + this.w / 2; };
  P.cy = function () { return this.y + this.h / 2; };
  P.weaponId = function () { return this.weapons[this.weaponIndex]; };
  P.weaponDef = function () { return W.BY_ID[this.weaponId()]; };

  /* 弾の出る位置（バスターの銃口） */
  P.muzzle = function () {
    return { x: this.cx() + this.face * 11, y: this.y + 11 };
  };

  /* ---------------- 武器の入手と切り替え ---------------- */
  P.giveWeapon = function (id) {
    if (this.weapons.indexOf(id) < 0) this.weapons.push(id);
    this.ammo[id] = MAX_AMMO;
  };
  P.cycleWeapon = function (dir) {
    if (this.weapons.length < 2) { A.sfx.deny(); return false; }
    this.weaponIndex = (this.weaponIndex + (dir || 1) + this.weapons.length) % this.weapons.length;
    A.sfx.weaponSwitch();
    G.fx.burst(this.cx(), this.cy(), 10, {
      speed: 1.8, life: 16, size: 2, color: this.weaponDef().color, light: true });
    return true;
  };
  P.selectWeapon = function (idx) {
    if (idx >= 0 && idx < this.weapons.length) {
      this.weaponIndex = idx;
      A.sfx.weaponSwitch();
    }
  };

  /* ---------------- ダメージ ---------------- */
  P.damage = function (amount, fromX) {
    if (this.invul > 0 || this.state === 'dead' || this.state === 'teleport') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }

    this.invul = INVUL;
    this.hurtTimer = HURT_TIME;
    this.state = 'hurt';
    this.climbing = false;
    // 攻撃を受けた側と逆方向に軽くノックバック
    var dir = (fromX === undefined) ? -this.face : (this.cx() < fromX ? -1 : 1);
    this.vx = dir * 1.05;
    this.vy = -1.15;
    this.cancelCharge();

    A.sfx.hurt();
    G.fx.flash('#F87858', 6, 0.42);
    G.fx.shake(3, 14);
    G.fx.burst(this.cx(), this.cy(), 8, { speed: 2, life: 16, size: 2, color: '#F87858' });
    return true;
  };

  P.die = function () {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathTimer = 0;
    this.cancelCharge();
    A.sfx.death();
    // 原作の「8方向に飛び散る」やられ演出
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      G.fx.part({
        x: this.cx(), y: this.cy(),
        vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2,
        life: 70, size: 4, color: '#BCE8FC', color2: '#0058F8',
        type: 'circle', light: true, shrink: false, drag: 1
      });
      G.fx.part({
        x: this.cx(), y: this.cy(),
        vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 1.1,
        life: 70, size: 3, color: '#FCFCFC', color2: '#3CBCFC',
        type: 'circle', light: true, shrink: false, drag: 1
      });
    }
    G.fx.flash('#FCFCFC', 5, 0.5);
  };

  P.cancelCharge = function () {
    this.charge = 0;
    if (this.chargeSfx) { A.chargeStop(); this.chargeSfx = false; }
  };

  P.chargeLevel = function () {
    if (this.charge >= CHARGE_2) return 2;
    if (this.charge >= CHARGE_1) return 1;
    return 0;
  };

  /* ---------------- 登場演出（上からビームで降りてくる） ---------------- */
  P.startTeleport = function () {
    this.state = 'teleport';
    this.teleportY = -70;
    this.controlEnabled = false;
    A.sfx.teleportIn();
  };

  /* ======================================================================
     毎フレーム更新
     ====================================================================== */
  P.update = function (st) {
    var inp = G.input;

    /* --- やられ中：しばらく待ってからステージ側が処理する --- */
    if (this.state === 'dead') {
      this.deathTimer++;
      return;
    }

    /* --- 登場（テレポート）演出 --- */
    if (this.state === 'teleport') {
      this.teleportY += 9;
      if (this.teleportY >= 0) {
        this.teleportY = 0;
        this.state = 'idle';
        this.controlEnabled = true;
        this.vy = 0;
        A.sfx.land2();
        G.fx.dust(this.cx() - 5, this.y + this.h, -1);
        G.fx.dust(this.cx() + 5, this.y + this.h, 1);
        G.fx.ring(this.cx(), this.y + this.h, 2, 22, 12, '#BCE8FC');
      }
      return;
    }

    this.animT++;
    if (this.invul > 0) this.invul--;
    if (this.shootTimer > 0) this.shootTimer--;

    var canAct = this.controlEnabled && this.hurtTimer <= 0;

    /* --- のけぞり中 --- */
    if (this.hurtTimer > 0) {
      this.hurtTimer--;
      if (this.hurtTimer === 0 && this.state === 'hurt') this.state = 'idle';
    }

    /* ================= はしご ================= */
    var onLadder = TL.boxLadder(this.x + 3, this.y, this.w - 6, this.h);
    var ladderBelow = TL.boxLadder(this.x + 3, this.y + this.h, this.w - 6, 4);

    if (this.climbing) {
      // はしごから外れたら通常状態へ
      if (!onLadder && !ladderBelow) this.climbing = false;
    } else if (canAct && onLadder && (inp.held.up || (inp.held.down && !this.onGround))) {
      this.climbing = true;
      this.vx = 0; this.vy = 0;
      // はしごの中心にスナップ
      var tx = Math.floor(this.cx() / TL.T);
      this.x = tx * TL.T + TL.T / 2 - this.w / 2;
    } else if (canAct && this.onGround && inp.held.down && ladderBelow && !onLadder) {
      // 上に乗ったはしごから降りる
      this.climbing = true;
      this.y += 4;
      var tx2 = Math.floor(this.cx() / TL.T);
      this.x = tx2 * TL.T + TL.T / 2 - this.w / 2;
    }

    if (this.climbing) {
      this.state = 'climb';
      this.vy = 0;
      if (canAct) {
        if (inp.held.up)   { this.vy = -CLIMB_SP; }
        else if (inp.held.down) { this.vy = CLIMB_SP; }
        // はしごの途中でジャンプすると降りられる
        if (inp.pressed.jump) {
          this.climbing = false;
          this.vy = 0;
          this.state = 'jump';
        }
      }
      if (this.climbing) {
        if (this.vy !== 0) this.animT++;
        TL.moveY(this, this.vy);
        // 一番上まで登り切ったら地面に立つ
        if (!TL.boxLadder(this.x + 3, this.y + this.h - 2, this.w - 6, 4)) {
          if (this.vy < 0) {
            this.climbing = false;
            this.state = 'idle';
            this.vy = 0;
          }
        }
        if (TL.onGround(this) && this.vy > 0) { this.climbing = false; this.state = 'idle'; }
        this.handleShooting(st, canAct);
        this.postUpdate(st);
        return;
      }
    }

    /* ================= 足元と周囲の状態を調べる ================= */
    this.onIce = TL.boxSlippery(this.x, this.y + this.h, this.w, 2);
    this.inWater = TL.boxWater(this.x + 2, this.y + 4, this.w - 4, this.h - 6);
    // ベルトコンベアは足元1px下を見る（乗っているときだけ流される）
    this.belt = this.onGround ? TL.conveyorAt(this.x, this.y + this.h + 1, this.w) : 0;
    // 崩れる床に乗ったら、崩壊のカウントを始めさせる
    if (this.onGround) TL.crumbleTouch(this.x, this.y + this.h + 1, this.w);

    /* ================= 横移動 ================= */

    if (canAct) {
      var ax = 0;
      if (inp.held.left)  ax = -1;
      if (inp.held.right) ax = 1;
      // スティックを倒した量が小さくても最低限動く（原作はデジタル入力なので）
      if (ax !== 0) this.face = ax;

      if (this.onIce && this.onGround) {
        // 氷：じわっと加速してなかなか止まらない
        if (ax !== 0) this.vx = U.clamp(this.vx + ax * ICE_ACCEL, -WALK, WALK);
        else this.vx *= ICE_FRIC;
        if (Math.abs(this.vx) < 0.02) this.vx = 0;
      } else {
        // 空中では少し速く動けるので、ジャンプの飛距離が伸びる
        this.vx = ax * (this.onGround ? WALK : AIR);
      }
    } else if (this.hurtTimer > 0) {
      this.vx *= 0.94;   // のけぞりは徐々に減速
    }

    /* ================= ジャンプ ================= */
    if (canAct && inp.pressed.jump && this.onGround) {
      this.vy = JUMP_V * (this.inWater ? WATER_JUMP : 1);
      this.onGround = false;
      this.state = 'jump';
      A.sfx.jump();
      G.fx.dust(this.cx(), this.y + this.h, 0);
    }
    // ボタンを離したら上昇を打ち切る＝ジャンプの高さを調整できる
    var cut = this.inWater ? -2.2 : -1.6;
    if (!inp.held.jump && this.vy < cut) this.vy = cut;

    /* ================= 重力（水中は弱い） ================= */
    var grav = this.inWater ? GRAV * WATER_GRAV : GRAV;
    var maxFall = this.inWater ? MAX_FALL * WATER_FALL : MAX_FALL;
    this.vy = Math.min(this.vy + grav, maxFall);

    // 水中では泡が立ちのぼる
    if (this.inWater && this.animT % 14 === 0) {
      G.fx.part({ x: this.cx() + U.rndRange(-5, 5), y: this.y + U.rndRange(0, 10),
        vx: U.rndRange(-0.15, 0.15), vy: -U.rndRange(0.4, 0.9),
        life: U.rndInt(24, 44), size: U.rndInt(1, 3),
        color: '#BCE8FC', type: 'circle', shrink: false });
    }

    /* ================= 移動の適用（コンベアの分だけ流される） ================= */
    TL.moveX(this, this.vx + this.belt * BELT_PUSH);
    this.wasGround = this.onGround;
    var hitY = TL.moveY(this, this.vy);
    this.onGround = (hitY === 1) || TL.onGround(this);

    // 着地した瞬間の演出
    if (this.onGround && !this.wasGround) {
      if (this.state === 'jump' || this.state === 'hurt') {
        A.sfx.land();
        G.fx.dust(this.cx() - 4, this.y + this.h, -1);
        G.fx.dust(this.cx() + 4, this.y + this.h, 1);
      }
      if (this.hurtTimer <= 0) this.state = 'idle';
    }

    /* ================= 状態の決定 ================= */
    if (this.hurtTimer > 0) this.state = 'hurt';
    else if (!this.onGround) this.state = 'jump';
    else if (Math.abs(this.vx) > 0.1) this.state = 'run';
    else this.state = 'idle';

    /* ================= 走行アニメ ================= */
    if (this.state === 'run') {
      if (this.animT % 7 === 0) {
        this.runFrame = (this.runFrame + 1) % 3;
        // 走行中の足元の砂ぼこり
        if (this.runFrame === 0) G.fx.dust(this.cx() - this.face * 4, this.y + this.h, -this.face * 0.5);
      }
    } else this.runFrame = 0;

    this.handleShooting(st, canAct);
    this.postUpdate(st);
  };

  /* ---------------- ショットとチャージ ---------------- */
  P.handleShooting = function (st, canAct) {
    var inp = G.input;
    var def = this.weaponDef();

    if (!canAct) { this.cancelCharge(); return; }

    // --- チャージできる武器（バスター）だけ長押しを溜める ---
    if (def.charge) {
      if (inp.held.shot) {
        this.charge++;
        if (this.charge === CHARGE_1) { A.sfx.chargeTick(); A.chargeStart(); this.chargeSfx = true; }
        if (this.charge === CHARGE_2) { A.sfx.chargeMax(); }
        if (this.chargeSfx) {
          A.chargeLevel(U.clamp((this.charge - CHARGE_1) / (CHARGE_2 - CHARGE_1), 0, 1));
        }
        // 溜め中のオーラ
        var lv = this.chargeLevel();
        if (lv > 0 && this.animT % (lv === 2 ? 2 : 4) === 0) {
          var a = U.rnd() * Math.PI * 2, r = 18 + U.rnd() * 8;
          G.fx.part({
            x: this.cx() + Math.cos(a) * r, y: this.cy() + Math.sin(a) * r,
            vx: -Math.cos(a) * 1.5, vy: -Math.sin(a) * 1.5,
            life: 12, size: lv === 2 ? 3 : 2,
            color: lv === 2 ? '#FCFCFC' : '#3CBCFC', color2: '#0058F8',
            type: 'circle', light: true
          });
        }
      }
      // 離した瞬間に発射（溜まっていれば強い弾）
      if (inp.released.shot) {
        var level = this.chargeLevel();
        if (W.fire(this, st, 'buster', level)) this.shootTimer = 16;
        this.cancelCharge();
      }
    } else {
      // チャージ非対応の武器は押した瞬間に発射
      if (inp.pressed.shot) {
        if (W.fire(this, st, this.weaponId(), 0)) this.shootTimer = 16;
      }
      this.charge = 0;
    }

    // --- 武器切り替え ---
    if (inp.pressed.weapon) this.cycleWeapon(1);
  };

  /* ---------------- 移動後の共通処理（トゲ・落下死） ---------------- */
  P.postUpdate = function (st) {
    // 明滅ブロックが体の中に出現した場合などの保険。上下に少し逃がす
    TL.unstick(this);

    // トゲに触れたら即死（原作準拠）
    if (TL.boxHazard(this.x + 2, this.y + 2, this.w - 4, this.h - 4)) {
      this.hp = 0;
      this.die();
      return;
    }
    // 穴に落ちた
    var lv = TL.getLevel();
    if (lv && this.y > lv.pxH + 24) {
      this.hp = 0;
      this.die();
    }
  };

  /* ======================================================================
     描画
     ====================================================================== */
  P.draw = function (camX, camY) {
    var sp = G.sprites.player;
    var ctx = gfx.ctx;

    /* --- テレポート降下中：光の柱 --- */
    if (this.state === 'teleport') {
      var bx = this.cx() - camX;
      var by = this.y + this.h - camY;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 上から降りてくるビーム
      gfx.rect(bx - 3, by + this.teleportY - 40, 6, 40, '#3CBCFC');
      gfx.rect(bx - 1, by + this.teleportY - 44, 2, 44, '#FCFCFC');
      ctx.restore();
      return;
    }

    if (this.state === 'dead') return;   // やられ演出はパーティクルだけ

    // 無敵中は点滅（2フレームごと）
    if (this.invul > 0 && (this.invul % 4 < 2)) return;

    var f = this.face;
    var box, frame;
    if (this.state === 'climb') {
      box = sp.climb[Math.floor(this.animT / 8) % 2];
    } else if (this.state === 'hurt') {
      box = sp.hurt;
    } else if (this.state === 'jump') {
      box = sp.jump;
    } else if (this.state === 'run') {
      box = sp.run[this.runFrame];
    } else if (this.state === 'victory') {
      box = sp.idle;
    } else {
      box = sp.idle;
    }

    var dx = Math.round(this.cx() - camX - box.w / 2);
    var dy = Math.round(this.y - camY);

    /* --- チャージ中は青白く発光 --- */
    var lv = this.chargeLevel();
    if (lv > 0) {
      var glow = (this.animT % 6 < 3);
      if (glow) {
        ctx.save();
        ctx.globalAlpha = lv === 2 ? 0.85 : 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(box.sil(lv === 2 ? '#FCFCFC' : '#3CBCFC', f), dx, dy);
        ctx.restore();
      }
    }

    ctx.drawImage(box.get(f), dx, dy);

    /* --- 撃った直後はバスターの腕を重ねて描く --- */
    if (this.shootTimer > 0 && this.state !== 'climb') {
      var bu = sp.buster;
      var bx2 = Math.round(this.cx() - camX + (f > 0 ? 4 : -4 - bu.w));
      var by2 = Math.round(this.y - camY + 8);
      ctx.drawImage(bu.get(f), bx2, by2);
      // 発射直後の銃口フラッシュ
      if (this.shootTimer > 12) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        gfx.circle(this.cx() - camX + f * 14, this.y - camY + 11, 4, '#BCE8FC');
        ctx.restore();
      }
    }

    /* --- 勝利ポーズ：腕を上げる --- */
    if (this.state === 'victory') {
      var au = sp.armUp;
      ctx.drawImage(au.get(f), Math.round(this.cx() - camX + (f > 0 ? 3 : -3 - au.w)),
                    Math.round(this.y - camY - 2));
    }
  };

  return Player;
})();
