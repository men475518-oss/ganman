module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'cut' }, { fade: 4 }));
  await waitStage('cut'); await waitPhase('play', 15000);
  const before = await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.x = s.data.boss.triggerX - 40;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
    s.camX = s.player.x - 200;
    return { triggerX: s.data.boss.triggerX, doorX: s.data.boss.doorX,
             px: Math.round(s.player.x), py: Math.round(s.player.y) };
  });
  console.log('置いた直後:', JSON.stringify(before));
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const s = G.scenes.stage.state, p = s.player, T = 16;
      const tx = Math.floor(p.x / T), ty = Math.floor((p.y + p.h) / T);
      const around = [];
      for (let dy = -1; dy <= 1; dy++) {
        let row = '';
        for (let dx = -2; dx <= 3; dx++) row += s.level.grid[ty + dy] ? s.level.grid[ty + dy][tx + dx] : '?';
        around.push(row);
      }
      return { phase: s.phase, px: Math.round(p.x), cx: Math.round(p.cx()),
               vx: +p.vx.toFixed(2), onGround: p.onGround, state: p.state,
               hp: p.hp, belt: p.belt, water: p.inWater, around: around.join('|'),
               trig: s.data.boss.triggerX };
    });
    console.log(`  ${i}: ${JSON.stringify(st)}`);
    if (st.phase !== 'play') break;
  }
  await page.keyboard.up('ArrowRight');
};
