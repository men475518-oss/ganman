/* やられ→復活→ゲームオーバー→コンティニュー、はしご、ポーズを検証 */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, report, waitScene, waitPhase, getState }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);
  await page.evaluate(() => G.scene.go('stage', { key: 'elec' }, { fade: 4 }));
  await waitScene('stage'); await waitPhase('play', 15000);

  /* --- はしごテスト：はしごの位置へ運んで登らせる --- */
  const ladder = await page.evaluate(() => {
    const s = G.scenes.stage.state, g = s.level.grid;
    for (let x = 0; x < s.level.w; x++)
      for (let y = 0; y < s.level.h; y++)
        if (g[y][x] === 'L') return { tx: x, ty: y };
    return null;
  });
  console.log('ladder tile:', JSON.stringify(ladder));
  if (ladder) {
    await page.evaluate((L) => {
      const s = G.scenes.stage.state, p = s.player;
      // はしごの一番下に立たせる
      let ty = L.ty;
      while (s.level.grid[ty + 1] && s.level.grid[ty + 1][L.tx] === 'L') ty++;
      p.x = L.tx * 16 + 8 - p.w / 2;
      p.y = ty * 16 + 16 - p.h;
      p.vx = p.vy = 0;
      s.camX = p.x - 200;
    }, ladder);
    const y0 = await page.evaluate(() => Math.round(G.scenes.stage.state.player.y));
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1600);
    await page.keyboard.up('ArrowUp');
    const after = await page.evaluate(() => ({
      y: Math.round(G.scenes.stage.state.player.y),
      climbing: G.scenes.stage.state.player.climbing,
      state: G.scenes.stage.state.player.state
    }));
    console.log(`ladder climb: y ${y0} -> ${after.y} (登った距離 ${y0 - after.y}px) state=${after.state}`);
    await page.screenshot({ path: DIR+'d-ladder.png' });
  }

  /* --- ポーズメニュー --- */
  await page.evaluate(() => {
    const p = G.scenes.stage.state.player;
    p.weapons = ['buster','thunder','fire']; G.scenes.stage.state.tanks = 2;
  });
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(400);
  console.log('pause phase:', (await getState()).phase);
  await page.screenshot({ path: DIR+'d-pause.png' });
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyX');   // 決定＝武器切替
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => G.scenes.stage.state.player.weaponId());
  console.log('after pause select, weapon =', w, 'phase =', (await 0, (await page.evaluate(()=>G.scenes.stage.state.phase))));

  /* --- 死亡 → 復活 --- */
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.checkpoint = null;
    s.player.hp = 1; s.player.invul = 0;
    s.player.damage(10, s.player.cx() + 20);
  });
  await waitPhase('dead', 6000);
  await page.screenshot({ path: DIR+'d-death.png' });
  await waitPhase('intro', 12000);
  const rev = await page.evaluate(() => ({
    lives: G.scenes.stage.state.player.lives,
    hp: G.scenes.stage.state.player.hp,
    x: Math.round(G.scenes.stage.state.player.x)
  }));
  console.log('respawned:', JSON.stringify(rev));

  /* --- 残機を0にしてゲームオーバー --- */
  await waitPhase('play', 15000);
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.lives = 0;
    s.player.hp = 1; s.player.invul = 0;
    s.player.damage(10, s.player.cx() + 20);
  });
  await waitPhase('dead', 8000);
  await waitPhase('gameover', 12000);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: DIR+'d-gameover.png' });
  console.log('gameover reached');

  // CONTINUE = YES
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const cont = await page.evaluate(() => ({ scene: G.scene.name, lives: G.game.lives,
    phase: G.scenes.stage.state ? G.scenes.stage.state.phase : null }));
  console.log('after continue:', JSON.stringify(cont));
};
