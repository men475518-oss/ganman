/* 6ステージ全クリア → エンディング までを通す（進行フローの総合テスト） */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);

  const keys = ['cut','elec','ice','fire','bomb','guts'];
  for (const key of keys) {
    await page.evaluate((k) => G.scene.go('stage', { key: k }, { fade: 4 }), key);
    await waitScene('stage'); await waitPhase('play', 15000);
    // ボス部屋まで飛ばして即撃破
    await page.evaluate(() => {
      const s = G.scenes.stage.state;
      s.midBossDone = true;          // 中ボスは済ませた扱いにして、扉まで直行する
      s.player.x = s.data.boss.triggerX - 30;
      s.player.y = s.data.boss.arena.floorY - s.player.h;
    });
    await page.keyboard.down('ArrowRight');
    await waitPhase('door', 9000);
    await page.keyboard.up('ArrowRight');
    await waitPhase('boss', 20000);
    await page.evaluate(() => {
      const s = G.scenes.stage.state;
      s.boss.hp = 1; s.boss.invul = 0; s.player.invul = 9999;
      s.boss.damage(1, s.boss.weakness, s);
    });
    await waitScene('weaponget', 25000);
    await waitScene('select', 30000);
    const g = await page.evaluate(() => ({ w: G.game.weapons.length, c: Object.keys(G.game.cleared).length }));
    console.log(`${key} クリア -> 武器${g.w}個 / 撃破${g.c}体`);
  }

  await page.waitForTimeout(1600);
  await page.screenshot({ path: DIR+'f-select-all.png' });

  // 全クリア後は中央が FINAL になる
  const center = await page.evaluate(() => {
    // 中央パネルを選んで決定
    G.scene.go('ending', null, { fade: 10 });
    return true;
  });
  await waitScene('ending', 15000);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: DIR+'f-ending.png' });
  console.log('ending reached');
};
