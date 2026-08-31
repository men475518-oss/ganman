/* 中ボスとラスボス最終形態の見た目を撮る */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);

  // --- 中ボス ---
  await page.evaluate(() => {
    G.game.cleared = { cut:1, elec:1, ice:1, fire:1, bomb:1, guts:1 };
    G.game.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.scene.go('stage', { key: 'final' }, { fade: 4 });
  });
  await waitStage('final'); await waitPhase('play', 15000);
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.x = s.data.midBoss.triggerX - 50;
    s.player.y = s.data.midBoss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('midboss', 9000);
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: DIR + 'h-hornet.png' });
  console.log('中ボス撮影');

  // --- ラスボス最終形態 ---
  await page.evaluate(() => {
    G.game.cleared = { cut:1, elec:1, ice:1, fire:1, bomb:1, guts:1 };
    G.game.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.scene.go('stage', { key: 'final' }, { fade: 4 });
  });
  await waitStage('final'); await waitPhase('play', 15000);
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.midBossDone = true;
    s.player.x = s.data.boss.triggerX - 30;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 9000);
  await page.keyboard.up('ArrowRight');
  await waitPhase('boss', 20000);
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });

  // 形態3の残りHPまで削って、最終形態への変化を本物の演出で見る
  await page.evaluate(() => {
    const s = G.scenes.stage.state, b = s.boss;
    const P = G.bosses.PHASES;
    b.phase = 2;
    b.weakness = P[2].weakness; b.col = P[2].col; b.name = P[2].name;
    b.hp = 29; b.invul = 0;
    b.damage(1, b.weakness, s, { level: 0 });   // これで形態4へ移行する
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: DIR + 'h-shadow-appear.png' });
  await page.waitForFunction(() => G.scenes.stage.state.boss.transition === 0, { timeout: 12000 });
  await page.evaluate(() => {
    const b = G.scenes.stage.state.boss;
    b.active = true; b.setAct('sBuster', 0); b.actT = 0;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: DIR + 'h-shadow.png' });
  const info = await page.evaluate(() => {
    const b = G.scenes.stage.state.boss;
    return { name: b.name, phase: b.phase, hp: b.hp, shadow: b.isShadow(), act: b.act };
  });
  console.log('ラスボス最終形態:', JSON.stringify(info));
};
