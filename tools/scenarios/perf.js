/* 実プレイに近い負荷でのFPSを測る */
module.exports = async ({ page, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);
  await page.evaluate(() => G.scene.go('stage', { key: 'fire' }, { fade: 4 }));
  await waitScene('stage'); await waitPhase('play', 15000);

  // rAF カウンタは一度だけ登録する（毎回登録すると多重カウントになる）
  await page.evaluate(() => {
    window.__f = 0;
    window.__worst = 0;
    let prev = performance.now();
    const l = (now) => {
      window.__f++;
      const dt = now - prev; prev = now;
      if (dt > window.__worst) window.__worst = dt;
      requestAnimationFrame(l);
    };
    requestAnimationFrame(l);
  });
  const measure = async (label, ms) => {
    await page.evaluate(() => { window.__f = 0; window.__worst = 0; });
    const t0 = Date.now();
    await page.waitForTimeout(ms);
    const r = await page.evaluate(() => ({ f: window.__f, worst: window.__worst }));
    const fps = r.f / ((Date.now() - t0) / 1000);
    console.log(`${label}: ${fps.toFixed(1)} FPS (最悪フレーム ${r.worst.toFixed(1)}ms)`);
  };

  await measure('通常プレイ(静止)', 2000);

  // 走りながら撃つ
  await page.keyboard.down('ArrowRight');
  await measure('走行+射撃', 2500);
  await page.keyboard.up('ArrowRight');

  // パーティクルを大量に出した状態
  // 測定中ずっとパーティクルを出し続けて最悪ケースを作る
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    window.__spam = setInterval(() => {
      for (let i = 0; i < 6; i++) G.fx.explodeBig(s.player.cx() + i * 20, s.player.cy() - 20);
    }, 60);
  });
  await measure('大量パーティクル', 2500);
  const pc = await page.evaluate(() => { clearInterval(window.__spam); return G.fx.get().parts.length; });
  console.log('  (パーティクル数 ' + pc + ')');

  // ボス戦の負荷
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.x = s.data.boss.triggerX - 30;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 9000);
  await page.keyboard.up('ArrowRight');
  await waitPhase('boss', 20000);
  await page.evaluate(() => { G.scenes.stage.state.boss.enraged = true; });
  await measure('ボス戦(強化)', 3000);
  const load = await page.evaluate(() => {
    const s = G.scenes.stage.state;
    return { shots: s.shots.length, hazards: s.hazards.length, enemies: s.enemies.length,
             parts: G.fx.get().parts.length };
  });
  console.log('  負荷:', JSON.stringify(load));
};
