/* =========================================================================
   enemies.js  --  雑魚敵

   共通インターフェース:
     update(st) / draw(camX,camY) / hitbox() / damage(n, element, st)
     hp / dead / contactDmg / invulnerable

   敵を追加するときは Enemy を継承して TYPES に登録するだけ。
   ========================================================================= */
G.enemies = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles, W = G.weapons;

  /* ======================================================================
     共通ベース
     ====================================================================== */
  function Enemy(x, y, opt) {
    opt = opt || {};
    this.x = x; this.y = y;
    this.w = 16; this.h = 16;
    this.vx = 0; this.vy = 0;
    this.hp = opt.hp || 2;
    this.maxHp = this.hp;
    this.contactDmg = opt.contactDmg || 3;
    this.dead = false;
    this.face = -1;
    this.age = 0;
    this.flash = 0;          // 被弾時の白フラッシュ
    this.frozen = 0;         // アイススラッシャーで凍結
    this.invulnerable = false;
    this.dropChance = opt.dropChance === undefined ? 0.34 : opt.dropChance;
    this.gravity = 0;
    this.spawner = null;     // 復活管理用（stage 側が入れる）
  }
  var E = Enemy.prototype;

  E.hitbox = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  E.cx = function () { return this.x + this.w / 2; };
  E.cy = function () { return this.y + this.h / 2; };

  E.damage = function (n, element, st) {
    if (this.invulnerable || this.dead) return false;
    this.hp -= n;
    this.flash = 5;
    if (this.hp <= 0) { this.kill(st); return true; }
    A.sfx.hit();
    return true;
  };

  E.freezeMe = function (frames) {
    if (this.noFreeze) return;
    this.frozen = frames;
    A.sfx.freeze();
  };

  E.kill = function (st) {
    if (this.dead) return;
    this.dead = true;
    A.sfx.enemyPop();
    G.fx.explode(this.cx(), this.cy(), 0.9);
    if (st && U.rnd() < this.dropChance) st.dropItem(this.cx(), this.cy());
  };

  // 共通の物理（重力＋地形）。使うかは各敵の実装しだい
  E.physics = function () {
    if (this.gravity) {
      this.vy = Math.min(this.vy + this.gravity, 7);
      TL.moveX(this, this.vx);
      var r = TL.moveY(this, this.vy);
      this.onGround = (r === 1);
    } else {
      this.x += this.vx; this.y += this.vy;
    }
  };

  // 凍結中の氷ブロック描画（共通）
  E.drawFrozen = function (camX, camY) {
    var x = this.x - camX, y = this.y - camY;
    var ctx = gfx.ctx;
    ctx.save();
    ctx.globalAlpha = 0.62;
    gfx.rect(x - 2, y - 2, this.w + 4, this.h + 4, '#BCE8FC');
    gfx.rect(x - 1, y - 1, this.w + 2, this.h + 2, '#3CBCFC');
    ctx.globalAlpha = 0.9;
    gfx.rect(x + 1, y + 1, 3, this.h - 4, '#FCFCFC');
    ctx.restore();
  };

  // スプライトを描く（被弾フラッシュ・凍結を考慮した共通処理）
  E.blit = function (box, camX, camY, ox, oy) {
    var ctx = gfx.ctx;
    var dx = Math.round(this.cx() - camX - box.w / 2 + (ox || 0));
    var dy = Math.round(this.y + this.h - box.h - camY + (oy || 0));
    if (this.flash > 0) {
      ctx.drawImage(box.sil('#FCFCFC', this.face), dx, dy);
    } else {
      ctx.drawImage(box.get(this.face), dx, dy);
    }
    if (this.frozen > 0) this.drawFrozen(camX, camY);
  };

  E.preUpdate = function () {
    this.age++;
    if (this.flash > 0) this.flash--;
    if (this.frozen > 0) { this.frozen--; return true; }   // true = 凍って動けない
    return false;
  };

  function extend(Ctor) {
    Ctor.prototype = Object.create(E);
    Ctor.prototype.constructor = Ctor;
    return Ctor;
  }

  /* ======================================================================
     ① メットール風：普段はヘルメットで無敵、開いた時だけ攻撃＆被弾
     ====================================================================== */
  var Met = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 1, contactDmg: 3 });
    this.w = 16; this.h = 14;
    this.mode = 'hide';
    this.timer = 0;
    this.gravity = 0.3;
    this.invulnerable = true;
    this.shotsLeft = 0;
  });
  Met.prototype.update = function (st) {
    if (this.preUpdate()) return;
    var pl = st.player;
    var dx = pl.cx() - this.cx();
    this.face = dx < 0 ? -1 : 1;
    this.vx = 0;
    this.timer++;

    if (this.mode === 'hide') {
      this.invulnerable = true;
      // プレイヤーが近づいたら顔を出す
      if (Math.abs(dx) < 96 && Math.abs(pl.cy() - this.cy()) < 56 && this.timer > 34) {
        this.mode = 'open'; this.timer = 0; this.shotsLeft = 3;
      }
    } else if (this.mode === 'open') {
      this.invulnerable = false;
      if (this.timer === 16) {
        // 3方向に弾を撃つ
        var sp = 2.6;
        [-0.32, 0, 0.32].forEach(function (a) {
          st.shots.push(new W.EnemyShot(this.cx(), this.cy() - 2,
            Math.cos(a) * sp * this.face, Math.sin(Math.abs(a)) * sp * 0.9,
            { dmg: 3, color: '#F8D878', color2: '#FCFCFC', size: 8 }));
        }, this);
        A.sfx.shot();
      }
      if (this.timer > 34 && this.timer < 86) {
        this.vx = this.face * 0.42;   // てくてく歩く
      }
      if (this.timer > 100) { this.mode = 'hide'; this.timer = 0; }
    }
    this.physics();
  };
  Met.prototype.draw = function (camX, camY) {
    var s = G.sprites.enemy.met;
    this.blit(this.mode === 'open' ? s[0] : s[1], camX, camY);
  };

  /* ======================================================================
     ② 飛行敵：上下に波打ちながら突っ込んでくる
     ====================================================================== */
  var Flyer = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 2, contactDmg: 4 });
    this.w = 16; this.h = 10;
    this.baseY = y;
    this.speed = (opt && opt.speed) || 1.5;
    this.amp = (opt && opt.amp) || 22;
    this.dirSet = false;
  });
  Flyer.prototype.update = function (st) {
    if (this.preUpdate()) return;
    if (!this.dirSet) {
      this.face = st.player.cx() < this.cx() ? -1 : 1;
      this.dirSet = true;
    }
    this.x += this.face * this.speed;
    this.y = this.baseY + Math.sin(this.age * 0.075) * this.amp;
    // 排気の粒
    if (this.age % 5 === 0) {
      G.fx.part({ x: this.cx() - this.face * 8, y: this.cy() + 2,
        vx: -this.face * 0.5, vy: 0.1, life: 10, size: 2, color: '#FC9838', light: true });
    }
  };
  Flyer.prototype.draw = function (camX, camY) {
    var s = G.sprites.enemy.fly;
    this.blit(s[Math.floor(this.age / 5) % 2], camX, camY);
  };

  /* ======================================================================
     ③ 砲台：一定間隔で狙い撃ち（撃つ前に光って予告）
     ====================================================================== */
  var Turret = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 4, contactDmg: 3 });
    this.w = 12; this.h = 12;
    this.timer = U.rndInt(0, 60);
  });
  Turret.prototype.update = function (st) {
    if (this.preUpdate()) return;
    this.timer++;
    var pl = st.player;
    this.face = pl.cx() < this.cx() ? -1 : 1;
    if (this.timer === 92) A.sfx.blip();
    if (this.timer >= 110) {
      this.timer = 0;
      var a = Math.atan2(pl.cy() - this.cy(), pl.cx() - this.cx());
      st.shots.push(new W.EnemyShot(this.cx(), this.cy(),
        Math.cos(a) * 3.1, Math.sin(a) * 3.1,
        { dmg: 3, color: '#F878F8', color2: '#FCFCFC', size: 8, style: 'ball' }));
      A.sfx.shot();
      G.fx.burst(this.cx() + Math.cos(a) * 8, this.cy() + Math.sin(a) * 8, 4,
        { speed: 1.2, life: 8, size: 2, color: '#F878F8', light: true });
    }
  };
  Turret.prototype.draw = function (camX, camY) {
    var s = G.sprites.enemy.turret;
    // 発射直前は色が変わる（予告）
    this.blit(this.timer > 92 ? s[1] : s[0], camX, camY);
  };

  /* ======================================================================
     ④ 跳ねる敵：プレイヤーの方へジャンプで詰めてくる
     ====================================================================== */
  var Hopper = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 3, contactDmg: 4 });
    this.w = 14; this.h = 11;
    this.gravity = 0.28;
    this.timer = U.rndInt(0, 40);
    this.onGround = false;
  });
  Hopper.prototype.update = function (st) {
    if (this.preUpdate()) { this.physics(); return; }
    this.timer++;
    if (this.onGround) {
      this.vx = 0;
      if (this.timer > 48) {
        this.timer = 0;
        this.face = st.player.cx() < this.cx() ? -1 : 1;
        this.vy = -4.3;
        this.vx = this.face * 1.35;
        A.sfx.jump();
      }
    }
    this.physics();
    if (this.onGround && this.vy === 0 && this.age % 30 === 0) {
      G.fx.dust(this.cx(), this.y + this.h, 0);
    }
  };
  Hopper.prototype.draw = function (camX, camY) {
    var s = G.sprites.enemy.hop;
    this.blit(this.onGround ? s[1] : s[0], camX, camY);
  };

  /* ======================================================================
     ⑤ 転がる棘：床を転がって往復。凍らない、接触ダメージ大
     ====================================================================== */
  var Spiker = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 5, contactDmg: 6 });
    this.w = 13; this.h = 9;
    this.gravity = 0.3;
    this.face = (opt && opt.dir) || -1;
    this.noFreeze = true;
    this.spin = 0;
  });
  Spiker.prototype.update = function (st) {
    if (this.preUpdate()) { this.physics(); return; }
    this.vx = this.face * 1.25;
    this.spin += this.face * 0.2;
    var hit = TL.moveX(this, this.vx);
    if (hit !== 0) this.face = -this.face;
    // 崖の縁で折り返す
    if (this.onGround && !TL.boxSolid(this.x + (this.face > 0 ? this.w : -2), this.y + this.h + 2, 2, 2)) {
      this.face = -this.face;
    }
    this.vy = Math.min(this.vy + this.gravity, 7);
    var r = TL.moveY(this, this.vy);
    this.onGround = (r === 1);
    if (this.age % 8 === 0) G.fx.dust(this.cx(), this.y + this.h, -this.face * 0.4);
  };
  Spiker.prototype.draw = function (camX, camY) {
    var box = G.sprites.enemy.spike[0];
    var ctx = gfx.ctx;
    ctx.save();
    ctx.translate(Math.round(this.cx() - camX), Math.round(this.cy() - camY));
    ctx.rotate(this.spin);
    var img = this.flash > 0 ? box.sil('#FCFCFC', 1) : box.r;
    ctx.drawImage(img, -box.w / 2 | 0, -box.h / 2 | 0);
    ctx.restore();
  };

  /* ======================================================================
     ⑥ 浮遊する足場（敵ではないが同じ枠で動かすと楽）
     ====================================================================== */
  var Platform = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 999, contactDmg: 0 });
    opt = opt || {};
    this.w = opt.w || 32; this.h = 8;
    this.invulnerable = true;
    this.noFreeze = true;
    this.isPlatform = true;
    this.ax = opt.ax || 0;      // 横の振幅
    this.ay = opt.ay || 40;     // 縦の振幅
    this.spd = opt.spd || 0.012;
    this.ox = x; this.oy = y;
    this.prevX = x; this.prevY = y;
  });
  Platform.prototype.update = function () {
    this.age++;
    this.prevX = this.x; this.prevY = this.y;
    this.x = this.ox + Math.sin(this.age * this.spd) * this.ax;
    this.y = this.oy + Math.sin(this.age * this.spd) * this.ay;
  };
  Platform.prototype.damage = function () { return false; };
  Platform.prototype.draw = function (camX, camY) {
    var x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    gfx.rect(x, y, this.w, this.h, '#101018');
    gfx.rect(x + 1, y + 1, this.w - 2, this.h - 2, '#7C7C7C');
    gfx.rect(x + 1, y + 1, this.w - 2, 2, '#BCBCBC');
    gfx.rect(x + 1, y + this.h - 2, this.w - 2, 1, '#2C2C2C');
    // 噴射
    for (var i = 6; i < this.w - 4; i += 10) {
      gfx.rect(x + i, y + this.h, 3, 2 + (this.age % 6 < 3 ? 1 : 0), '#FC9838');
    }
  };

  /* ======================================================================
     生成のための表
     ====================================================================== */
  var TYPES = {
    met: Met, fly: Flyer, turret: Turret, hop: Hopper, spike: Spiker, plat: Platform
  };

  function create(type, x, y, opt) {
    var C = TYPES[type];
    if (!C) return null;
    return new C(x, y, opt);
  }

  return {
    Enemy: Enemy, extend: extend, create: create, TYPES: TYPES,
    Met: Met, Flyer: Flyer, Turret: Turret, Hopper: Hopper, Spiker: Spiker, Platform: Platform
  };
})();
