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

  /* この弾を弾き返すか。盾持ちのように向きで変わる敵が上書きする。
     stage.js の当たり判定から呼ばれる。                                */
  E.blocks = function () { return false; };

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
     ⑦ 盾持ち兵：正面からの弾は盾で弾く。撃つ瞬間だけ盾を下げる＝そこが狙い目
     ====================================================================== */
  var ShieldJoe = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 6, contactDmg: 4, dropChance: 0.5 });
    this.w = 14; this.h = 20;
    this.gravity = 0.3;
    this.mode = 'guard';
    this.timer = U.rndInt(0, 40);
    this.shots = 0;
  });
  ShieldJoe.prototype.blocks = function (shot) {
    // 盾を構えている間、正面から飛んできた弾だけを弾く（背後からは通る）
    if (this.mode !== 'guard') return false;
    var fromRight = shot.cx() > this.cx();
    return (this.face > 0) === fromRight;
  };
  ShieldJoe.prototype.update = function (st) {
    if (this.preUpdate()) { this.physics(); return; }
    var pl = st.player;
    this.timer++;
    this.vx = 0;

    if (this.mode === 'guard') {
      this.face = pl.cx() < this.cx() ? -1 : 1;
      // ときどき軽く跳ねて間合いを詰める
      if (this.onGround && this.timer % 96 === 60) {
        this.vy = -3.6; this.vx = this.face * 0.8;
      }
      if (this.timer > 110) { this.mode = 'fire'; this.timer = 0; this.shots = 0; }
    } else {
      // 盾を下ろして連射（この間は無防備）
      if (this.timer % 16 === 8 && this.shots < 3) {
        this.shots++;
        st.shots.push(new W.EnemyShot(this.cx() + this.face * 12, this.cy() - 2,
          this.face * 3.4, 0,
          { dmg: 3, size: 9, color: '#F8D878', color2: '#FCFCFC' }));
        A.sfx.shot();
        G.fx.burst(this.cx() + this.face * 14, this.cy() - 2, 3,
          { speed: 1.2, life: 8, size: 2, color: '#FCE0A8', light: true });
      }
      if (this.timer > 64) { this.mode = 'guard'; this.timer = 0; }
    }
    this.physics();
  };
  ShieldJoe.prototype.draw = function (camX, camY) {
    var sp = G.sprites.enemy.joe;
    this.blit(sp[this.mode === 'guard' ? 0 : 1], camX, camY);
    // 弾いた直後に光らせたいので、盾の位置に薄い光を置く
    if (this.mode === 'guard' && this.deflectGlow > 0) {
      this.deflectGlow--;
      var ctx = gfx.ctx;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      gfx.circle(this.cx() + this.face * 9 - camX, this.cy() - camY, 5, '#BCE8FC');
      ctx.restore();
    }
  };

  /* ======================================================================
     ⑧ 天井にぶら下がる敵：真下を通ると落ちてきて追いかけてくる
     ====================================================================== */
  var Bat = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 2, contactDmg: 4 });
    this.w = 14; this.h = 8;
    this.mode = 'hang';
    this.homeY = y;
    this.timer = 0;
  });
  Bat.prototype.update = function (st) {
    if (this.preUpdate()) return;
    var pl = st.player;
    if (this.mode === 'hang') {
      // 真下付近に来たら落下開始
      if (Math.abs(pl.cx() - this.cx()) < 34 && pl.cy() > this.cy()) {
        this.mode = 'drop'; this.timer = 0;
        A.sfx.blip();
      }
    } else if (this.mode === 'drop') {
      this.timer++;
      this.y += Math.min(this.timer * 0.5, 4.5);
      if (this.timer > 16) { this.mode = 'fly'; this.timer = 0; }
    } else {
      // ゆるやかにプレイヤーを追う
      this.timer++;
      var a = Math.atan2(pl.cy() - this.cy(), pl.cx() - this.cx());
      this.vx = U.lerp(this.vx, Math.cos(a) * 1.5, 0.045);
      this.vy = U.lerp(this.vy, Math.sin(a) * 1.1, 0.045);
      this.x += this.vx;
      this.y += this.vy + Math.sin(this.timer * 0.13) * 0.5;
      this.face = this.vx < 0 ? -1 : 1;
      // 壁にぶつかったら跳ね返る
      if (TL.boxSolid(this.x, this.y, this.w, this.h)) {
        this.x -= this.vx; this.y -= this.vy;
        this.vx = -this.vx * 0.6; this.vy = -this.vy * 0.6;
      }
    }
  };
  Bat.prototype.draw = function (camX, camY) {
    var sp = G.sprites.enemy.bat;
    if (this.mode === 'hang') this.blit(sp[0], camX, camY);
    else this.blit(sp[Math.floor(this.age / 4) % 2], camX, camY);
  };

  /* ======================================================================
     ⑨ 壁這い：床・壁・天井を伝ってぐるぐる回る
        進行方向に壁があれば曲がり、床が途切れたら角を回り込む。
     ====================================================================== */
  var DIRS = [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 } ];
  function rotCCW(i) { return (i + 3) % 4; }   // 画面上での反時計回り
  function rotCW(i)  { return (i + 1) % 4; }

  var Crawler = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 3, contactDmg: 4 });
    this.w = 14; this.h = 12;
    this.moveDir = (opt && opt.dir === -1) ? 2 : 0;   // 右 or 左
    this.downDir = 1;                                 // 最初は床にくっついている
    this.speed = 0.62;
    this.lost = 0;
  });
  Crawler.prototype.update = function (st) {
    if (this.preUpdate()) return;
    var mv = DIRS[this.moveDir], dv = DIRS[this.downDir];
    var cx = this.cx(), cy = this.cy();
    var r = 9;

    var ahead = TL.solidAtPx(cx + mv.x * r, cy + mv.y * r);
    var corner = TL.solidAtPx(cx + mv.x * r + dv.x * r, cy + mv.y * r + dv.y * r);

    if (ahead) {
      // 進行方向が壁：面に沿って向きを変える
      this.moveDir = rotCCW(this.moveDir);
      this.downDir = rotCCW(this.downDir);
    } else if (!corner) {
      // 床が途切れた：角を回り込む
      this.moveDir = rotCW(this.moveDir);
      this.downDir = rotCW(this.downDir);
      var nd = DIRS[this.downDir];
      this.x += nd.x * 3; this.y += nd.y * 3;
    } else {
      this.x += mv.x * this.speed;
      this.y += mv.y * this.speed;
    }

    // 面から離れてしまった時の保険（浮いたまま飛んでいかないように）
    var dv2 = DIRS[this.downDir];
    if (!TL.solidAtPx(this.cx() + dv2.x * r, this.cy() + dv2.y * r)) {
      this.lost++;
      if (this.lost > 40) { this.downDir = 1; this.lost = 0; }   // 床基準に戻す
    } else this.lost = 0;

    this.face = (this.moveDir === 2) ? -1 : 1;
  };
  Crawler.prototype.draw = function (camX, camY) {
    var box = G.sprites.enemy.crawl[Math.floor(this.age / 8) % 2];
    var ctx = gfx.ctx;
    ctx.save();
    ctx.translate(Math.round(this.cx() - camX), Math.round(this.cy() - camY));
    // くっついている面に合わせて回す
    ctx.rotate([0, 0, 0, 0][0] + (this.downDir - 1) * Math.PI / 2);
    var img = this.flash > 0 ? box.sil('#FCFCFC', 1) : box.r;
    ctx.drawImage(img, -box.w / 2 | 0, -box.h / 2 | 0);
    ctx.restore();
    if (this.frozen > 0) this.drawFrozen(camX, camY);
  };

  /* ======================================================================
     ⑩ 装甲車：硬くて遅い。正面装甲でバスターのダメージが半減する
     ====================================================================== */
  var Tank = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 14, contactDmg: 5, dropChance: 0.7 });
    this.w = 20; this.h = 16;
    this.gravity = 0.3;
    this.timer = U.rndInt(0, 60);
  });
  Tank.prototype.damage = function (n, element, st) {
    // 正面装甲：通常弾は効きが悪い（チャージや属性武器で崩す）
    if (element === 'buster') n = Math.max(1, Math.floor(n * 0.5));
    return Enemy.prototype.damage.call(this, n, element, st);
  };
  Tank.prototype.update = function (st) {
    if (this.preUpdate()) { this.physics(); return; }
    var pl = st.player;
    this.timer++;
    this.face = pl.cx() < this.cx() ? -1 : 1;
    // じりじり近づく
    this.vx = this.face * 0.42;
    var hit = TL.moveX(this, this.vx);
    if (hit !== 0) this.vx = 0;
    this.vy = Math.min(this.vy + this.gravity, 7);
    var r = TL.moveY(this, this.vy);
    this.onGround = (r === 1);

    if (this.timer === 100) A.sfx.blip();
    if (this.timer >= 120) {
      this.timer = 0;
      // 3方向の拡散弾
      for (var i = -1; i <= 1; i++) {
        st.shots.push(new W.EnemyShot(this.cx() + this.face * 12, this.cy() - 2,
          this.face * 3.0, i * 0.9,
          { dmg: 3, size: 10, color: '#FC9838', color2: '#FCE0A8' }));
      }
      A.sfx.shot();
      G.fx.shake(1.5, 8);
      G.fx.burst(this.cx() + this.face * 14, this.cy() - 2, 6,
        { speed: 1.6, life: 12, size: 2, color: '#FC9838', light: true });
    }
  };
  Tank.prototype.draw = function (camX, camY) {
    var sp = G.sprites.enemy.tank;
    this.blit(sp[this.timer > 100 ? 1 : 0], camX, camY);
  };

  /* ======================================================================
     ⑪ 分裂体：倒すと小さいのが2体に分かれる
     ====================================================================== */
  var Splitter = extend(function (x, y, opt) {
    var small = !!(opt && opt.small);
    Enemy.call(this, x, y, { hp: small ? 2 : 5, contactDmg: small ? 3 : 4,
                             dropChance: small ? 0.2 : 0.1 });
    this.small = small;
    this.w = small ? 10 : 16;
    this.h = small ? 8 : 12;
    this.gravity = 0.22;
    this.timer = U.rndInt(0, 30);
  });
  Splitter.prototype.update = function (st) {
    if (this.preUpdate()) { this.physics(); return; }
    this.timer++;
    var pl = st.player;
    // ふわふわ漂いながらプレイヤーへ寄る
    var dir = pl.cx() < this.cx() ? -1 : 1;
    this.face = dir;
    this.vx = U.lerp(this.vx, dir * (this.small ? 1.1 : 0.7), 0.03);
    this.x += this.vx;
    this.y += Math.sin(this.timer * 0.07) * (this.small ? 0.7 : 0.45);
    if (TL.boxSolid(this.x, this.y, this.w, this.h)) {
      this.x -= this.vx; this.vx = -this.vx;
    }
  };
  Splitter.prototype.kill = function (st) {
    if (this.dead) return;
    if (!this.small && st) {
      // 大きいほうは2体に分裂する
      for (var i = 0; i < 2; i++) {
        var c = new Splitter(this.cx(), this.cy(), { small: true });
        c.x = this.cx() - c.w / 2;
        c.y = this.cy() - c.h / 2;
        c.vx = (i === 0 ? -1 : 1) * 1.3;
        st.enemies.push(c);
      }
      G.fx.burst(this.cx(), this.cy(), 10, { speed: 2, life: 16, size: 2, color: '#F878F8' });
    }
    Enemy.prototype.kill.call(this, st);
  };
  Splitter.prototype.draw = function (camX, camY) {
    this.blit(G.sprites.enemy.split[this.small ? 1 : 0], camX, camY);
  };

  /* ======================================================================
     ⑫ 飛び出し：穴やトゲの中に潜んでいて、近づくと放物線を描いて飛び出す
     ====================================================================== */
  var Riser = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 2, contactDmg: 4 });
    this.w = 14; this.h = 12;
    this.homeY = y;
    this.mode = 'wait';
    this.timer = 0;
  });
  Riser.prototype.hitbox = function () {
    // 潜んでいる間は当たり判定なし
    if (this.mode === 'wait') return { x: -9999, y: -9999, w: 0, h: 0 };
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };
  Riser.prototype.update = function (st) {
    if (this.preUpdate()) return;
    var pl = st.player;
    if (this.mode === 'wait') {
      this.invulnerable = true;
      this.timer++;
      if (Math.abs(pl.cx() - this.cx()) < 70 && this.timer > 40) {
        this.mode = 'jump';
        this.invulnerable = false;
        this.vy = -6.4;
        this.vx = U.clamp((pl.cx() - this.cx()) / 40, -1.6, 1.6);
        this.timer = 0;
        A.sfx.jump();
        G.fx.burst(this.cx(), this.y + this.h, 6,
          { speed: 1.6, life: 14, size: 2, color: '#FC9838', dir: -Math.PI / 2, spread: Math.PI });
      }
    } else {
      this.vy += 0.22;
      this.x += this.vx;
      this.y += this.vy;
      this.face = this.vx < 0 ? -1 : 1;
      // 元の高さより下に戻ったらまた潜む
      if (this.vy > 0 && this.y > this.homeY) {
        this.y = this.homeY;
        this.mode = 'wait';
        this.invulnerable = true;
        this.timer = 0;
        this.vx = this.vy = 0;
      }
    }
  };
  Riser.prototype.draw = function (camX, camY) {
    if (this.mode === 'wait') return;         // 潜んでいる間は見えない
    var box = G.sprites.enemy.riser[0];
    var ctx = gfx.ctx;
    ctx.save();
    ctx.translate(Math.round(this.cx() - camX), Math.round(this.cy() - camY));
    ctx.rotate(Math.atan2(this.vy, this.vx * 2) - Math.PI / 2);
    var img = this.flash > 0 ? box.sil('#FCFCFC', 1) : box.r;
    ctx.drawImage(img, -box.w / 2 | 0, -box.h / 2 | 0);
    ctx.restore();
  };

  /* ======================================================================
     ⑬ 火炎噴出口：一定間隔で炎の柱を吹き上げる床の装置（破壊不可）
     ====================================================================== */
  var Vent = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 999, contactDmg: 0, dropChance: 0 });
    this.w = 14; this.h = 6;
    this.invulnerable = true;
    this.noFreeze = true;
    this.timer = (opt && opt.phase) || U.rndInt(0, 90);
    this.height = (opt && opt.height) || 56;
    this.flame = null;
  });
  Vent.prototype.update = function (st) {
    this.age++;
    this.timer++;
    var CYCLE = 130, WARN = 26, BURN = 50;
    var t = this.timer % CYCLE;
    if (t === CYCLE - WARN) A.sfx.blip();
    if (t === 0) {
      // 炎の柱を出す（予告のあと本発動）
      var self = this;
      this.flame = new G.bosses.Hazard(this.x + 1, this.y - this.height, this.w - 2, this.height, {
        dmg: 4, element: 'fire', life: BURN, warn: 0, color: '#FC9838',
        draw: function (h, cx, cy) {
          var ctx = gfx.ctx;
          var k = Math.min(1, h.age / 6) * (1 - Math.max(0, (h.age - BURN + 10) / 10));
          if (k <= 0) return;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          var w = h.w * k;
          for (var y = 0; y < h.h; y += 4) {
            var wob = Math.sin((h.age + y) * 0.3) * 2;
            var ww = w * (1 - y / h.h * 0.35);
            gfx.rect(h.cx() - cx - ww / 2 + wob, h.y + h.h - y - 4 - cy, ww, 4, '#D82800');
            gfx.rect(h.cx() - cx - ww / 4 + wob, h.y + h.h - y - 4 - cy, ww / 2, 4, '#FC9838');
          }
          ctx.restore();
          if (h.age % 3 === 0) {
            G.fx.part({ x: h.cx() + U.rndRange(-5, 5), y: h.y + h.h - U.rnd() * h.h,
              vx: U.rndRange(-0.3, 0.3), vy: -U.rndRange(0.5, 1.5),
              life: 16, size: 3, color: '#FCE0A8', color2: '#D82800',
              type: 'circle', light: true });
          }
        }
      });
      st.hazards.push(this.flame);
      A.sfx.fire();
    }
    // 予告：噴出口が赤く光る
    this.warning = (t >= CYCLE - WARN);
  };
  Vent.prototype.damage = function () { return false; };
  Vent.prototype.draw = function (camX, camY) {
    var box = G.sprites.enemy.vent[0];
    var ctx = gfx.ctx;
    var dx = Math.round(this.cx() - camX - box.w / 2);
    var dy = Math.round(this.y + this.h - box.h - camY);
    ctx.drawImage(box.r, dx, dy);
    if (this.warning && Math.floor(this.age / 4) % 2 === 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      gfx.rect(dx + 2, dy + 1, box.w - 4, 3, '#FC9838');
      ctx.restore();
    }
  };

  /* ======================================================================
     ⑭ プレス機：上から周期的に落ちてくる。挟まれないよう通り抜ける
     ====================================================================== */
  var Crusher = extend(function (x, y, opt) {
    Enemy.call(this, x, y, { hp: 999, contactDmg: 6, dropChance: 0 });
    opt = opt || {};
    this.w = opt.w || 34;
    this.h = 22;
    this.invulnerable = true;
    this.noFreeze = true;
    this.topY = y;
    this.dropY = opt.dropY || (y + 80);
    this.mode = 'wait';
    this.timer = opt.phase || 0;
  });
  Crusher.prototype.damage = function () { return false; };
  Crusher.prototype.update = function (st) {
    this.age++;
    this.timer++;
    if (this.mode === 'wait') {
      if (this.timer > 80) { this.mode = 'drop'; this.timer = 0; this.vy = 0; }
    } else if (this.mode === 'drop') {
      this.vy = Math.min(this.vy + 1.1, 13);
      this.y += this.vy;
      if (this.y >= this.dropY) {
        this.y = this.dropY;
        this.mode = 'hold'; this.timer = 0;
        A.sfx.quake();
        G.fx.shake(5, 20);
        G.fx.dust(this.x + 4, this.y + this.h, -1.5);
        G.fx.dust(this.x + this.w - 4, this.y + this.h, 1.5);
        G.fx.ring(this.cx(), this.y + this.h, 3, 40, 14, '#BCBCBC');
      }
    } else if (this.mode === 'hold') {
      if (this.timer > 34) { this.mode = 'rise'; this.timer = 0; }
    } else {
      this.y -= 1.1;
      if (this.y <= this.topY) { this.y = this.topY; this.mode = 'wait'; this.timer = 0; }
    }
  };
  Crusher.prototype.draw = function (camX, camY) {
    var x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    gfx.rect(x, y, this.w, this.h, '#101018');
    gfx.rect(x + 1, y + 1, this.w - 2, this.h - 6, '#7C7C8C');
    gfx.rect(x + 1, y + 1, this.w - 2, 3, '#BCBCC8');
    gfx.rect(x + 1, y + this.h - 8, this.w - 2, 2, '#3C3C4C');
    // 下面のトゲ
    for (var i = 2; i < this.w - 3; i += 5) {
      gfx.rect(x + i, y + this.h - 5, 4, 2, '#BCBCBC');
      gfx.rect(x + i + 1, y + this.h - 3, 2, 3, '#FCFCFC');
    }
    // 天井とつながる支柱
    gfx.rect(x + this.w / 2 - 4, Math.round(this.topY - 40 - camY), 8, this.y - this.topY + 42, '#3C3C4C');
    gfx.rect(x + this.w / 2 - 3, Math.round(this.topY - 40 - camY), 2, this.y - this.topY + 42, '#7C7C8C');
  };


  /* ======================================================================
     ⑮ 小型蜂：中ボスが放つ子機。柔らかいがふらふら追ってくる
     ====================================================================== */
  var Drone = extend(function (x, y) {
    Enemy.call(this, x, y, { hp: 1, contactDmg: 3, dropChance: 0.12 });
    this.w = 12; this.h = 7;
    this.ttl = 460;                 // 長く残りすぎないよう寿命を持たせる
  });
  Drone.prototype.update = function (st) {
    if (this.preUpdate()) return;
    if (--this.ttl <= 0) { this.dead = true; return; }
    var pl = st.player;
    var a = Math.atan2(pl.cy() - this.cy(), pl.cx() - this.cx());
    this.vx = U.lerp(this.vx, Math.cos(a) * 1.4, 0.035);
    this.vy = U.lerp(this.vy, Math.sin(a) * 1.1, 0.035);
    this.x += this.vx;
    this.y += this.vy + Math.sin(this.age * 0.22) * 0.45;
    this.face = this.vx < 0 ? -1 : 1;
    // 壁にぶつかったら跳ね返る
    if (TL.boxSolid(this.x, this.y, this.w, this.h)) {
      this.x -= this.vx; this.y -= this.vy;
      this.vx *= -0.5; this.vy *= -0.5;
    }
  };
  Drone.prototype.draw = function (camX, camY) {
    this.blit(G.sprites.enemy.drone[Math.floor(this.age / 3) % 2], camX, camY);
  };

  /* ======================================================================
     生成のための表
     ====================================================================== */
  var TYPES = {
    met: Met, fly: Flyer, turret: Turret, hop: Hopper, spike: Spiker, plat: Platform,
    joe: ShieldJoe, bat: Bat, crawl: Crawler, tank: Tank,
    split: Splitter, riser: Riser, vent: Vent, crusher: Crusher, drone: Drone
  };

  function create(type, x, y, opt) {
    var C = TYPES[type];
    if (!C) return null;
    return new C(x, y, opt);
  }

  return {
    Enemy: Enemy, extend: extend, create: create, TYPES: TYPES,
    Met: Met, Flyer: Flyer, Turret: Turret, Hopper: Hopper, Spiker: Spiker, Platform: Platform,
    ShieldJoe: ShieldJoe, Bat: Bat, Crawler: Crawler, Tank: Tank,
    Splitter: Splitter, Riser: Riser, Vent: Vent, Crusher: Crusher, Drone: Drone
  };
})();
