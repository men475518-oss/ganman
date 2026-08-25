/* =========================================================================
   music.js  --  BGM（チップチューン・シーケンサ）

   ・音源ファイル無し。矩形波(デューティ可変)＋三角波＋ノイズで鳴らす
   ・「先読みスケジューリング」方式：setInterval で少し先の音を予約するので
     タイマー精度に左右されずリズムが崩れない
   ・曲は「1小節=16トークンの文字列」の配列で書く（読みやすさ重視）
       トークン: "C4"=発音 / "-"=休符 / "="=前の音を伸ばす
   ========================================================================= */
G.music = (function () {
  'use strict';
  var A = G.audio;

  /* ---------------- 音名 -> 周波数 ---------------- */
  var SEMI = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  var freqCache = {};
  function noteFreq(name) {
    if (freqCache[name] !== undefined) return freqCache[name];
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) return (freqCache[name] = 0);
    var s = SEMI[m[1]] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0));
    var midi = (parseInt(m[3], 10) + 1) * 12 + s;
    return (freqCache[name] = 440 * Math.pow(2, (midi - 69) / 12));
  }

  /* ---------------- デューティ可変パルス波（ファミコンの音の核） ------------- */
  var waveCache = {};
  function pulseWave(duty) {
    var key = 'p' + duty;
    if (waveCache[key]) return waveCache[key];
    var ctx = A.ctx;
    if (!ctx) return null;
    var N = 24;
    var real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (var n = 1; n <= N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    try {
      waveCache[key] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch (e) { waveCache[key] = null; }
    return waveCache[key];
  }

  /* ======================================================================
     曲データ
     bars: 1小節16トークンの文字列を並べる。全チャンネルで小節数を揃えること。
     ====================================================================== */
  function T(bpm, loop, channels, drums) {
    return { bpm: bpm, loop: loop !== false, ch: channels, drums: drums || null };
  }

  var TRACKS = {
    /* ---- タイトル：ゆったり英雄的 ---- */
    title: T(138, true, [
      { wave: 0.5, vol: 0.16, oct: 0, bars: [
        'A4 =  =  =  C5 =  =  =  E5 =  =  =  D5 =  C5 = ',
        'B4 =  =  =  =  =  -  -  G4 =  =  =  B4 =  =  = ',
        'E5 =  =  =  D5 =  =  =  C5 =  =  =  B4 =  A4 = ',
        'A4 =  =  =  =  =  =  =  -  -  -  -  -  -  -  - ' ] },
      { wave: 0.25, vol: 0.09, bars: [
        'C4 =  =  =  E4 =  =  =  A4 =  =  =  F4 =  E4 = ',
        'D4 =  =  =  =  =  -  -  B3 =  =  =  D4 =  =  = ',
        'G4 =  =  =  F4 =  =  =  E4 =  =  =  D4 =  C4 = ',
        'C4 =  =  =  =  =  =  =  -  -  -  -  -  -  -  - ' ] },
      { wave: 'tri', vol: 0.22, bars: [
        'A2 -  A2 -  A2 -  A2 -  F2 -  F2 -  F2 -  F2 - ',
        'G2 -  G2 -  G2 -  G2 -  E2 -  E2 -  E2 -  E2 - ',
        'C3 -  C3 -  C3 -  C3 -  G2 -  G2 -  G2 -  G2 - ',
        'A2 -  A2 -  E2 -  E2 -  A2 -  -  -  A2 -  A2 - ' ] }
    ], ['k -  -  h  s  -  -  h  k  -  k  h  s  -  -  h ',
        'k -  -  h  s  -  -  h  k  -  k  h  s  -  s  s ']),

    /* ---- ステージセレクト：疾走感のあるアルペジオ ---- */
    select: T(162, true, [
      { wave: 0.5, vol: 0.15, bars: [
        'E5 B4 E5 B4 D5 A4 D5 A4 C5 G4 C5 G4 B4 E4 B4 E4',
        'A4 E4 A4 E4 C5 G4 C5 G4 D5 A4 D5 A4 E5 B4 E5 B4' ] },
      { wave: 0.125, vol: 0.07, bars: [
        'E6 -  -  -  D6 -  -  -  C6 -  -  -  B5 -  -  - ',
        'A5 -  -  -  C6 -  -  -  D6 -  -  -  E6 -  -  - ' ] },
      { wave: 'tri', vol: 0.22, bars: [
        'E2 -  E2 -  D2 -  D2 -  C2 -  C2 -  B1 -  B1 - ',
        'A1 -  A1 -  C2 -  C2 -  D2 -  D2 -  E2 -  E2 - ' ] }
    ], ['k -  h  -  s  -  h  -  k  -  h  -  s  -  h  h ']),

    /* ---- ボス戦：切迫した16分刻み ---- */
    boss: T(174, true, [
      { wave: 0.5, vol: 0.16, bars: [
        'C5 =  B4 C5 =  B4 C5 =  G4 =  A4 =  B4 =  =  = ',
        'C5 =  D5 =  E5 =  D5 C5 =  B4 =  =  A4 =  =  = ',
        'F5 =  E5 =  D5 =  C5 =  B4 =  A4 =  G4 =  =  = ',
        'A4 =  =  =  E5 =  =  =  A5 =  =  =  =  =  -  - ' ] },
      { wave: 0.25, vol: 0.08, bars: [
        'A4 =  =  =  =  =  =  =  E4 =  =  =  =  =  =  = ',
        'A4 =  =  =  =  =  =  =  F4 =  =  =  =  =  =  = ',
        'D5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  = ',
        'C5 =  =  =  B4 =  =  =  C5 =  =  =  =  =  -  - ' ] },
      { wave: 'tri', vol: 0.24, bars: [
        'A1 A1 A1 A1 A1 A1 A1 A1 G1 G1 G1 G1 G1 G1 G1 G1',
        'F1 F1 F1 F1 F1 F1 F1 F1 E1 E1 E1 E1 E1 E1 E1 E1',
        'D2 D2 D2 D2 D2 D2 D2 D2 C2 C2 C2 C2 C2 C2 C2 C2',
        'E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2' ] }
    ], ['k -  h  -  s  -  h  -  k  -  h  k  s  -  h  - ',
        'k -  h  -  s  -  h  -  k  -  h  k  s  s  s  s ']),

    /* ---- 各ステージ：属性ごとに性格を変える ---- */
    st_elec: T(170, true, [
      { wave: 0.5, vol: 0.15, bars: [
        'E5 =  D5 E5 =  D5 E5 B4 =  E5 =  D5 E5 =  =  = ',
        'G5 =  F5 G5 =  F5 G5 D5 =  G5 =  F5 E5 =  =  = ' ] },
      { wave: 0.125, vol: 0.06, bars: [
        'B5 -  -  B5 -  -  B5 -  -  B5 -  -  B5 -  -  - ',
        'D6 -  -  D6 -  -  D6 -  -  D6 -  -  B5 -  -  - ' ] },
      { wave: 'tri', vol: 0.22, bars: [
        'E2 E2 -  E2 E2 -  E2 -  D2 D2 -  D2 D2 -  D2 - ',
        'C2 C2 -  C2 C2 -  C2 -  B1 B1 -  B1 B1 -  B1 - ' ] }
    ], ['k -  h  h  s  -  h  h  k  k  h  h  s  -  h  h ']),

    st_fire: T(158, true, [
      { wave: 0.5, vol: 0.15, bars: [
        'A4 =  C5 =  D5 =  C5 =  A4 =  =  =  G4 =  A4 = ',
        'C5 =  D5 =  F5 =  E5 =  D5 =  =  =  C5 =  =  = ' ] },
      { wave: 0.25, vol: 0.07, bars: [
        'E4 -  E4 -  F4 -  F4 -  E4 -  E4 -  D4 -  D4 - ',
        'G4 -  G4 -  A4 -  A4 -  G4 -  G4 -  E4 -  E4 - ' ] },
      { wave: 'tri', vol: 0.23, bars: [
        'A1 -  A1 A1 -  A1 -  A1 F1 -  F1 F1 -  F1 -  F1',
        'C2 -  C2 C2 -  C2 -  C2 E2 -  E2 E2 -  E2 -  E2' ] }
    ], ['k -  -  h  s  -  k  h  k  -  -  h  s  -  s  h ']),

    st_ice: T(142, true, [
      { wave: 0.25, vol: 0.14, bars: [
        'E5 =  G5 =  B5 =  G5 =  E5 =  D5 =  B4 =  =  = ',
        'C5 =  E5 =  A5 =  E5 =  C5 =  B4 =  A4 =  =  = ' ] },
      { wave: 0.125, vol: 0.06, bars: [
        'B5 -  -  -  E6 -  -  -  B5 -  -  -  G5 -  -  - ',
        'A5 -  -  -  E6 -  -  -  A5 -  -  -  E5 -  -  - ' ] },
      { wave: 'tri', vol: 0.20, bars: [
        'E2 -  -  E2 -  -  E2 -  B1 -  -  B1 -  -  B1 - ',
        'A1 -  -  A1 -  -  A1 -  E2 -  -  E2 -  -  E2 - ' ] }
    ], ['k -  -  -  s  -  h  -  k  -  -  h  s  -  -  h ']),

    st_bomb: T(152, true, [
      { wave: 0.5, vol: 0.15, bars: [
        'D5 =  A4 =  D5 =  F5 =  E5 =  C5 =  E5 =  =  = ',
        'F5 =  C5 =  A4 =  C5 =  D5 =  =  =  =  =  -  - ' ] },
      { wave: 0.25, vol: 0.07, bars: [
        'A4 -  -  A4 -  -  A4 -  G4 -  -  G4 -  -  G4 - ',
        'A4 -  -  A4 -  -  A4 -  F4 -  -  F4 -  -  A4 - ' ] },
      { wave: 'tri', vol: 0.23, bars: [
        'D2 -  D2 -  A1 -  A1 -  C2 -  C2 -  G1 -  G1 - ',
        'F1 -  F1 -  C2 -  C2 -  D2 -  D2 -  D2 -  D2 - ' ] }
    ], ['k -  h  -  s  -  h  k  -  k  h  -  s  -  h  h ']),

    st_cut: T(178, true, [
      { wave: 0.5, vol: 0.15, bars: [
        'B4 C5 D5 =  C5 B4 A4 =  B4 C5 D5 E5 D5 =  =  = ',
        'E5 F5 G5 =  F5 E5 D5 =  C5 =  B4 =  A4 =  =  = ' ] },
      { wave: 0.125, vol: 0.06, bars: [
        'E5 -  E5 -  E5 -  E5 -  A4 -  A4 -  A4 -  A4 - ',
        'G4 -  G4 -  G4 -  G4 -  E4 -  E4 -  E4 -  E4 - ' ] },
      { wave: 'tri', vol: 0.22, bars: [
        'E2 E2 E2 -  E2 E2 E2 -  A1 A1 A1 -  A1 A1 A1 - ',
        'C2 C2 C2 -  C2 C2 C2 -  E2 E2 E2 -  E2 E2 E2 - ' ] }
    ], ['k -  h  h  s  -  h  h  k  -  h  h  s  s  h  h ']),

    st_guts: T(134, true, [
      { wave: 0.5, vol: 0.16, bars: [
        'C5 =  =  =  C5 =  =  C5 =  =  D5 =  =  =  =  = ',
        'E5 =  =  =  D5 =  =  C5 =  =  A4 =  =  =  =  = ' ] },
      { wave: 0.25, vol: 0.07, bars: [
        'G4 -  -  -  G4 -  -  G4 -  -  A4 -  -  -  -  - ',
        'C5 -  -  -  A4 -  -  G4 -  -  E4 -  -  -  -  - ' ] },
      { wave: 'tri', vol: 0.26, bars: [
        'C2 -  -  -  C2 -  C2 -  G1 -  -  -  G1 -  G1 - ',
        'A1 -  -  -  A1 -  A1 -  E2 -  -  -  E2 -  E2 - ' ] }
    ], ['k -  -  -  k  -  k  -  s  -  -  -  k  -  s  - ']),

    /* ---- ジングル類（ループしない） ---- */
    victory: T(150, false, [
      { wave: 0.5, vol: 0.18, bars: [
        'C5 =  E5 =  G5 =  C6 =  =  =  G5 =  C6 =  =  = ',
        'C6 =  =  =  =  =  =  =  -  -  -  -  -  -  -  - ' ] },
      { wave: 0.25, vol: 0.10, bars: [
        'E4 =  G4 =  C5 =  E5 =  =  =  C5 =  E5 =  =  = ',
        'E5 =  =  =  =  =  =  =  -  -  -  -  -  -  -  - ' ] },
      { wave: 'tri', vol: 0.24, bars: [
        'C2 -  C2 -  C2 -  C2 -  G2 -  G2 -  C3 -  C3 - ',
        'C3 -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ' ] }
    ], ['k -  k  -  k  -  k  -  s  -  s  -  k  -  -  - ',
        'k s  s  s  -  -  -  -  -  -  -  -  -  -  -  - ']),

    weaponget: T(160, false, [
      { wave: 0.5, vol: 0.18, bars: [
        'E5 =  G5 =  C6 =  =  =  B5 =  C6 =  E6 =  =  = ',
        'C6 =  =  =  =  =  =  =  =  =  -  -  -  -  -  - ' ] },
      { wave: 0.25, vol: 0.10, bars: [
        'C5 =  E5 =  G5 =  =  =  G5 =  G5 =  C6 =  =  = ',
        'G5 =  =  =  =  =  =  =  =  =  -  -  -  -  -  - ' ] },
      { wave: 'tri', vol: 0.24, bars: [
        'C2 -  C2 -  C2 -  C2 -  G1 -  G1 -  C2 -  C2 - ',
        'C2 -  -  C2 -  -  C2 -  -  -  -  -  -  -  -  - ' ] }
    ], ['k -  -  -  k  -  -  -  s  -  -  -  k  -  s  s ']),

    gameover: T(92, false, [
      { wave: 0.25, vol: 0.16, bars: [
        'A4 =  =  =  G4 =  =  =  F4 =  =  =  E4 =  =  = ',
        'D4 =  =  =  E4 =  =  =  A3 =  =  =  =  =  =  = ' ] },
      { wave: 0.5, vol: 0.08, bars: [
        'C4 =  =  =  B3 =  =  =  A3 =  =  =  G3 =  =  = ',
        'F3 =  =  =  G3 =  =  =  A3 =  =  =  =  =  =  = ' ] },
      { wave: 'tri', vol: 0.20, bars: [
        'A1 -  -  -  -  -  -  -  F1 -  -  -  -  -  -  - ',
        'D1 -  -  -  E1 -  -  -  A1 -  -  -  -  -  -  - ' ] }
    ], null),

    clear: T(148, false, [
      { wave: 0.5, vol: 0.18, bars: [
        'G4 =  C5 =  E5 =  G5 =  =  =  E5 =  G5 =  =  = ',
        'C6 =  =  =  =  =  G5 =  C6 =  =  =  =  =  -  - ' ] },
      { wave: 0.25, vol: 0.10, bars: [
        'C4 =  E4 =  G4 =  C5 =  =  =  C5 =  E5 =  =  = ',
        'E5 =  =  =  =  =  C5 =  E5 =  =  =  =  =  -  - ' ] },
      { wave: 'tri', vol: 0.24, bars: [
        'C2 -  C2 -  C2 -  C2 -  G2 -  G2 -  G2 -  G2 - ',
        'C2 -  C2 -  C2 -  C2 -  C3 -  -  -  -  -  -  - ' ] }
    ], ['k -  h  -  s  -  h  -  k  -  h  -  s  -  s  s ',
        'k -  h  -  s  -  h  -  k  k  s  s  k  -  -  - '])
  };

  /* ======================================================================
     再生エンジン（先読みスケジューラ）
     ====================================================================== */
  var LOOKAHEAD = 0.22;   // 何秒先まで予約するか
  var TICK_MS = 30;       // 予約処理を回す間隔

  var cur = null;   // { key, track, seqs, drums, len, step, nextTime, stepDur }
  var timer = null;
  var pendingKey = null;

  function parseBars(bars) {
    // 小節文字列の配列 -> トークン配列
    var out = [];
    for (var i = 0; i < bars.length; i++) {
      var toks = bars[i].trim().split(/\s+/);
      for (var j = 0; j < toks.length; j++) out.push(toks[j]);
    }
    return out;
  }

  function prepare(key) {
    var t = TRACKS[key];
    if (!t) return null;
    var seqs = [], len = 0, i;
    for (i = 0; i < t.ch.length; i++) {
      var toks = parseBars(t.ch[i].bars);
      seqs.push({ toks: toks, wave: t.ch[i].wave, vol: t.ch[i].vol });
      if (toks.length > len) len = toks.length;
    }
    var drums = t.drums ? parseBars(t.drums) : null;
    if (drums && drums.length > len) len = drums.length;
    return {
      key: key, track: t, seqs: seqs, drums: drums, len: len,
      step: 0, nextTime: 0, stepDur: 60 / t.bpm / 4
    };
  }

  /* 1音を予約する。'=' が続く分だけ音を伸ばす */
  function scheduleNote(seq, idx, time, stepDur) {
    var tok = seq.toks[idx];
    if (!tok || tok === '-' || tok === '=') return;
    var f = noteFreq(tok);
    if (!f) return;
    // 伸ばし記号を数えて音の長さを決める
    var hold = 1;
    while (idx + hold < seq.toks.length && seq.toks[idx + hold] === '=') hold++;
    var dur = stepDur * hold * 0.92;

    var ctx = A.ctx;
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      if (seq.wave === 'tri') osc.type = 'triangle';
      else if (seq.wave === 'saw') osc.type = 'sawtooth';
      else {
        var w = pulseWave(seq.wave || 0.5);
        if (w) osc.setPeriodicWave(w); else osc.type = 'square';
      }
      osc.frequency.setValueAtTime(f, time);
      var v = seq.vol;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(v, time + 0.008);
      g.gain.setValueAtTime(v, time + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g); g.connect(A.musicBus);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    } catch (e) {}
  }

  function scheduleDrum(sym, time) {
    if (!sym || sym === '-') return;
    if (sym === 'k') {            // キック
      A.tone({ type:'sine', freq: 150, freq2: 42, dur: 0.13, vol: 0.30, bus: A.musicBus, delay: time - A.now() });
      A.noise({ dur: 0.04, vol: 0.10, filterFreq: 400, bus: A.musicBus, delay: time - A.now() });
    } else if (sym === 's') {     // スネア
      A.noise({ dur: 0.11, vol: 0.16, filterFreq: 3200, filterFreq2: 900, bus: A.musicBus, delay: time - A.now() });
    } else if (sym === 'h') {     // ハイハット
      A.noise({ dur: 0.035, vol: 0.055, filterType:'highpass', filterFreq: 7000, bus: A.musicBus, delay: time - A.now() });
    }
  }

  function pump() {
    if (!cur || !A.ok) return;
    var ctx = A.ctx;
    var horizon = ctx.currentTime + LOOKAHEAD;
    var guard = 0;
    while (cur.nextTime < horizon && guard++ < 200) {
      var s = cur.step;
      for (var i = 0; i < cur.seqs.length; i++) scheduleNote(cur.seqs[i], s, cur.nextTime, cur.stepDur);
      if (cur.drums) scheduleDrum(cur.drums[s], cur.nextTime);
      cur.nextTime += cur.stepDur;
      cur.step++;
      if (cur.step >= cur.len) {
        if (cur.track.loop) cur.step = 0;
        else { // ループしない曲は鳴らし終わったら停止
          var endAt = cur.nextTime;
          cur = null;
          setTimeout(function () { if (!cur) stopTimer(); }, Math.max(0, (endAt - ctx.currentTime) * 1000));
          return;
        }
      }
    }
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(pump, TICK_MS);
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* ---------------- 公開API ---------------- */
  function play(key, opts) {
    opts = opts || {};
    pendingKey = key;
    if (!A.ok) { A.init(); }
    if (!A.ok) return;                       // 音が使えない環境：何もしない
    if (cur && cur.key === key && !opts.restart) return;  // 同じ曲なら鳴らし直さない
    stop();
    var p = prepare(key);
    if (!p) return;
    p.nextTime = A.ctx.currentTime + 0.06;
    cur = p;
    // 音量を戻す（フェードアウト直後の再生に備えて）
    try { A.musicBus.gain.cancelScheduledValues(A.now());
          A.musicBus.gain.setValueAtTime(opts.vol === undefined ? 0.55 : opts.vol, A.now()); } catch (e) {}
    startTimer();
  }

  function stop() {
    cur = null;
    stopTimer();
  }

  function fadeOut(sec) {
    if (!A.ok) { stop(); return; }
    sec = sec || 0.6;
    try {
      A.musicBus.gain.cancelScheduledValues(A.now());
      A.musicBus.gain.setValueAtTime(A.musicBus.gain.value, A.now());
      A.musicBus.gain.linearRampToValueAtTime(0.0001, A.now() + sec);
    } catch (e) {}
    setTimeout(stop, sec * 1000);
  }

  // ポーズ中など、音量だけ下げたいとき
  function duck(amount) {
    if (!A.ok) return;
    try { A.musicBus.gain.setTargetAtTime(amount, A.now(), 0.05); } catch (e) {}
  }

  function isPlaying(key) { return !!cur && (!key || cur.key === key); }

  return {
    play: play, stop: stop, fadeOut: fadeOut, duck: duck,
    isPlaying: isPlaying, noteFreq: noteFreq,
    get current() { return cur ? cur.key : null; },
    TRACKS: TRACKS
  };
})();
