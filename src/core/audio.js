/* =========================================================================
   audio.js  --  効果音（WebAudio によるファミコン風シンセ）

   ・音声ファイルを一切使わず、その場で波形を合成する（読み込み0秒・軽量）
   ・AudioContext が無い/失敗する環境では全て無音のまま正常動作する
   ・iOS はユーザー操作の中で resume() しないと鳴らないので unlock() を用意
   ========================================================================= */
G.audio = (function () {
  'use strict';

  var ctx = null;
  var master = null, sfxGain = null, musicGain = null;
  var ok = false;            // 音が使えるか
  var muted = false;
  var noiseBuf = null;

  /* ---------------- 初期化 / アンロック ---------------- */
  function init() {
    if (ctx) return ok;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);

      sfxGain = ctx.createGain();   sfxGain.gain.value = 0.9;   sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.55; musicGain.connect(master);

      // ノイズ用バッファ（爆発・着地・ドラム）を1本作って使い回す
      var len = Math.floor(ctx.sampleRate * 1.0);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      ok = true;
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  // ユーザー操作の中から呼ぶこと（iOS Safari 対策）
  function unlock() {
    if (!init()) return false;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      // 無音を1サンプル鳴らして本当に解禁する
      var o = ctx.createOscillator(), g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + 0.01);
    } catch (e) {}
    return true;
  }

  function now() { return ctx ? ctx.currentTime : 0; }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, now(), 0.02);
  }
  function toggleMute() { setMuted(!muted); return muted; }

  /* ======================================================================
     合成プリミティブ
     ====================================================================== */
  /* 単音。周波数を f0 -> f1 へスイープできる（ファミコンっぽさの決め手） */
  function tone(o) {
    if (!ok || muted) return;
    o = o || {};
    try {
      var t = now() + (o.delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'square';
      var f0 = o.freq || 440, f1 = (o.freq2 === undefined ? f0 : o.freq2);
      var dur = o.dur || 0.1;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) {
        if (o.expo === false) osc.frequency.linearRampToValueAtTime(f1, t + dur);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      }
      var vol = (o.vol === undefined ? 0.3 : o.vol);
      var atk = (o.attack === undefined ? 0.005 : o.attack);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      var node = osc;
      if (o.detune) osc.detune.setValueAtTime(o.detune, t);
      node.connect(g);
      g.connect(o.bus || sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) {}
  }

  /* ノイズ。爆発・着地音・ドラムに使う */
  function noise(o) {
    if (!ok || muted) return;
    o = o || {};
    try {
      var t = now() + (o.delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var g = ctx.createGain();
      var dur = o.dur || 0.15;
      var vol = (o.vol === undefined ? 0.25 : o.vol);

      var filt = ctx.createBiquadFilter();
      filt.type = o.filterType || 'lowpass';
      var f0 = o.filterFreq || 2000, f1 = (o.filterFreq2 === undefined ? f0 : o.filterFreq2);
      filt.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      filt.Q.value = o.q || 1;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(filt); filt.connect(g); g.connect(o.bus || sfxGain);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch (e) {}
  }

  /* ======================================================================
     効果音カタログ
     ここに足していけば新しい音を増やせる。呼び出しは G.audio.sfx.xxx()
     ====================================================================== */
  var sfx = {
    /* --- プレイヤー --- */
    shot:      function () { tone({ type:'square', freq: 1180, freq2: 420, dur: 0.09, vol: 0.20 }); },
    shotBig:   function () { tone({ type:'square', freq: 760, freq2: 200, dur: 0.20, vol: 0.26 });
                             tone({ type:'sawtooth', freq: 380, freq2: 90, dur: 0.22, vol: 0.16 }); },
    shotMid:   function () { tone({ type:'square', freq: 900, freq2: 300, dur: 0.14, vol: 0.23 }); },
    jump:      function () { tone({ type:'square', freq: 300, freq2: 720, dur: 0.11, vol: 0.16 }); },
    land:      function () { noise({ dur: 0.07, vol: 0.13, filterFreq: 900, filterFreq2: 200 }); },
    hurt:      function () { tone({ type:'sawtooth', freq: 420, freq2: 90, dur: 0.30, vol: 0.28 });
                             noise({ dur: 0.18, vol: 0.12, filterFreq: 1800, filterFreq2: 300 }); },
    death:     function () { // やられた時：上下に散る特徴的な音
                             tone({ type:'square', freq: 200, freq2: 1400, dur: 0.5, vol: 0.22 });
                             tone({ type:'square', freq: 900, freq2: 120, dur: 0.5, vol: 0.20 }); },
    teleport:  function () { tone({ type:'sine', freq: 180, freq2: 2400, dur: 0.42, vol: 0.20 }); },
    teleportIn:function () { tone({ type:'sine', freq: 2400, freq2: 180, dur: 0.42, vol: 0.20 }); },
    land2:     function () { noise({ dur: 0.12, vol: 0.20, filterFreq: 1400, filterFreq2: 120 });
                             tone({ type:'triangle', freq: 140, freq2: 50, dur: 0.14, vol: 0.20 }); },

    /* --- チャージ（溜め）関係 --- */
    chargeTick:function () { tone({ type:'square', freq: 1600, dur: 0.03, vol: 0.06 }); },
    chargeMax: function () { tone({ type:'square', freq: 900, freq2: 1800, dur: 0.10, vol: 0.10 }); },

    /* --- ヒット・破壊 --- */
    hit:       function () { tone({ type:'square', freq: 240, freq2: 120, dur: 0.05, vol: 0.16 }); },
    deflect:   function () { tone({ type:'square', freq: 1500, freq2: 1100, dur: 0.06, vol: 0.14 });
                             tone({ type:'square', freq: 2100, freq2: 1500, dur: 0.06, vol: 0.10, delay: 0.03 }); },
    explode:   function () { noise({ dur: 0.42, vol: 0.32, filterFreq: 2600, filterFreq2: 90 });
                             tone({ type:'triangle', freq: 170, freq2: 30, dur: 0.38, vol: 0.22 }); },
    explodeBig:function () { noise({ dur: 0.85, vol: 0.40, filterFreq: 3200, filterFreq2: 60, q: 0.6 });
                             tone({ type:'triangle', freq: 130, freq2: 20, dur: 0.75, vol: 0.28 });
                             noise({ dur: 0.5, vol: 0.22, filterFreq: 1200, filterFreq2: 100, delay: 0.12 }); },
    enemyPop:  function () { noise({ dur: 0.20, vol: 0.20, filterFreq: 2200, filterFreq2: 200 }); },

    /* --- アイテム --- */
    pickup:    function () { tone({ type:'square', freq: 900, dur: 0.05, vol: 0.16 });
                             tone({ type:'square', freq: 1350, dur: 0.07, vol: 0.16, delay: 0.05 }); },
    energy:    function () { tone({ type:'square', freq: 1200, dur: 0.035, vol: 0.10 }); },
    oneUp:     function () { // 1UP：おなじみの上昇アルペジオ
                             [880, 1108, 1318, 1760].forEach(function (f, i) {
                               tone({ type:'square', freq: f, dur: 0.12, vol: 0.20, delay: i * 0.075 });
                             }); },

    /* --- メニュー --- */
    menuMove:  function () { tone({ type:'square', freq: 620, dur: 0.04, vol: 0.14 }); },
    menuSelect:function () { tone({ type:'square', freq: 780, dur: 0.06, vol: 0.20 });
                             tone({ type:'square', freq: 1170, dur: 0.10, vol: 0.20, delay: 0.06 }); },
    menuBack:  function () { tone({ type:'square', freq: 500, freq2: 260, dur: 0.10, vol: 0.16 }); },
    pause:     function () { tone({ type:'square', freq: 1400, dur: 0.05, vol: 0.16 });
                             tone({ type:'square', freq: 700,  dur: 0.07, vol: 0.14, delay: 0.05 }); },
    deny:      function () { tone({ type:'square', freq: 180, freq2: 120, dur: 0.14, vol: 0.18 }); },
    weaponSwitch: function () { tone({ type:'square', freq: 1400, freq2: 2100, dur: 0.06, vol: 0.16 }); },
    blip:      function () { tone({ type:'square', freq: 1500, dur: 0.02, vol: 0.07 }); },

    /* --- 属性武器 --- */
    thunder:   function () { noise({ dur: 0.30, vol: 0.22, filterType:'highpass', filterFreq: 1200, filterFreq2: 4000 });
                             tone({ type:'sawtooth', freq: 1400, freq2: 300, dur: 0.24, vol: 0.16 }); },
    fire:      function () { noise({ dur: 0.34, vol: 0.20, filterFreq: 900, filterFreq2: 2600, filterType:'bandpass', q: 2 });
                             tone({ type:'sawtooth', freq: 260, freq2: 620, dur: 0.24, vol: 0.12 }); },
    ice:       function () { tone({ type:'sine', freq: 2400, freq2: 1500, dur: 0.22, vol: 0.16 });
                             tone({ type:'sine', freq: 3100, freq2: 2000, dur: 0.20, vol: 0.10, delay: 0.03 }); },
    bombThrow: function () { tone({ type:'square', freq: 420, freq2: 900, dur: 0.14, vol: 0.16 }); },
    cutter:    function () { tone({ type:'sawtooth', freq: 1500, freq2: 900, dur: 0.16, vol: 0.16 });
                             tone({ type:'sawtooth', freq: 1200, freq2: 1800, dur: 0.14, vol: 0.10, delay: 0.08 }); },
    rockThrow: function () { tone({ type:'triangle', freq: 320, freq2: 160, dur: 0.18, vol: 0.20 });
                             noise({ dur: 0.14, vol: 0.12, filterFreq: 700 }); },
    freeze:    function () { tone({ type:'sine', freq: 1800, freq2: 600, dur: 0.30, vol: 0.16 }); },

    /* --- ボス --- */
    bossStep:  function () { noise({ dur: 0.14, vol: 0.24, filterFreq: 600, filterFreq2: 80 });
                             tone({ type:'triangle', freq: 110, freq2: 40, dur: 0.16, vol: 0.20 }); },
    bossWarn:  function () { tone({ type:'square', freq: 200, freq2: 600, dur: 0.28, vol: 0.20 }); },
    bossHurt:  function () { tone({ type:'square', freq: 300, freq2: 180, dur: 0.07, vol: 0.18 }); },
    doorOpen:  function () { noise({ dur: 0.36, vol: 0.16, filterFreq: 500, filterFreq2: 1600 }); },
    doorClose: function () { noise({ dur: 0.30, vol: 0.16, filterFreq: 1600, filterFreq2: 300 });
                             tone({ type:'triangle', freq: 90, freq2: 40, dur: 0.16, vol: 0.18, delay: 0.24 }); },
    charge:    function () { tone({ type:'sawtooth', freq: 120, freq2: 900, dur: 0.6, vol: 0.14 }); },
    quake:     function () { noise({ dur: 0.7, vol: 0.28, filterFreq: 280, filterFreq2: 60 });
                             tone({ type:'triangle', freq: 70, freq2: 28, dur: 0.6, vol: 0.24 }); }
  };

  /* ======================================================================
     チャージ持続音（押しっぱなしの間ずっと鳴らす）
     ====================================================================== */
  var chargeNodes = null;
  function chargeStart() {
    if (!ok || muted || chargeNodes) return;
    try {
      var t = now();
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = 'square'; o2.type = 'square';
      o1.frequency.setValueAtTime(220, t);
      o2.frequency.setValueAtTime(224, t);   // わずかにずらしてうねりを出す
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
      o1.connect(g); o2.connect(g); g.connect(sfxGain);
      o1.start(t); o2.start(t);
      chargeNodes = { o1: o1, o2: o2, g: g };
    } catch (e) {}
  }
  // level 0..1 でピッチを上げていく
  function chargeLevel(level) {
    if (!chargeNodes) return;
    try {
      var t = now();
      var f = 220 + level * 620;
      chargeNodes.o1.frequency.setTargetAtTime(f, t, 0.05);
      chargeNodes.o2.frequency.setTargetAtTime(f * 1.02, t, 0.05);
    } catch (e) {}
  }
  function chargeStop() {
    if (!chargeNodes) return;
    try {
      var t = now(), n = chargeNodes;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(Math.max(0.0001, n.g.gain.value), t);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.o1.stop(t + 0.08); n.o2.stop(t + 0.08);
    } catch (e) {}
    chargeNodes = null;
  }

  return {
    init: init, unlock: unlock,
    get ok() { return ok; },
    get ctx() { return ctx; },
    get musicBus() { return musicGain; },
    get sfxBus() { return sfxGain; },
    get muted() { return muted; },
    setMuted: setMuted, toggleMute: toggleMute,
    tone: tone, noise: noise, now: now,
    sfx: sfx,
    chargeStart: chargeStart, chargeLevel: chargeLevel, chargeStop: chargeStop
  };
})();
