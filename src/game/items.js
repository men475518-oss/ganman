/* =========================================================================
   items.js  --  取得アイテム（回復・武器エネルギー・1UP・E缶）
   ========================================================================= */
G.items = (function () {
  'use strict';
  var gfx = G.gfx, U = G.util, A = G.audio, TL = G.tiles;

  /* 種類ごとの設定。増やしたければここに足すだけ */
  var KINDS = {
    hpSmall: { spr:'hpSmall', hp: 2,  label:null,   color:'#F87858' },
    hpBig:   { spr:'hpBig',   hp: 10, label:null,   color:'#F87858' },
    wpSmall: { spr:'wpSmall', wp: 2,  label:null,   color:'#3CBCFC' },
    wpBig:   { spr:'wpBig',   wp: 10, label:null,   color:'#3CBCFC' },
    oneUp:   { spr:'oneUp',   life:1, label:'1UP',  color:'#BCE8FC' },
    eTank:   { spr:'eTank',   tank:1, label:'E',    color:'#B8F818' }
  };

  function Item(kind, x, y, opt) {
    opt = opt || {};
    this.kind = kind;
    this.def = KINDS[kind];
    var box = G.sprites.item[this.def.spr];
    this.w = box.w; this.h = box.h;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = opt.vx || 0;
    this.vy = opt.vy === undefined ? -2.2 : opt.vy;
    this.age = 0;
    this.life = opt.permanent ? Infinity : 560;   // しばらくで消える
    this.dead = false;
    this.permanent = !!opt.permanent;
    this.landed = false;
  }
  var I = Item.prototype;

  I.hitbox = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  I.cx = function () { return this.x + this.w / 2; };
  I.cy = function () { return this.y + this.h / 2; };

  I.update = function (st) {
    this.age++;
    if (!this.permanent && --this.life <= 0) { this.dead = true; return; }

    // 落ちて床に乗る
    if (!this.landed) {
      this.vy = Math.min(this.vy + 0.28, 6);
      this.x += this.vx;
      var r = TL.moveY(this, this.vy);
      if (r === 1) { this.landed = true; this.vx = 0; this.vy = 0; }
      var lv = TL.getLevel();
      if (lv && this.y > lv.pxH + 32) this.dead = true;
    }

    // キラキラ（1UP・E缶は目立たせる）
    if ((this.kind === 'oneUp' || this.kind === 'eTank') && this.age % 10 === 0) {
      G.fx.part({ x: this.cx() + U.rndRange(-8, 8), y: this.cy() + U.rndRange(-8, 8),
        vx: 0, vy: -0.35, life: 18, size: 2, color: '#FCFCFC', type: 'star', light: true });
    }
  };

  I.collect = function (st) {
    var pl = st.player, d = this.def;
    this.dead = true;

    if (d.hp) {
      pl.hp = Math.min(pl.maxHp, pl.hp + d.hp);
      A.sfx.energy();
      G.fx.floatText('+' + d.hp, this.cx(), this.y - 4, '#F87858');
    }
    if (d.wp) {
      var id = pl.weaponId();
      if (id === 'buster') {
        // バスターは無限なので、代わりに他の武器を回復してあげる
        for (var i = 0; i < pl.weapons.length; i++) {
          var w = pl.weapons[i];
          if (w !== 'buster') pl.ammo[w] = Math.min(G.Player.MAX_AMMO, pl.ammo[w] + d.wp);
        }
      } else {
        pl.ammo[id] = Math.min(G.Player.MAX_AMMO, pl.ammo[id] + d.wp);
      }
      A.sfx.energy();
      G.fx.floatText('+' + d.wp, this.cx(), this.y - 4, '#3CBCFC');
    }
    if (d.life) {
      pl.lives++;
      A.sfx.oneUp();
      // 画面いっぱいのキラキラ
      for (var k = 0; k < 26; k++) {
        G.fx.part({ x: U.rndRange(0, gfx.W) + st.camX, y: U.rndRange(0, gfx.H) + st.camY,
          vx: U.rndRange(-0.4, 0.4), vy: U.rndRange(-1.4, -0.3),
          life: U.rndInt(26, 50), size: U.rndInt(2, 4),
          color: '#FCFCFC', color2: '#3CBCFC', type: 'star', light: true });
      }
      G.fx.flash('#FCFCFC', 8, 0.4);
      G.fx.floatText('1UP', this.cx(), this.y - 6, '#BCE8FC', 2);
    }
    if (d.tank) {
      st.tanks = Math.min(4, (st.tanks || 0) + 1);
      A.sfx.oneUp();
      G.fx.floatText('E TANK', this.cx(), this.y - 6, '#B8F818');
      G.fx.sparkle(this.cx(), this.cy(), 16, '#B8F818');
    }
    G.fx.burst(this.cx(), this.cy(), 8, { speed: 1.6, life: 16, size: 2, color: d.color, light: true });
  };

  I.draw = function (camX, camY) {
    // 消える直前は点滅して知らせる
    if (!this.permanent && this.life < 120 && Math.floor(this.life / 5) % 2 === 0) return;
    var box = G.sprites.item[this.def.spr];
    var bob = this.landed ? Math.round(Math.sin(this.age * 0.12) * 1) : 0;
    gfx.ctx.drawImage(box.r, Math.round(this.x - camX), Math.round(this.y - camY + bob));
  };

  /* 敵を倒したときのドロップ抽選 */
  function randomDrop(x, y) {
    var r = U.rnd();
    var kind;
    if (r < 0.03) kind = 'oneUp';
    else if (r < 0.09) kind = 'hpBig';
    else if (r < 0.20) kind = 'wpBig';
    else if (r < 0.55) kind = 'hpSmall';
    else kind = 'wpSmall';
    return new Item(kind, x, y, { vx: U.rndRange(-0.5, 0.5), vy: -2.4 });
  }

  return { Item: Item, KINDS: KINDS, randomDrop: randomDrop };
})();
