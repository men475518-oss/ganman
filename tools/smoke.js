/* 自動プレイテスト：ヘッドレスChromiumで実際に動かし、
   例外・描画停止・進行不能をチェックする */
const { chromium } = require('playwright');
const path = require('path');

const SCENARIO = process.argv[2] || 'basic';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2
  });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const TARGET = process.env.GANMAN_TARGET || 'index.html';
  // NOAUDIO=1 のときは、ページのスクリプトが動く前に AudioContext を消す
  if (process.env.NOAUDIO) {
    await page.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
      Object.defineProperty(window, 'AudioContext', { get: () => undefined, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { get: () => undefined, configurable: true });
    });
  }
  await page.goto('file://' + path.join(__dirname, '..', TARGET));
  await page.waitForTimeout(400);

  // 起動タップ
  await page.mouse.click(422, 195);
  await page.waitForTimeout(600);

  const report = async (label) => {
    const s = await page.evaluate(() => ({
      scene: G.scene.name,
      transitioning: G.scene.transitioning,
      stage: G.scenes.stage.state ? {
        phase: G.scenes.stage.state.phase,
        px: Math.round(G.scenes.stage.state.player.x),
        hp: G.scenes.stage.state.player.hp,
        lives: G.scenes.stage.state.player.lives,
        enemies: G.scenes.stage.state.enemies.length,
        shots: G.scenes.stage.state.shots.length,
        boss: G.scenes.stage.state.boss ? {
          hp: G.scenes.stage.state.boss.hp, state: G.scenes.stage.state.boss.state,
          act: G.scenes.stage.state.boss.act
        } : null
      } : null
    }));
    console.log(label, JSON.stringify(s));
    return s;
  };

  const getState = () => page.evaluate(() => ({
    scene: G.scene.name,
    phase: G.scenes.stage.state ? G.scenes.stage.state.phase : null
  }));
  const waitScene = async (name, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const s = await getState();
      if (s.scene === name) return s;
      await page.waitForTimeout(120);
    }
    throw new Error('waitScene timeout: wanted ' + name + ', got ' + JSON.stringify(await getState()));
  };
  // 同じシーンへ入り直すときは scene 名だけでは判定できないので stage の key で待つ
  const waitStage = async (key, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const k = await page.evaluate(() =>
        (G.scene.name === 'stage' && !G.scene.transitioning && G.scenes.stage.state)
          ? G.scenes.stage.state.key : null);
      if (k === key) return k;
      await page.waitForTimeout(120);
    }
    throw new Error('waitStage timeout: wanted ' + key);
  };
  const waitPhase = async (phase, timeout = 20000) => {
    const t0 = Date.now();
    const seen = new Set();
    while (Date.now() - t0 < timeout) {
      const s = await getState();
      if (s.phase) seen.add(s.phase);
      if (s.phase === phase) return s;
      await page.waitForTimeout(120);
    }
    throw new Error('waitPhase timeout: wanted ' + phase + ', saw ' + [...seen].join(','));
  };

  await report('after-boot');
  global.__ctx = { page, browser, errors, report, waitScene, waitPhase, waitStage, getState };

  // シナリオ実行
  const run = require('./scenarios/' + SCENARIO + '.js');
  await run(global.__ctx);

  if (errors.length) {
    console.log('\n===== ERRORS (' + errors.length + ') =====');
    [...new Set(errors)].slice(0, 25).forEach(e => console.log(e));
    await browser.close();
    process.exit(1);
  }
  console.log('\nNO ERRORS');
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL:', e); process.exit(2); });
