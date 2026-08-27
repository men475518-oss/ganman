/* ジャンプの到達性能を実測する（理論値ではなく実際に飛ばして測る） */
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'cut' }, { fade: 4 }));
  await waitStage('cut'); await waitPhase('play', 15000);

  // 平らな床の上に置いて計測する
  const measure = async (label) => {
    await page.evaluate(() => {
      const s = G.scenes.stage.state, p = s.player, T = 16;
      // スタート地帯（必ず平地）に戻す
      p.x = 3 * T; p.y = 15 * T - p.h; p.vx = p.vy = 0;
      p.onGround = true; p.state = 'idle'; p.invul = 9999;
      s.camX = 0; s.camY = 96;
      window.__j = { x0: p.x, y0: p.y, maxUp: 0, dist: 0, frames: 0, landed: false };
    });
    // 右を押しながらジャンプを押しっぱなしにする
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(60);
    await page.keyboard.down('KeyX');
    // 着地するまで毎フレーム追う
    await page.evaluate(() => new Promise(res => {
      const p = G.scenes.stage.state.player;
      const j = window.__j;
      let started = false, n = 0;
      const tick = () => {
        n++;
        if (!p.onGround) started = true;
        j.maxUp = Math.max(j.maxUp, j.y0 - p.y);
        if (started && p.onGround) { j.dist = p.x - j.x0; j.frames = n; j.landed = true; return res(); }
        if (n > 200) { j.dist = p.x - j.x0; j.frames = n; return res(); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.up('KeyX');
    await page.keyboard.up('ArrowRight');
    const j = await page.evaluate(() => window.__j);
    const T = 16;
    console.log(`${label}: 高さ ${j.maxUp.toFixed(1)}px (${(j.maxUp/T).toFixed(2)}タイル) / ` +
                `飛距離 ${j.dist.toFixed(1)}px (${(j.dist/T).toFixed(2)}タイル) / 滞空 ${j.frames}F`);
    return j;
  };

  await measure('フルジャンプ');
  // 短押し（可変ジャンプの下限）も測る
  await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player, T = 16;
    p.x = 3 * T; p.y = 15 * T - p.h; p.vx = p.vy = 0; p.onGround = true;
  });
};
