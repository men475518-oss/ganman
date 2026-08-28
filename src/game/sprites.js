/* =========================================================================
   sprites.js  --  ドット絵の定義と生成

   ・プレイヤーは手描きのドット絵（文字列パレット方式）を起動時に焼き込む
   ・ボスは「共通シャーシ + 各ボス固有の装飾」を毎フレーム手続き的に描く
     （腕を上げる／かがむ などのポーズを付けやすく、追加も簡単なため）
   ・雑魚敵とアイテムは小さいので手描きドット絵

   文字の意味（プレイヤー）:
     K=輪郭黒  B=青  L=水色  S=肌  W=白  C=シアン
   ========================================================================= */
G.sprites = (function () {
  'use strict';
  var gfx = G.gfx;

  var PPAL = {
    K: '#101018', B: '#0058F8', L: '#3CBCFC', S: '#FCC8A8',
    W: '#FCFCFC', C: '#00E8D8', D: '#0000BC'
  };

  /* ---- 共通の頭部（全ポーズで使い回す 11 行）---- */
  var HEAD = [
    '.....KKKKKK.....',
    '....KLLLLLLK....',
    '...KLLLLLLLLK...',
    '..KLLLLLLLLLLK..',
    '..KLLKKKKKKLLK..',
    '..KLKSSSSSSKLK..',
    '..KLKSWKSWKKLK..',
    '..KLKSWKSWKKLK..',
    '..KLKSSSSSSKLK..',
    '...KKSSSSSSKK...',
    '....KKKSSKKK....'
  ];
  /* ---- 目を閉じた頭部（被弾・やられ用）---- */
  var HEAD_HURT = HEAD.slice(0);
  HEAD_HURT[6] = '..KLKSKKSKKKLK..';
  HEAD_HURT[7] = '..KLKSSSSSSKLK..';

  /* ---- 胴体（共通 6 行）---- */
  var TORSO = [
    '...KLBBBBBBLK...',
    '..KLBBBBBBBBLK..',
    '.KLBBBWWWWBBBLK.',
    '.KBBBBWWWWBBBBK.',
    '.KBBBBBBBBBBBBK.',
    '..KBBBBBBBBBBK..'
  ];

  /* ---- 脚のバリエーション（5 行ずつ）---- */
  var LEGS = {
    idle: ['..KBBBK..KBBBK..',
           '..KLBBK..KBBLK..',
           '..KLLBK..KBLLK..',
           '.KLLLLK..KLLLLK.',
           '.KKKKKK..KKKKKK.'],
    run1: ['..KBBBK.KBBBK...',
           '..KLBBK..KBBLK..',
           '.KLLBK....KBLLK.',
           'KLLLK......KLLLK',
           'KKKKK......KKKKK'],
    run2: ['....KBBBBBBK....',
           '....KBBBBBBK....',
           '...KLBBBBBBLK...',
           '..KLLLK..KLLLK..',
           '..KKKKK..KKKKK..'],
    run3: ['...KBBBKKBBBK...',
           '..KLBBK..KBBLK..',
           '..KLLBK...KBLK..',
           '.KLLLLK...KLLK..',
           '.KKKKKK...KKKK..'],
    jump: ['.KBBBK....KBBBK.',
           'KLLBK......KBLLK',
           'KLLK........KLLK',
           'KKKK........KKKK',
           '................'],
    climb1:['...KBBBKKBBBK...',
            '...KLBBKKBBLK...',
            '...KLLBKKBLLK...',
            '..KLLLK..KLLLK..',
            '..KKKKK..KKKKK..'],
    climb2:['...KBBBKKBBBK...',
            '...KLBBKKBBLK...',
            '..KLLBK..KBLLK..',
            '..KLLLK...KLLK..',
            '..KKKKK...KKKK..']
  };

  /* ---- はしご掴み用の胴体（腕を上げている）---- */
  var TORSO_CLIMB = [
    '.KLK.KBBBBK.KLK.',
    '.KLK.KBBBBK.KLK.',
    '.KLK.KBWWBK.KLK.',
    '.KLKKKBWWBKKKLK.',
    '..KLLBBBBBBLLK..',
    '...KBBBBBBBBK...'
  ];

  /* 頭・胴・脚を連結して 1 フレームを組み立てる */
  function assemble(head, torso, legs) {
    return head.concat(torso).concat(legs);
  }

  /* ---- バスター（腕）：本体に重ねて描く小さいパーツ ---- */
  var BUSTER = [
    '..KKKKK.',
    '.KLLLLLK',
    'KLBBBBKK',
    'KLBBBBKK',
    '.KLLLLLK',
    '..KKKKK.'
  ];
  /* ---- 勝利ポーズ用の上げた腕 ---- */
  var ARM_UP = [
    '.KKKK.',
    'KLLLLK',
    'KLBBLK',
    'KLBBLK',
    'KLBBLK',
    'KLLLLK',
    '.KBBK.',
    '.KKKK.'
  ];

  /* ======================================================================
     スプライトの箱：左右両向きを持ち、単色シルエットもキャッシュできる
     ====================================================================== */
  function S(rows, pal) {
    var r = gfx.makeSprite(rows, pal || PPAL);
    var box = {
      r: r, l: gfx.flipSprite(r),
      w: r.width, h: r.height,
      _sil: {}
    };
    // 被弾点滅などで全身を単色にしたいときに使う
    box.sil = function (color, facing) {
      var key = color + (facing < 0 ? 'L' : 'R');
      if (!this._sil[key]) {
        this._sil[key] = gfx.silhouette(facing < 0 ? this.l : this.r, color);
      }
      return this._sil[key];
    };
    box.get = function (facing) { return facing < 0 ? this.l : this.r; };
    return box;
  }

  /* ======================================================================
     雑魚敵のドット絵
     ====================================================================== */
  var EPAL = {
    K:'#101018', Y:'#F8D878', O:'#FC9838', W:'#FCFCFC', G:'#7C7C7C',
    R:'#D82800', P:'#F878F8', B:'#0058F8', L:'#3CBCFC', C:'#00E8D8',
    N:'#00A800', V:'#6844FC', T:'#8C4A20', E:'#BCBCBC', A:'#F87858'
  };

  /* --- ヘルメット雑魚（メットール風）：普段は無敵、開いた時だけ弱点 --- */
  var MET_OPEN = [
    '....KKKKKKKK....',
    '..KKYYYYYYYYKK..',
    '.KYYYYYYYYYYYYK.',
    '.KYYYYKKKKYYYYK.',
    'KYYYYKKKKKKYYYYK',
    'KYYYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKKKK',
    '..KKWWKKKKWWKK..',
    '..KWWWWKKWWWWK..',
    '..KWWWWKKWWWWK..',
    '..KKKKKKKKKKKK..',
    '...KGGGGGGGGK...',
    '...KGGGGGGGGK...',
    '...KKKKKKKKKK...'
  ];
  var MET_HIDE = [
    '................',
    '................',
    '....KKKKKKKK....',
    '..KKYYYYYYYYKK..',
    '.KYYYYYYYYYYYYK.',
    '.KYYYYKKKKYYYYK.',
    'KYYYYKKKKKKYYYYK',
    'KYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKKKK',
    '................',
    '................',
    '................',
    '................'
  ];

  /* --- 飛行敵（鳥型メカ） --- */
  var FLY1 = [
    '......KKKK......',
    '.KK..KRRRRK..KK.',
    'KRRKKRRRRRRKKRRK',
    '.KRRRRRWWRRRRRK.',
    '..KRRRWKKWRRRK..',
    '..KRRRRRRRRRRK..',
    '...KRRRRRRRRK...',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '......KKKK......'
  ];
  var FLY2 = [
    '......KKKK......',
    '....KKRRRRKK....',
    '...KRRRRRRRRK...',
    '.KKRRRRWWRRRRKK.',
    'KRRKRRWKKWRRKRRK',
    '.KKKRRRRRRRRKKK.',
    '...KRRRRRRRRK...',
    '....KRRRRRRK....',
    '.....KRRRRK.....',
    '......KKKK......'
  ];

  /* --- 砲台（壁付き） --- */
  var TUR1 = [
    'KKKKKKKKKKKK....',
    'KGGGGGGGGGGK....',
    'KGEEEEEEEEGK....',
    'KGEKKKKKKEGK....',
    'KGEKPPPPKEGKKKK.',
    'KGEKPWWPKEGKGGGK',
    'KGEKPWWPKEGKGGGK',
    'KGEKPPPPKEGKKKK.',
    'KGEKKKKKKEGK....',
    'KGEEEEEEEEGK....',
    'KGGGGGGGGGGK....',
    'KKKKKKKKKKKK....'
  ];
  var TUR2 = [
    'KKKKKKKKKKKK....',
    'KGGGGGGGGGGK....',
    'KGEEEEEEEEGK....',
    'KGEKKKKKKEGK....',
    'KGEKPPPPKEGKKKK.',
    'KGEKPAAPKEGKAAAK',
    'KGEKPAAPKEGKAAAK',
    'KGEKPPPPKEGKKKK.',
    'KGEKKKKKKEGK....',
    'KGEEEEEEEEGK....',
    'KGGGGGGGGGGK....',
    'KKKKKKKKKKKK....'
  ];

  /* --- 跳ねる敵（バネ型） --- */
  var HOP1 = [
    '...KKKKKKKK...',
    '..KVVVVVVVVK..',
    '.KVVWWVVWWVVK.',
    '.KVVWKVVWKVVK.',
    '.KVVVVVVVVVVK.',
    '..KVVVVVVVVK..',
    '...KKVVVVKK...',
    '....KKKKKK....',
    '...KEEEEEEK...',
    '..KEEKKKKEEK..',
    '..KKK....KKK..'
  ];
  var HOP2 = [
    '..............',
    '...KKKKKKKK...',
    '..KVVVVVVVVK..',
    '.KVVWWVVWWVVK.',
    '.KVVWKVVWKVVK.',
    '.KVVVVVVVVVVK.',
    '..KVVVVVVVVK..',
    '...KKVVVVKK...',
    '....KKKKKK....',
    '...KEEEEEEK...',
    '...KKKKKKKK...'
  ];

  /* --- 突進する棘（転がる） --- */
  var SPIKE = [
    '...K..K..K...',
    '.K.KKKKKK.K..',
    '..KKTTTTKK...',
    'KKKTTTTTTKKKK',
    '..KTTKKTTK...',
    'KKKTTTTTTKKKK',
    '..KKTTTTKK...',
    '.K.KKKKKK.K..',
    '...K..K..K...'
  ];


  /* --- 盾持ち兵：正面からの弾を盾で弾く。撃つ瞬間だけ盾を下げる --- */
  var JOE_GUARD = [
    '....KKKKKK......',
    '...KGGGGGGK.....',
    '..KGGGGGGGGK....',
    '..KGKKKKKKGK....',
    '..KGKRRRRKGK....',
    '..KGGGGGGGGK....',
    '...KGGGGGGK.....',
    '..KKKKKKKKKK....',
    '.KBBBBBBBBBK....',
    '.KBBBBBBBBBKKKK.',
    '.KBBBWWWWBBKCWCK',
    '.KBBBWWWWBBKCCCK',
    '.KBBBBBBBBBKCCCK',
    '.KBBBBBBBBBKCWCK',
    '..KBBBBBBBBKKKKK',
    '..KBBBKKBBBK....',
    '..KBBK..KBBK....',
    '..KBBK..KBBK....',
    '..KGGK..KGGK....',
    '..KKKK..KKKK....'
  ];
  var JOE_FIRE = [
    '....KKKKKK......',
    '...KGGGGGGK.....',
    '..KGGGGGGGGK....',
    '..KGKKKKKKGK....',
    '..KGKAAAAKGK....',
    '..KGGGGGGGGK....',
    '...KGGGGGGK.....',
    '..KKKKKKKKKK....',
    '.KBBBBBBBBBK....',
    '.KBBBBBBBBBKKK..',
    '.KBBBWWWWBBKYYK.',
    '.KBBBWWWWBBKYYK.',
    '.KBBBBBBBBBKKK..',
    '.KBBBBBBBBBK....',
    '..KBBBBBBBBKCCCK',
    '..KBBBKKBBBKCCCK',
    '..KBBK..KBBKKKKK',
    '..KBBK..KBBK....',
    '..KGGK..KGGK....',
    '..KKKK..KKKK....'
  ];

  /* --- 天井にぶら下がる敵。真下を通ると落ちてくる --- */
  var BAT_HANG = [
    '..KKKKKKKKKK..',
    '..KVVVVVVVVK..',
    '...KVVVVVVK...',
    '...KVRVVRVK...',
    '....KVVVVK....',
    '.....KVVK.....',
    '.....KVVK.....',
    '......KK......'
  ];
  var BAT_FLY = [
    'KK..KKKKKK..KK',
    'KVKKVVVVVVKKVK',
    '.KVVVRVVRVVVK.',
    '..KVVVVVVVVK..',
    '...KVVVVVVK...',
    '....KVVVVK....',
    '.....KVVK.....',
    '......KK......'
  ];

  /* --- 壁や天井も伝って歩く敵 --- */
  var CRAWL1 = [
    '...KKKKKKKK...',
    '..KNNNNNNNNK..',
    '.KNNWWNNWWNNK.',
    '.KNNWKNNWKNNK.',
    'KNNNNNNNNNNNNK',
    'KNNNNNNNNNNNNK',
    '.KNNNNNNNNNNK.',
    '..KKKKKKKKKK..',
    '..K.K.K.K.K...'
  ];
  var CRAWL2 = [
    '...KKKKKKKK...',
    '..KNNNNNNNNK..',
    '.KNNWWNNWWNNK.',
    '.KNNWKNNWKNNK.',
    'KNNNNNNNNNNNNK',
    'KNNNNNNNNNNNNK',
    '.KNNNNNNNNNNK.',
    '..KKKKKKKKKK..',
    '...K.K.K.K.K..'
  ];

  /* --- 装甲車：硬くて遅いが、拡散弾を撃ってくる --- */
  var TANK1 = [
    '......KKKKKKKK......',
    '.....KGGGGGGGGK.....',
    '....KGGRRRRRRGGK....',
    '....KGGRWWWWRGGK....',
    '....KGGRRRRRRGGK....',
    '...KGGGGGGGGGGGGK...',
    'KKKKGGGGGGGGGGGGKKKK',
    'KEEEGGGGGGGGGGGGKYYK',
    'KEEEGGGGGGGGGGGGKYYK',
    'KKKKGGGGGGGGGGGGKKKK',
    '..KGGGGGGGGGGGGGGK..',
    '..KKKKKKKKKKKKKKKK..',
    '.KEEEEEEEEEEEEEEEEK.',
    '.KEKEKEKEKEKEKEKEEK.',
    '.KEEEEEEEEEEEEEEEEK.',
    '.KKKKKKKKKKKKKKKKKK.'
  ];
  var TANK2 = [
    '......KKKKKKKK......',
    '.....KGGGGGGGGK.....',
    '....KGGAAAAAAGGK....',
    '....KGGAWWWWAGGK....',
    '....KGGAAAAAAGGK....',
    '...KGGGGGGGGGGGGK...',
    'KKKKGGGGGGGGGGGGKKKK',
    'KEEEGGGGGGGGGGGGKAAK',
    'KEEEGGGGGGGGGGGGKAAK',
    'KKKKGGGGGGGGGGGGKKKK',
    '..KGGGGGGGGGGGGGGK..',
    '..KKKKKKKKKKKKKKKK..',
    '.KEEEEEEEEEEEEEEEEK.',
    '.KEEKEKEKEKEKEKEKEK.',
    '.KEEEEEEEEEEEEEEEEK.',
    '.KKKKKKKKKKKKKKKKKK.'
  ];

  /* --- 分裂体：倒すと小さいのが2体に分かれる --- */
  var SPLIT_BIG = [
    '....KKKKKKKK....',
    '..KKPPPPPPPPKK..',
    '.KPPPPPPPPPPPPK.',
    '.KPPWWPPPPWWPPK.',
    'KPPPWKPPPPWKPPPK',
    'KPPPPPPPPPPPPPPK',
    'KPPPPPPPPPPPPPPK',
    'KPPPPKKKKPPPPPPK',
    '.KPPPPPPPPPPPPK.',
    '.KPPPPPPPPPPPPK.',
    '..KKPPPPPPPPKK..',
    '....KKKKKKKK....'
  ];
  var SPLIT_SMALL = [
    '..KKKKKK..',
    '.KPPPPPPK.',
    'KPPWPPWPPK',
    'KPPKPPKPPK',
    'KPPPPPPPPK',
    'KPPPPPPPPK',
    '.KPPPPPPK.',
    '..KKKKKK..'
  ];

  /* --- 穴から飛び出してくる敵 --- */
  var RISER = [
    '......KK......',
    '.....KOOK.....',
    '....KOOOOK....',
    '...KOOWWOOK...',
    '...KOWKKWOK...',
    '..KOOOOOOOOK..',
    '..KOOOOOOOOK..',
    '...KOOOOOOK...',
    '....KOOOOK....',
    '.....KOOK.....',
    '....K.KK.K....',
    '......KK......'
  ];

  /* --- 火炎噴出口（床の装置。炎は手続きで描く） --- */
  var VENT = [
    '..KKKKKKKKKK..',
    '.KEEEEEEEEEEK.',
    'KEEKKEEKKEEEEK',
    'KEEEEEEEEEEEEK',
    'KGGGGGGGGGGGGK',
    'KKKKKKKKKKKKKK'
  ];

  /* ======================================================================
     アイテムのドット絵
     ====================================================================== */
  var IPAL = {
    K:'#101018', W:'#FCFCFC', R:'#D82800', A:'#F87858',
    B:'#0058F8', L:'#3CBCFC', Y:'#F8D878', G:'#00A800', N:'#B8F818'
  };
  var HP_SMALL = [
    '.KKKKKK.',
    'KWWWWWWK',
    'KWRRRRWK',
    'KRRWWRRK',
    'KRRWWRRK',
    'KWRRRRWK',
    'KWWWWWWK',
    '.KKKKKK.'
  ];
  var HP_BIG = [
    '..KKKKKKKK..',
    '.KWWWWWWWWK.',
    'KWRRRRRRRRWK',
    'KWRRRWWRRRWK',
    'KRRRWWWWRRRK',
    'KRRWWWWWWRRK',
    'KRRWWWWWWRRK',
    'KRRRWWWWRRRK',
    'KWRRRWWRRRWK',
    'KWRRRRRRRRWK',
    '.KWWWWWWWWK.',
    '..KKKKKKKK..'
  ];
  var WP_SMALL = [
    '.KKKKKK.',
    'KWWWWWWK',
    'KWBBBBWK',
    'KBBLLBBK',
    'KBBLLBBK',
    'KWBBBBWK',
    'KWWWWWWK',
    '.KKKKKK.'
  ];
  var WP_BIG = [
    '..KKKKKKKK..',
    '.KWWWWWWWWK.',
    'KWBBBBBBBBWK',
    'KWBBBLLBBBWK',
    'KBBBLLLLBBBK',
    'KBBLLLLLLBBK',
    'KBBLLLLLLBBK',
    'KBBBLLLLBBBK',
    'KWBBBLLBBBWK',
    'KWBBBBBBBBWK',
    '.KWWWWWWWWK.',
    '..KKKKKKKK..'
  ];
  var ONE_UP = [
    '.KKKKKKKKKK.',
    'KWWWWWWWWWWK',
    'KWKKKKKKKKWK',
    'KWKLLLLLLKWK',
    'KWKLBBBBLKWK',
    'KWKLBWWBLKWK',
    'KWKLBWWBLKWK',
    'KWKLBBBBLKWK',
    'KWKLLLLLLKWK',
    'KWKKKKKKKKWK',
    'KWWWWWWWWWWK',
    '.KKKKKKKKKK.'
  ];
  var E_TANK = [
    '..KKKKKKKK..',
    '.KWWWWWWWWK.',
    'KWKKKKKKKKWK',
    'KWKNNNNNNKWK',
    'KWKNGGGGNKWK',
    'KWKNGWWGNKWK',
    'KWKNGWWGNKWK',
    'KWKNGGGGNKWK',
    'KWKNNNNNNKWK',
    'KWKKKKKKKKWK',
    '.KWWWWWWWWK.',
    '..KKKKKKKK..'
  ];

  /* ======================================================================
     起動時に全部焼く
     ====================================================================== */
  var built = false;
  var out = { player: {}, enemy: {}, item: {} };

  function build() {
    if (built) return out;
    built = true;

    /* --- プレイヤー --- */
    var p = out.player;
    p.idle  = S(assemble(HEAD, TORSO, LEGS.idle));
    p.run   = [ S(assemble(HEAD, TORSO, LEGS.run1)),
                S(assemble(HEAD, TORSO, LEGS.run2)),
                S(assemble(HEAD, TORSO, LEGS.run3)) ];
    p.jump  = S(assemble(HEAD, TORSO, LEGS.jump));
    p.hurt  = S(assemble(HEAD_HURT, TORSO, LEGS.jump));
    p.climb = [ S(assemble(HEAD, TORSO_CLIMB, LEGS.climb1)),
                S(assemble(HEAD, TORSO_CLIMB, LEGS.climb2)) ];
    p.buster = S(BUSTER);
    p.armUp  = S(ARM_UP);
    p.W = p.idle.w; p.H = p.idle.h;

    /* --- 敵 --- */
    var e = out.enemy;
    e.met   = [ S(MET_OPEN, EPAL), S(MET_HIDE, EPAL) ];
    e.fly   = [ S(FLY1, EPAL),  S(FLY2, EPAL) ];
    e.turret= [ S(TUR1, EPAL),  S(TUR2, EPAL) ];
    e.hop   = [ S(HOP1, EPAL),  S(HOP2, EPAL) ];
    e.spike = [ S(SPIKE, EPAL) ];
    e.joe    = [ S(JOE_GUARD, EPAL), S(JOE_FIRE, EPAL) ];
    e.bat    = [ S(BAT_HANG, EPAL),  S(BAT_FLY, EPAL) ];
    e.crawl  = [ S(CRAWL1, EPAL),    S(CRAWL2, EPAL) ];
    e.tank   = [ S(TANK1, EPAL),     S(TANK2, EPAL) ];
    e.split  = [ S(SPLIT_BIG, EPAL), S(SPLIT_SMALL, EPAL) ];
    e.riser  = [ S(RISER, EPAL) ];
    e.vent   = [ S(VENT, EPAL) ];

    /* --- アイテム --- */
    var it = out.item;
    it.hpSmall = S(HP_SMALL, IPAL);
    it.hpBig   = S(HP_BIG, IPAL);
    it.wpSmall = S(WP_SMALL, IPAL);
    it.wpBig   = S(WP_BIG, IPAL);
    it.oneUp   = S(ONE_UP, IPAL);
    it.eTank   = S(E_TANK, IPAL);

    return out;
  }

  /* ======================================================================
     ボス用：共通シャーシの描画ヘルパ
     ボスは毎フレーム手続き的に描く。pose で腕・脚・傾きを動かせるので
     「腕を振り上げる」「かがむ」といった予備動作を付けやすい。

     引数 o:
       x, y   : 足元中央のワールド座標（呼び出し側でカメラ補正済みを渡す）
       face   : 1 or -1
       col    : { main, dark, light, trim, eye }
       size   : 1.0 基準（1.0 で 幅22 x 高26 くらい）
       pose   : { lean, armL, armR, crouch, legSpread, headY }
     ====================================================================== */
  function chassis(o) {
    var ctx = gfx.ctx;
    var c = o.col, s = o.size || 1, f = o.face || 1;
    var pose = o.pose || {};
    var lean = (pose.lean || 0) * f;
    var crouch = pose.crouch || 0;
    var K = '#101018';

    var x = Math.round(o.x), y = Math.round(o.y);
    function R(dx, dy, w, h, col) {
      // face に応じて左右反転し、輪郭付きの矩形を置く
      var px = x + Math.round((f > 0 ? dx : -dx - w) * s);
      var py = y + Math.round(dy * s);
      gfx.rect(px, py, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), col);
    }
    // 輪郭付きブロック（ドット絵っぽい立体感）
    function Blk(dx, dy, w, h, col, light, dark) {
      R(dx, dy, w, h, K);
      R(dx + 1, dy + 1, w - 2, h - 2, col);
      if (light) R(dx + 1, dy + 1, w - 2, 1, light);
      if (dark)  R(dx + 1, dy + h - 2, w - 2, 1, dark);
    }
    o._R = R; o._Blk = Blk;

    var bodyTop = -26 + crouch;

    /* --- 脚 --- */
    var spread = pose.legSpread === undefined ? 4 : pose.legSpread;
    Blk(-spread - 4, -9 + crouch, 7, 9 - crouch, c.main, c.light, c.dark);
    Blk(spread - 3, -9 + crouch, 7, 9 - crouch, c.main, c.light, c.dark);
    // 足
    Blk(-spread - 5, -3, 9, 3, c.light, null, c.dark);
    Blk(spread - 4, -3, 9, 3, c.light, null, c.dark);

    /* --- 胴 --- */
    Blk(-8 + lean, bodyTop + 6, 16, 13 - crouch, c.main, c.light, c.dark);
    // 胸のトリム
    R(-5 + lean + (f > 0 ? 0 : 0), bodyTop + 9, 10, 4, c.trim);

    /* --- 肩と腕 --- */
    var aL = pose.armL || 0, aR = pose.armR || 0;
    Blk(-12 + lean, bodyTop + 6 + aL, 6, 10, c.light, null, c.dark);   // 奥の腕
    Blk(7 + lean,  bodyTop + 6 + aR, 6, 10, c.main, c.light, c.dark);  // 手前の腕

    /* --- 首と頭 --- */
    var hy = bodyTop + (pose.headY || 0);
    Blk(-7 + lean, hy - 2, 14, 12, c.main, c.light, c.dark);
    // 顔（暗い面）
    R(-5 + lean, hy + 1, 10, 7, '#101018');
    // 目
    var eyeY = hy + 3;
    R(-3 + lean, eyeY, 3, 3, c.eye);
    R(1 + lean,  eyeY, 3, 3, c.eye);
    return { R: R, Blk: Blk, x: x, y: y, s: s, f: f, headY: hy, bodyTop: bodyTop };
  }

  return {
    build: build,
    get player() { return out.player; },
    get enemy() { return out.enemy; },
    get item() { return out.item; },
    S: S, PPAL: PPAL, EPAL: EPAL, IPAL: IPAL,
    chassis: chassis
  };
})();
