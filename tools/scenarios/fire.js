/* 連射性能の実測：一定時間ボタンを叩き続けて、実際に何発出たか数える */
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'cut' }, { fade: 4 }));
  await waitStage('cut'); await waitPhase('play', 15000);

  // スタート地帯（開けた平地）で計測する
  await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player;
    p.x = 3 * 16; p.y = 15 * 16 - p.h; p.vx = p.vy = 0; p.invul = 999999;
    s.camX = 0; s.camY = 96;
    s.shots.length = 0;
    // 発射回数を数える
    window.__fired = 0;
    const orig = G.weapons.fire;
    if (!window.__hooked) {
      window.__hooked = true;
      G.weapons.fire = function (pl, st, id, lv) {
        const r = orig.apply(this, arguments);
        if (r) window.__fired++;
        return r;
      };
    }
  });

  const tap = async (ms, interval) => {
    await page.evaluate(() => { window.__fired = 0; });
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await page.keyboard.down('KeyZ');
      await page.waitForTimeout(interval);
      await page.keyboard.up('KeyZ');
      await page.waitForTimeout(interval);
    }
    const r = await page.evaluate(() => ({
      fired: window.__fired,
      onScreen: G.scenes.stage.state.shots.filter(s => s.team === 'player').length
    }));
    const sec = (Date.now() - t0) / 1000;
    console.log(`  ${interval}ms間隔で${sec.toFixed(1)}秒連打 -> ${r.fired}発 ` +
                `(${(r.fired/sec).toFixed(1)}発/秒) 画面上に残り${r.onScreen}発`);
    return r.fired / sec;
  };

  console.log('連打テスト（開けた平地・右向き）:');
  await tap(3000, 60);
  await page.waitForTimeout(1500);
  await tap(3000, 110);

  // 押した瞬間に出るかどうか
  await page.evaluate(() => { G.scenes.stage.state.shots.length = 0; window.__fired = 0; });
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(120);
  const onPress = await page.evaluate(() => window.__fired);
  await page.keyboard.up('KeyZ');
  await page.waitForTimeout(120);
  const onRelease = await page.evaluate(() => window.__fired);
  console.log(`押した瞬間: ${onPress}発 / 離した後: 累計${onRelease}発`);

  /* --- 実機と同じタッチ操作での連射 --- */
  const btn = await page.evaluate(() => {
    const L = G.input.layout();
    return { x: L.shot.x * G.gfx.scale + G.gfx.offX, y: L.shot.y * G.gfx.scale + G.gfx.offY };
  });
  await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player;
    p.x = 3 * 16; p.y = 15 * 16 - p.h; p.vx = p.vy = 0;
    s.shots.length = 0; window.__fired = 0;
  });
  // 人間が出せる連打速度で測る（秒間8回＝かなり速い / 秒間12回＝限界付近）
  for (const [taps, gap] of [[12, 125], [12, 83]]) {
    await page.evaluate(() => {
      const s = G.scenes.stage.state;
      s.shots.length = 0; window.__fired = 0;
      s.player.x = 3 * 16; s.player.vx = 0;
    });
    const t0 = Date.now();
    for (let i = 0; i < taps; i++) {
      await page.touchscreen.tap(btn.x, btn.y);
      await page.waitForTimeout(gap);
    }
    const sec2 = (Date.now() - t0) / 1000;
    const r2 = await page.evaluate(() => window.__fired);
    console.log(`タッチ連打 秒間${(taps/sec2).toFixed(1)}回 (${taps}タップ) -> ${r2}発 ` +
                `${r2 >= taps ? '取りこぼし無し' : '!! ' + (taps - r2) + '発 取りこぼし'}`);
  }

  // 長押しでチャージ弾が出るか（通常弾＋チャージ弾の2発になるはず）
  await page.evaluate(() => { G.scenes.stage.state.shots.length = 0; window.__fired = 0; });
  await page.evaluate((b) => {
    const cv = document.getElementById('screen');
    const t = new Touch({ identifier: 9, target: cv, clientX: b.x, clientY: b.y });
    cv.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t],
      bubbles: true, cancelable: true }));
    window.__t = t; window.__cv = cv;
  }, btn);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    window.__cv.dispatchEvent(new TouchEvent('touchend', { touches: [],
      changedTouches: [window.__t], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  const r3 = await page.evaluate(() => {
    const big = G.scenes.stage.state.shots.filter(s => s.level === 2).length;
    return { fired: window.__fired, charged: big };
  });
  console.log(`長押し1.4秒 -> 計${r3.fired}発（押した瞬間の通常弾＋離したときのチャージ弾）` +
              ` フルチャージ弾${r3.charged}発`);
};
