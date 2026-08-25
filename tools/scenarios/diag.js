module.exports = async ({ page, report, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select');
  await page.waitForTimeout(1400);
  await page.keyboard.press('Enter'); await waitScene('stage');
  await waitPhase('play', 12000);

  const info = await page.evaluate(() => {
    const s = G.scenes.stage.state;
    const d = s.data;
    // タイル種別の集計
    const counts = {};
    d.rows.forEach(r => { for (const c of r) counts[c] = (counts[c]||0)+1; });
    return {
      levelW: d.w, levelH: d.h,
      pxW: s.level.pxW, pxH: s.level.pxH,
      spawnCount: d.spawns.length,
      spawnSample: d.spawns.slice(0, 8),
      itemCount: d.items.length,
      checkpoint: d.checkpoint,
      boss: d.boss,
      playerStart: d.playerStart,
      tileCounts: counts,
      cam: { x: Math.round(s.camX), y: Math.round(s.camY) },
      viewW: G.gfx.W, viewH: G.gfx.H,
      spawnersArmed: s.spawners.filter(x=>x.armed).length,
      spawnersTotal: s.spawners.length
    };
  });
  console.log(JSON.stringify(info, null, 1));
};
