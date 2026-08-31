/* =========================================================================
   weapons.js  --  武器と弾

   武器を増やすときは
     1) WEAPONS 配列に定義を足す
     2) SHOOTERS に発射処理を足す
   の2箇所だけ。弾の挙動はコンストラクタごとに分けてある。

   弾が共通で持つもの:
     x,y,w,h / vx,vy / dmg / team('player'|'enemy') / element / pierce
     update(st) / draw(cx,cy) / hitbox() / dead
   ========================================================================= */
G.weapons = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles;

  /* ======================================================================
     武器の定義表
     ====================================================================== */
  var WEAPONS = [
    { id:'buster',  name:'MEGA BUSTER',    short:'MB', color:'#3CBCFC', color2:'#FCFCFC',
      max: Infinity, cost: 0, charge: true },
    { id:'thunder', name:'THUNDER BEAM',   short:'TB', color:'#F8D878', color2:'#FCFCFC',
      max: 28, cost: 3 },
    { id:'fire',    name:'FIRE STORM',     short:'FS', color:'#FC9838', color2:'#F87858',
      max: 28, cost: 3 },
    { id:'ice',     name:'ICE SLASHER',    short:'IS', color:'#BCE8FC', color2:'#3CBCFC',
      max: 28, cost: 2 },
    { id:'bomb',    name:'HYPER BOMB',     short:'HB', color:'#00A800', color2:'#B8F818',
      max: 28, cost: 4 },
    { id:'cutter',  name:'ROLLING CUTTER', short:'RC', color:'#BCBCBC', color2:'#00E8D8',
      max: 28, cost: 2 },
    { id:'arm',     name:'SUPER ARM',      short:'SA', color:'#8C4A20', color2:'#D8A860',
      max: 28, cost: 5 }
  ];
  var BY_ID = {};
  WEAPONS.forEach(function (w, i) { w.index = i; BY_ID[w.id] = w; });

  /* ======================================================================
     弾の共通ベース
     ====================================================================== */
  function Base(x, y, w, h, vx, vy, opt) {
    opt = opt || {};
    this.x = x - w / 2; this.y = y - h / 2;
    this.w = w; this.h = h;
    this.vx = vx; this.vy = vy;
    this.dmg = opt.dmg || 1;
    this.team = opt.team || 'player';
    this.element = opt.element || 'buster';
    this.pierce = !!opt.pierce;
    this.life = opt.life || 240;
    this.grav = opt.grav || 0;
    this.hitsWall = opt.hitsWall !== false;   // 壁で消えるか
    this.dead = false;
    this.age = 0;
    this.color = opt.color || '#FCFCFC';
    this.freeze = opt.freeze || 0;            // 敵を凍らせるフレーム数
    this.knock = opt.knock || 0;
  }
  Base.prototype.hitbox = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  Base.prototype.cx = function () { return this.x + this.w / 2; };
  Base.prototype.cy = function () { return this.y + this.h / 2; };
  Base.prototype.baseStep = function () {
    this.age++;
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav;
    if (--this.life <= 0) this.dead = true;
    // 画面から大きく離れたら消す（メモリ節約）
    var lv = TL.getLevel();
    if (lv && (this.x < -64 || this.x > lv.pxW + 64 || this.y > lv.pxH + 64 || this.y < -160)) this.dead = true;
  };
  Base.prototype.wallCheck = function () {
    if (!this.hitsWall) return false;
    if (TL.boxSolid(this.x, this.y, this.w, this.h)) {
      this.dead = true;
      G.fx.ricochet(this.cx(), this.cy(), this.color);
      return true;
    }
    return false;
  };
  // 敵に当たった時に呼ばれる。true を返すと弾が消える
  Base.prototype.onHit = function () { return !this.pierce; };
  Base.prototype.draw = function (cx, cy) {
    gfx.rect(this.x - cx, this.y - cy, this.w, this.h, this.color);
  };

  function extend(Ctor) {
    Ctor.prototype = Object.create(Base.prototype);
    Ctor.prototype.constructor = Ctor;
    return Ctor;
  }

  /* ======================================================================
     ① メガバスター（通常＋チャージ）
     ====================================================================== */
  var Buster = extend(function (x, y, dir, level) {
    var size = level === 0 ? 6 : (level === 1 ? 12 : 18);
    var dmg  = level === 0 ? 1 : (level === 1 ? 3 : 6);
    Base.call(this, x, y, size, size, dir * 5.6, 0, {
      dmg: dmg, element: 'buster', color: level === 0 ? '#3CBCFC' : '#BCE8FC',
      knock: level === 2 ? 2 : 0
    });
    this.level = level;
    this.dir = dir;
  });
  Buster.prototype.update = function () {
    this.baseStep();
    this.wallCheck();
    // チャージ弾は尾を引く
    if (this.level > 0 && this.age % 2 === 0) {
      G.fx.part({ x: this.cx() - this.dir * 4, y: this.cy() + U.rndRange(-3, 3),
        vx: -this.dir * 0.4, vy: 0, life: 10, size: this.level === 2 ? 4 : 2,
        color: '#FCFCFC', color2: '#3CBCFC', type: 'circle', light: true });
    }
  };
  Buster.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    if (this.level === 0) {
      // 小さな弾：中心が白、周りが水色
      gfx.rect(x - 3, y - 2, 6, 4, '#3CBCFC');
      gfx.rect(x - 2, y - 1, 4, 2, '#FCFCFC');
    } else if (this.level === 1) {
      gfx.circle(x, y, 6, '#0058F8');
      gfx.circle(x, y, 4, '#3CBCFC');
      gfx.circle(x, y, 2, '#FCFCFC');
    } else {
      var pulse = (this.age % 6 < 3) ? 1 : 0;
      gfx.circle(x, y, 9 + pulse, '#0058F8');
      gfx.circle(x, y, 7, '#3CBCFC');
      gfx.circle(x, y, 4, '#BCE8FC');
      gfx.circle(x, y, 2, '#FCFCFC');
      // 前方に伸びる衝撃線
      gfx.rect(x + this.dir * 6, y - 1, this.dir * 8, 2, '#BCE8FC');
    }
  };

  /* ======================================================================
     ② サンダービーム（貫通・縦にも走る）
     ====================================================================== */
  var Thunder = extend(function (x, y, dir, vertical) {
    var w = vertical ? 8 : 22, h = vertical ? 22 : 8;
    Base.call(this, x, y, w, h, vertical ? 0 : dir * 6.2, vertical ? (vertical * 5.2) : 0, {
      dmg: 3, element: 'thunder', pierce: true, color: '#F8D878', hitsWall: !vertical
    });
    this.vertical = vertical || 0;
    this.dir = dir;
  });
  Thunder.prototype.update = function () {
    this.baseStep();
    this.wallCheck();
    if (this.age % 3 === 0) {
      G.fx.part({ x: this.cx() + U.rndRange(-6, 6), y: this.cy() + U.rndRange(-6, 6),
        vx: U.rndRange(-1, 1), vy: U.rndRange(-1, 1), life: 8, size: 2,
        color: '#FCFCFC', color2: '#F8D878', type: 'star', light: true });
    }
  };
  Thunder.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var f = this.age % 4 < 2;
    var ctx = gfx.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (this.vertical) {
      // ジグザグの雷柱
      for (var i = -10; i <= 10; i += 4) {
        var o = (i / 4) % 2 === 0 ? 2 : -2;
        gfx.rect(x + o - 1, y + i, 3, 4, f ? '#FCFCFC' : '#F8D878');
      }
    } else {
      for (var j = -10; j <= 10; j += 4) {
        var o2 = (j / 4) % 2 === 0 ? 2 : -2;
        gfx.rect(x + j, y + o2 - 1, 4, 3, f ? '#FCFCFC' : '#F8D878');
      }
    }
    ctx.restore();
  };

  /* ======================================================================
     ③ ファイアーストーム（前方火弾）
     ====================================================================== */
  var Fire = extend(function (x, y, dir) {
    Base.call(this, x, y, 14, 14, dir * 4.4, 0, {
      dmg: 3, element: 'fire', color: '#FC9838'
    });
    this.dir = dir;
  });
  Fire.prototype.update = function () {
    this.baseStep();
    this.wallCheck();
    G.fx.part({ x: this.cx() - this.dir * 5 + U.rndRange(-2, 2), y: this.cy() + U.rndRange(-4, 4),
      vx: -this.dir * U.rndRange(0.2, 0.8), vy: U.rndRange(-0.8, -0.2),
      life: U.rndInt(10, 20), size: 3, color: '#FCE0A8', color2: '#D82800',
      type: 'circle', light: true });
  };
  Fire.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var w = 1 + Math.sin(this.age * 0.5);
    var ctx = gfx.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    gfx.circle(x, y, 7 + w, '#D82800');
    gfx.circle(x - this.dir, y, 5 + w, '#FC9838');
    gfx.circle(x - this.dir * 2, y, 3, '#FCE0A8');
    ctx.restore();
  };

  /* --- 体の周りを回る炎（ファイアーストームの盾部分） --- */
  var FireShield = extend(function (owner) {
    Base.call(this, owner.cx(), owner.cy(), 14, 14, 0, 0, {
      dmg: 2, element: 'fire', pierce: true, color: '#FC9838', hitsWall: false, life: 110
    });
    this.owner = owner;
    this.ang = 0;
    this.continuous = true;   // 当たり続ける武器（ボスには一撃を軽くする）
    this.hitPause = 0;
  });
  FireShield.prototype.hitbox = function () {
    // 当てた直後はしばらく判定を消す（毎フレーム当たって即死させないため）
    if (this.hitPause > 0) return { x: -9999, y: -9999, w: 0, h: 0 };
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };
  FireShield.prototype.update = function () {
    this.age++;
    if (this.hitPause > 0) this.hitPause--;
    if (--this.life <= 0) { this.dead = true; return; }
    this.ang += 0.19;
    var r = 24;
    this.x = this.owner.cx() + Math.cos(this.ang) * r - this.w / 2;
    this.y = this.owner.cy() + Math.sin(this.ang) * r * 0.75 - this.h / 2;
    if (this.age % 2 === 0) {
      G.fx.part({ x: this.cx(), y: this.cy(), vx: U.rndRange(-0.5, 0.5), vy: U.rndRange(-0.6, 0),
        life: 12, size: 3, color: '#FCE0A8', color2: '#D82800', type: 'circle', light: true });
    }
  };
  FireShield.prototype.onHit = function () {
    this.hitPause = 34;      // 消えずに残るが、しばらく当たらなくなる
    return false;
  };
  FireShield.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var ctx = gfx.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    gfx.circle(x, y, 6, '#D82800');
    gfx.circle(x, y, 4, '#FC9838');
    gfx.circle(x, y, 2, '#FCE0A8');
    ctx.restore();
  };

  /* ======================================================================
     ④ アイススラッシャー（貫通＋凍結）
     ====================================================================== */
  var Ice = extend(function (x, y, dir) {
    Base.call(this, x, y, 18, 8, dir * 6.8, 0, {
      dmg: 2, element: 'ice', pierce: true, color: '#BCE8FC', freeze: 150
    });
    this.dir = dir;
  });
  Ice.prototype.update = function () {
    this.baseStep();
    this.wallCheck();
    if (this.age % 3 === 0) {
      G.fx.part({ x: this.cx(), y: this.cy() + U.rndRange(-3, 3),
        vx: -this.dir * 0.5, vy: U.rndRange(-0.3, 0.3), life: 14, size: 2,
        color: '#FCFCFC', color2: '#3CBCFC', type: 'star' });
    }
  };
  Ice.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy, d = this.dir;
    // 先の尖った氷の刃
    gfx.rect(x - 9, y - 3, 18, 6, '#3CBCFC');
    gfx.rect(x - 7, y - 2, 14, 4, '#BCE8FC');
    gfx.rect(x + d * 6, y - 1, d * 5, 2, '#FCFCFC');
    gfx.rect(x - 8, y - 1, 6, 2, '#FCFCFC');
  };

  /* ======================================================================
     ⑤ ハイパーボム（放物線＋時間差爆発）
     ====================================================================== */
  var Bomb = extend(function (x, y, dir) {
    Base.call(this, x, y, 12, 12, dir * 3.2, -3.4, {
      dmg: 0, element: 'bomb', color: '#00A800', grav: 0.20, hitsWall: false
    });
    this.fuse = 62;
    this.dir = dir;
  });
  Bomb.prototype.explodeNow = function (st) {
    this.dead = true;
    // 投げた側の陣営を引き継ぐ（影のラスボスが投げた爆弾は敵の攻撃になる）
    st.spawnBlast(this.cx(), this.cy(), 40, 6, 'bomb', this.team);
  };
  Bomb.prototype.update = function (st) {
    this.baseStep();
    // 地形にぶつかったら止まって転がる
    if (TL.boxSolid(this.x, this.y + this.h * 0.5, this.w, this.h * 0.5) && this.vy > 0) {
      this.y = Math.floor((this.y + this.h) / TL.T) * TL.T - this.h - 0.01;
      this.vy = -this.vy * 0.28;
      this.vx *= 0.6;
      if (Math.abs(this.vy) < 0.6) this.vy = 0;
    }
    if (TL.boxSolid(this.x + this.vx, this.y, this.w, this.h * 0.6)) this.vx = -this.vx * 0.4;
    if (--this.fuse <= 0) this.explodeNow(st);
    if (this.fuse < 26 && this.fuse % 6 < 3) {
      G.fx.part({ x: this.cx(), y: this.cy() - 8, vx: 0, vy: -0.5, life: 8, size: 2, color: '#FCE0A8', light: true });
    }
  };
  // 敵に当たったら即爆発
  Bomb.prototype.onHit = function (target, st) { this.explodeNow(st); return true; };
  Bomb.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var blink = this.fuse < 26 && (this.fuse % 6 < 3);
    gfx.circle(x, y, 6, '#101018');
    gfx.circle(x, y, 5, blink ? '#F87858' : '#00A800');
    gfx.circle(x - 1, y - 1, 2, blink ? '#FCFCFC' : '#B8F818');
    gfx.rect(x - 1, y - 8, 2, 3, '#8C4A20');   // 導火線
  };

  /* --- 爆風（範囲ダメージ）：爆弾/岩/ボスの大技で共用 --- */
  var Blast = extend(function (x, y, radius, dmg, element, team) {
    Base.call(this, x, y, radius * 2, radius * 2, 0, 0, {
      dmg: dmg, element: element, team: team, pierce: true, color: '#FC9838',
      hitsWall: false, life: 24
    });
    this.radius = radius;
    this.ox = x; this.oy = y;      // 爆心（ここを中心に広がる）
  });
  Blast.prototype.update = function () {
    this.age++;
    if (--this.life <= 0) this.dead = true;
    // 広がりに合わせて当たり判定も中心から広げる
    var k = U.ease.outQuad(Math.min(1, this.age / 8));
    var r = this.radius * k;
    this.w = r * 2; this.h = r * 2;
    this.x = this.ox - r; this.y = this.oy - r;
  };
  Blast.prototype.onHit = function () { return false; };
  Blast.prototype.draw = function (cx, cy) {
    var k = Math.min(1, this.age / 8);
    var r = this.radius * U.ease.outQuad(k);
    var a = 1 - this.age / this.life;
    var ctx = gfx.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'lighter';
    gfx.circle(this.cx() - cx, this.cy() - cy, r * 0.9, '#D82800');
    gfx.circle(this.cx() - cx, this.cy() - cy, r * 0.6, '#FC9838');
    gfx.circle(this.cx() - cx, this.cy() - cy, r * 0.3, '#FCE0A8');
    ctx.restore();
  };

  /* ======================================================================
     ⑥ ローリングカッター（ブーメラン）
     ====================================================================== */
  var Cutter = extend(function (x, y, dir, owner) {
    Base.call(this, x, y, 14, 14, dir * 5.0, -1.2, {
      dmg: 3, element: 'cutter', pierce: true, color: '#BCBCBC', hitsWall: false, life: 200
    });
    this.dir = dir; this.owner = owner;
    this.phase = 'out';
    this.spin = 0;
  });
  Cutter.prototype.update = function () {
    this.age++;
    this.spin += 0.6;
    if (this.phase === 'out') {
      this.x += this.vx; this.y += this.vy;
      this.vy += 0.045;
      if (this.age > 34) this.phase = 'back';
    } else {
      // 使い手のところへ戻ってくる
      var tx = this.owner.cx(), ty = this.owner.cy();
      var a = Math.atan2(ty - this.cy(), tx - this.cx());
      var sp = 6.2;
      this.x += Math.cos(a) * sp; this.y += Math.sin(a) * sp;
      if (U.dist(this.cx(), this.cy(), tx, ty) < 14) this.dead = true;
    }
    if (--this.life <= 0) this.dead = true;
  };
  Cutter.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var ctx = gfx.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(this.spin);
    // 三日月型のカッター
    ctx.fillStyle = '#101018'; ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = '#BCBCBC'; ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#FCFCFC'; ctx.fillRect(-7, -7, 14, 3);
    ctx.fillStyle = '#00E8D8'; ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#101018'; ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  };

  /* ======================================================================
     ⑦ スーパーアーム（岩を投げる：ブロックも壊せる）
     ====================================================================== */
  var Rock = extend(function (x, y, dir) {
    Base.call(this, x, y, 18, 18, dir * 4.2, -1.6, {
      dmg: 6, element: 'arm', color: '#8C4A20', grav: 0.16, pierce: true
    });
    this.dir = dir; this.spin = 0;
  });
  Rock.prototype.update = function (st) {
    this.baseStep();
    this.spin += 0.22 * this.dir;
    if (TL.boxSolid(this.x, this.y, this.w, this.h)) {
      // 壊せるブロックなら破壊
      var t = TL.T;
      var tx0 = Math.floor(this.x / t), tx1 = Math.floor((this.x + this.w - 1) / t);
      var ty0 = Math.floor(this.y / t), ty1 = Math.floor((this.y + this.h - 1) / t);
      var broke = false;
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
        if (TL.at(tx, ty) === 'B') {
          TL.setAt(tx, ty, '.');
          G.fx.debris(tx * t + 8, ty * t + 8, 8, ['#8C4A20', '#D8A860', '#5C2A10']);
          broke = true;
        }
      }
      if (broke) A.sfx.enemyPop();
      this.dead = true;
      G.fx.debris(this.cx(), this.cy(), 8, ['#8C4A20', '#D8A860']);
      G.fx.shake(2, 8);
      A.sfx.hit();
    }
  };
  Rock.prototype.onHit = function () { return true; };
  Rock.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy;
    var ctx = gfx.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(this.spin);
    ctx.fillStyle = '#101018'; ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = '#8C4A20'; ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = '#D8A860'; ctx.fillRect(-8, -8, 16, 3);
    ctx.fillStyle = '#D8A860'; ctx.fillRect(-8, -8, 3, 16);
    ctx.fillStyle = '#5C2A10'; ctx.fillRect(-2, 0, 6, 3);
    ctx.fillStyle = '#5C2A10'; ctx.fillRect(2, -5, 3, 3);
    ctx.restore();
  };

  /* ======================================================================
     敵/ボスの汎用弾
     ====================================================================== */
  var EnemyShot = extend(function (x, y, vx, vy, opt) {
    opt = opt || {};
    var s = opt.size || 8;
    Base.call(this, x, y, s, s, vx, vy, {
      dmg: opt.dmg || 2, team: 'enemy', element: opt.element || 'enemy',
      color: opt.color || '#F8D878', grav: opt.grav || 0,
      hitsWall: opt.hitsWall !== false, life: opt.life || 300
    });
    this.style = opt.style || 'ball';
    this.color2 = opt.color2 || '#FCFCFC';
    this.spin = 0;
    this.homing = opt.homing || 0;
  });
  EnemyShot.prototype.update = function (st) {
    if (this.homing && st && st.player && this.age < 60) {
      var a = Math.atan2(st.player.cy() - this.cy(), st.player.cx() - this.cx());
      var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.vx = U.lerp(this.vx, Math.cos(a) * sp, this.homing);
      this.vy = U.lerp(this.vy, Math.sin(a) * sp, this.homing);
    }
    this.baseStep();
    this.spin += 0.3;
    this.wallCheck();
  };
  EnemyShot.prototype.draw = function (cx, cy) {
    var x = this.cx() - cx, y = this.cy() - cy, r = this.w / 2;
    var ctx = gfx.ctx;
    if (this.style === 'ball') {
      gfx.circle(x, y, r, this.color);
      gfx.circle(x, y, Math.max(1, r - 2), this.color2);
    } else if (this.style === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      gfx.circle(x, y, r + (this.age % 4 < 2 ? 1 : 0), this.color);
      gfx.rect(x - r - 2, y - 1, r * 2 + 4, 2, this.color2);
      gfx.rect(x - 1, y - r - 2, 2, r * 2 + 4, this.color2);
      ctx.restore();
    } else if (this.style === 'flame') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      gfx.circle(x, y, r + 1, '#D82800');
      gfx.circle(x, y, r - 1, '#FC9838');
      gfx.circle(x, y, Math.max(1, r - 3), '#FCE0A8');
      ctx.restore();
    } else if (this.style === 'shard') {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.fillStyle = '#3CBCFC'; ctx.fillRect(-r, -r / 2, r * 2, r);
      ctx.fillStyle = '#BCE8FC'; ctx.fillRect(-r + 1, -r / 2 + 1, r * 2 - 2, r - 2);
      ctx.fillStyle = '#FCFCFC'; ctx.fillRect(r - 3, -1, 4, 2);
      ctx.restore();
    } else if (this.style === 'blade') {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(this.spin);
      ctx.fillStyle = '#101018'; ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
      ctx.fillStyle = this.color; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#FCFCFC'; ctx.fillRect(-r, -r, r * 2, 2);
      ctx.restore();
    } else if (this.style === 'rock') {
      gfx.rect(x - r, y - r, r * 2, r * 2, '#101018');
      gfx.rect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2, '#8C4A20');
      gfx.rect(x - r + 1, y - r + 1, r * 2 - 2, 2, '#D8A860');
    }
  };

  /* ======================================================================
     発射処理（武器ごと）
     戻り値：実際に撃てたら true
     ====================================================================== */
  var SHOOTERS = {
    buster: function (pl, st, chargeLevel) {
      /* 画面内のバスター弾に上限を設ける（原作準拠）。
         原作は横256pxで3発。この game は端末に合わせて画面が広いぶん
         弾が画面外へ出るまで時間がかかるので、幅に比例させて
         連射の体感が原作と同じになるようにしている（3〜5発）。   */
      var cap = U.clamp(Math.round(3 * gfx.W / 300), 3, 5);
      var n = 0;
      for (var i = 0; i < st.shots.length; i++) {
        var sh = st.shots[i];
        if (sh.team === 'player' && sh instanceof Buster && sh.level === 0) n++;
      }
      if (chargeLevel === 0 && n >= cap) return false;
      var p = pl.muzzle();
      st.shots.push(new Buster(p.x, p.y, pl.face, chargeLevel));
      if (chargeLevel === 0) A.sfx.shot();
      else if (chargeLevel === 1) A.sfx.shotMid();
      else { A.sfx.shotBig(); G.fx.shake(1.5, 6); }
      G.fx.burst(p.x, p.y, chargeLevel === 2 ? 8 : 3, {
        speed: 1.4, life: 10, size: 2, color: '#BCE8FC', light: true });
      return true;
    },

    thunder: function (pl, st) {
      var p = pl.muzzle();
      st.shots.push(new Thunder(p.x, p.y, pl.face, 0));
      st.shots.push(new Thunder(p.x, p.y, pl.face, -1));
      st.shots.push(new Thunder(p.x, p.y, pl.face, 1));
      A.sfx.thunder();
      G.fx.flash('#F8D878', 3, 0.22);
      return true;
    },

    fire: function (pl, st) {
      var p = pl.muzzle();
      st.shots.push(new Fire(p.x, p.y, pl.face));
      st.shots.push(new FireShield(pl));
      A.sfx.fire();
      return true;
    },

    ice: function (pl, st) {
      var p = pl.muzzle();
      st.shots.push(new Ice(p.x, p.y, pl.face));
      A.sfx.ice();
      return true;
    },

    bomb: function (pl, st) {
      var p = pl.muzzle();
      st.shots.push(new Bomb(p.x, p.y - 4, pl.face));
      A.sfx.bombThrow();
      return true;
    },

    cutter: function (pl, st) {
      // 戻ってくるまで次を撃てない
      for (var i = 0; i < st.shots.length; i++) if (st.shots[i] instanceof Cutter) return false;
      var p = pl.muzzle();
      st.shots.push(new Cutter(p.x, p.y, pl.face, pl));
      A.sfx.cutter();
      return true;
    },

    arm: function (pl, st) {
      for (var i = 0; i < st.shots.length; i++) if (st.shots[i] instanceof Rock) return false;
      var p = pl.muzzle();
      st.shots.push(new Rock(p.x + pl.face * 6, p.y - 2, pl.face));
      A.sfx.rockThrow();
      G.fx.shake(1.5, 6);
      return true;
    }
  };

  /* 実際に呼ぶ入口。弾数チェックとエネルギー消費もここで行う */
  function fire(pl, st, weaponId, chargeLevel) {
    var def = BY_ID[weaponId];
    if (!def) return false;
    var cost = (weaponId === 'buster') ? 0 : def.cost;
    if (cost > 0 && pl.ammo[weaponId] < cost) { A.sfx.deny(); return false; }
    var did = SHOOTERS[weaponId](pl, st, chargeLevel || 0);
    if (did && cost > 0) {
      pl.ammo[weaponId] = Math.max(0, pl.ammo[weaponId] - cost);
    }
    return did;
  }

  /* ======================================================================
     武器アイコン（HUD・武器ゲット画面・ポーズメニューで共用）
     ====================================================================== */
  function drawIcon(id, x, y, s) {
    s = s || 1;
    var ctx = gfx.ctx;
    function R(dx, dy, w, h, c) { gfx.rect(x + dx * s, y + dy * s, w * s, h * s, c); }
    function C(dx, dy, r, c) { gfx.circle(x + dx * s, y + dy * s, r * s, c); }
    switch (id) {
      case 'buster':
        R(-7, -3, 14, 7, '#101018'); R(-6, -2, 12, 5, '#3CBCFC');
        R(-6, -2, 12, 2, '#BCE8FC'); R(4, -1, 3, 3, '#FCFCFC');
        break;
      case 'thunder':
        R(-1, -8, 3, 6, '#F8D878'); R(-4, -2, 3, 5, '#FCFCFC');
        R(0, 1, 3, 6, '#F8D878');   R(2, -4, 3, 5, '#FCFCFC');
        R(-6, -1, 3, 3, '#F8D878'); R(4, 0, 3, 3, '#F8D878');
        break;
      case 'fire':
        C(0, 2, 6, '#D82800'); C(0, 2, 4, '#FC9838'); C(0, 3, 2, '#FCE0A8');
        R(-2, -7, 2, 5, '#FC9838'); R(1, -6, 2, 4, '#D82800');
        break;
      case 'ice':
        R(-8, -2, 16, 5, '#3CBCFC'); R(-7, -1, 14, 3, '#BCE8FC');
        R(4, -1, 5, 2, '#FCFCFC');   R(-8, -1, 4, 2, '#FCFCFC');
        break;
      case 'bomb':
        C(0, 2, 6, '#101018'); C(0, 2, 5, '#00A800'); C(-2, 0, 2, '#B8F818');
        R(-1, -7, 2, 4, '#8C4A20'); R(0, -9, 2, 2, '#FCE0A8');
        break;
      case 'cutter':
        R(-7, -7, 14, 14, '#101018'); R(-6, -6, 12, 12, '#BCBCBC');
        R(-6, -6, 12, 3, '#FCFCFC');  R(-3, -3, 6, 6, '#00E8D8');
        R(-1, -1, 2, 2, '#101018');
        break;
      case 'arm':
        R(-7, -6, 14, 12, '#101018'); R(-6, -5, 12, 10, '#8C4A20');
        R(-6, -5, 12, 3, '#D8A860');  R(-2, 0, 4, 2, '#5C2A10');
        R(2, -3, 3, 2, '#5C2A10');
        break;
    }
  }

  return {
    WEAPONS: WEAPONS, BY_ID: BY_ID,
    fire: fire, drawIcon: drawIcon,
    Buster: Buster, Thunder: Thunder, Fire: Fire, FireShield: FireShield,
    Ice: Ice, Bomb: Bomb, Blast: Blast, Cutter: Cutter, Rock: Rock,
    EnemyShot: EnemyShot, Base: Base, extend: extend
  };
})();
