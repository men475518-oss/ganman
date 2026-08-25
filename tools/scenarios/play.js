const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);

  for (const [key, x] of [['ice', 700], ['guts', 1200], ['bomb', 1700]]) {
    await page.evaluate((k) => G.scene.go('stage', { key: k }, { fade: 4 }), key);
    await waitScene('stage'); await waitPhase('play', 15000);
    // 指定 x 付近で「立てる床」を探して、その上に置く（岩の中に埋めないため）
    await page.evaluate((xx) => {
      const s = G.scenes.stage.state, g = s.level.grid, T = 16;
      const tx = Math.round(xx / T);
      for (let dx = 0; dx < 30; dx++) {
        for (const sx of [tx + dx, tx - dx]) {
          if (sx < 2 || sx >= s.level.w - 2) continue;
          for (let ty = 3; ty < s.level.h - 1; ty++) {
            const here = g[ty][sx], above = g[ty-1][sx], above2 = g[ty-2][sx];
            if (here === '#' && above === '.' && above2 === '.') {
              s.player.x = sx * T + 2;
              s.player.y = ty * T - s.player.h;
              s.player.vx = s.player.vy = 0;
              s.camX = s.player.x - 150; s.camY = s.player.y - 120;
              return;
            }
          }
        }
      }
    }, x);
    // 敵が湧くまで動かす
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2200);
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    const s = await page.evaluate(() => {
      const st = G.scenes.stage.state;
      return { enemies: st.enemies.length, items: st.items.length,
               phase: st.phase,
               player: { x: Math.round(st.player.x), y: Math.round(st.player.y),
                         state: st.player.state, hp: st.player.hp, lives: st.player.lives },
               cam: { x: Math.round(st.camX), y: Math.round(st.camY) },
               screenX: Math.round(st.player.x - st.camX),
               screenY: Math.round(st.player.y - st.camY) };
    });
    console.log(key, JSON.stringify(s));
    await page.screenshot({ path: DIR + 'p-' + key + '.png' });
  }
};
