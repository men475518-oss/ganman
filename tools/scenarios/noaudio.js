/* AudioContext が無い環境でも無音で正常動作するか */
module.exports = async ({ page, report, waitScene, waitPhase }) => {
  await waitScene('title');
  const st = await page.evaluate(() => ({
    audioOk: G.audio.ok,
    ctx: !!G.audio.ctx,
    hasAC: !!(window.AudioContext || window.webkitAudioContext)
  }));
  console.log('audio state:', JSON.stringify(st));
  if (st.hasAC) { console.log('!! AudioContext が消えていない（テスト無効）'); return; }

  // 通常どおり最後まで進めるか
  await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);
  await page.evaluate(() => G.scene.go('stage', { key: 'fire' }, { fade: 4 }));
  await waitScene('stage'); await waitPhase('play', 15000);
  console.log('無音でステージ開始 OK');

  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyZ'); await page.waitForTimeout(200); }
  await page.keyboard.up('ArrowRight');

  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.midBossDone = true;   // 中ボスは済ませた扱いにして扉まで直行する
    s.player.x = s.data.boss.triggerX - 30;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 9000);
  await page.keyboard.up('ArrowRight');
  await waitPhase('boss', 20000);
  console.log('無音でボス戦開始 OK');
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.boss.hp = 1; s.boss.invul = 0; s.player.invul = 9999;
    s.boss.damage(1, s.boss.weakness, s);
  });
  await waitScene('weaponget', 25000);
  await waitScene('select', 30000);
  console.log('無音で武器ゲットまで完走 OK');
};
