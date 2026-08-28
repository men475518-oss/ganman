/* 新しい敵とギミックの見た目を撮る */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);

  // 指定の地形の前に立たせて撮る
  const shot = async (stage, tile, name, wait) => {
    await page.evaluate((k) => G.scene.go('stage', { key: k }, { fade: 4 }), stage);
    await waitStage(stage); await waitPhase('play', 15000);
    await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });
    const ok = await page.evaluate((c) => {
      const s = G.scenes.stage.state, g = s.level.grid, T = 16, p = s.player;
      for (let x = 14; x < s.level.w - 30; x++)
        for (let y = 3; y < s.level.h - 1; y++)
          if (g[y][x] === c) {
            // その地形の少し手前の地面に立たせる
            let sy = y;
            while (sy < s.level.h - 1 && g[sy][x - 4] !== '#') sy++;
            p.x = (x - 4) * T; p.y = sy * T - p.h; p.vx = p.vy = 0;
            s.camX = p.x - 120; s.camY = p.y - 120;
            return true;
          }
      return false;
    }, tile);
    if (!ok) { console.log(name + ': 見つからず'); return; }
    await page.waitForTimeout(wait || 900);
    await page.screenshot({ path: DIR + 'n-' + name + '.png' });
    console.log(name + ' 撮影');
  };

  await shot('elec', '>', 'conveyor');
  await shot('ice',  '~', 'water');
  await shot('cut',  'o', 'blink');
  await shot('guts', 'c', 'crumble');

  // 敵を並べて撮る（1画面に集めて見比べる）
  await page.evaluate(() => G.scene.go('stage', { key: 'fire' }, { fade: 4 }));
  await waitStage('fire'); await waitPhase('play', 15000);
  await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player, T = 16;
    // スタート地帯の平地に敵を並べる
    p.x = 3 * T; p.y = 15 * T - p.h; p.vx = p.vy = 0; p.invul = 999999;
    s.camX = 0; s.camY = 96;
    s.enemies.length = 0;
    const list = ['joe', 'tank', 'split', 'crawl', 'riser', 'bat', 'vent'];
    list.forEach((t, i) => {
      const e = G.enemies.create(t, 0, 0, {});
      e.x = 70 + i * 44; e.y = 15 * T - e.h;
      if (t === 'bat') { e.y = 15 * T - 90; e.mode = 'fly'; }
      if (t === 'riser') { e.mode = 'jump'; e.vy = -3; e.homeY = e.y; }
      e.spawner = { armed: false };
      s.enemies.push(e);
    });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: DIR + 'n-enemies.png' });
  console.log('新しい敵 撮影');
};
