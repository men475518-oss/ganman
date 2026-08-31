/* 主要な演出の瞬間をスクリーンショットで確認する */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'fire' }, { fade: 4 }));
  await waitStage('fire');

  // READY 表示中
  await page.waitForTimeout(700);
  await page.screenshot({ path: DIR+'s-ready.png' });
  console.log('READY 撮影 phase=' + await page.evaluate(() => G.scenes.stage.state.phase));

  // GO! の瞬間を狙う
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => {
      const s = G.scenes.stage.state;
      return { step: s.introStep, goT: s.goT || 0, phase: s.phase };
    });
    if (st.step === 2 && st.goT > 1 && st.goT < 16) break;
    await page.waitForTimeout(60);
  }
  await page.screenshot({ path: DIR+'s-go.png' });
  console.log('GO! 撮影');

  await waitPhase('play', 15000);

  // ボス戦：大技のズームアウトを撮る
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.midBossDone = true;   // 中ボスは済ませた扱いにして扉まで直行する
    s.player.x = s.data.boss.triggerX - 30;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 9000);
  await page.keyboard.up('ArrowRight');

  // ボス名表示の瞬間
  for (let i = 0; i < 100; i++) {
    const n = await page.evaluate(() => G.scenes.stage.state.bossNameT || 0);
    if (n > 30 && n < 80) break;
    await page.waitForTimeout(40);
  }
  await page.screenshot({ path: DIR+'s-bossname.png' });
  console.log('ボス名 撮影');

  await waitPhase('boss', 20000);
  await page.evaluate(() => { const s=G.scenes.stage.state; s.player.invul = 99999; });

  // 「rain」＝カメラを引く大技を発動させて撮る
  await page.evaluate(() => {
    const b = G.scenes.stage.state.boss;
    b.enraged = true; b.setAct('rain', 0); b.actT = 0;
  });
  await page.waitForTimeout(1100);
  const z = await page.evaluate(() => +G.scenes.stage.state.zoom.toFixed(3));
  await page.screenshot({ path: DIR+'s-bigattack.png' });
  console.log('大技(カメラ引き) 撮影 zoom=' + z);

  // 撃破 → クリア表示
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.boss.hp = 1; s.boss.invul = 0; s.boss.damage(1, s.boss.weakness, s);
  });
  await page.waitForTimeout(1900);
  await page.screenshot({ path: DIR+'s-explode.png' });
  await waitPhase('clear', 15000);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: DIR+'s-clear.png' });
  console.log('撃破/クリア 撮影');
};
