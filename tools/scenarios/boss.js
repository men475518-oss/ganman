/* ボス部屋まで一気に移動し、登場演出→戦闘→撃破→武器ゲットまで通す */
module.exports = async ({ page, report, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select');
  await page.waitForTimeout(1400);
  await page.keyboard.press('Enter'); await waitScene('stage');
  await waitPhase('play', 12000);

  // ボス扉の手前へワープ
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.midBossDone = true;   // 中ボスは済ませた扱いにして扉まで直行する
    s.player.x = s.data.boss.triggerX - 40;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
    s.camX = s.player.x - 200;
  });
  await page.waitForTimeout(200);
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 8000);
  await page.keyboard.up('ArrowRight');
  await report('door');

  await waitPhase('bossin', 10000);
  await report('bossin');
  await page.screenshot({ path: '/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/shot-bossin.png' });

  await waitPhase('boss', 15000);
  await report('boss-start');

  // 実際に少し戦ってみる（棒立ちなので回復させながら）
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(150);
    await page.evaluate(() => { const p = G.scenes.stage.state.player; p.hp = p.maxHp; });
  }
  await report('mid-fight');
  await page.screenshot({ path: '/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/shot-boss.png' });

  // 強化モードを確認するため半分まで削る
  await page.evaluate(() => { const s=G.scenes.stage.state; s.boss.hp = 15; s.player.hp = s.player.maxHp; });
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(1500);
  const enr = await page.evaluate(() => ({ enraged: G.scenes.stage.state.boss.enraged, hp: G.scenes.stage.state.boss.hp }));
  console.log('enrage-check', JSON.stringify(enr));

  // とどめ（弾が外れて不安定にならないよう、直接ダメージを与える）
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.hp = s.player.maxHp;
    s.boss.hp = 1; s.boss.invul = 0;
    s.boss.damage(1, s.boss.weakness, s);
  });
  await waitPhase('dying', 12000);
  await report('dying');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/shot-defeat.png' });

  await waitPhase('clear', 12000);
  await report('clear');

  await waitScene('weaponget', 20000);
  await report('weaponget');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/shot-weaponget.png' });

  await waitScene('select', 20000);
  const g = await page.evaluate(() => ({ weapons: G.game.weapons, cleared: G.game.cleared }));
  console.log('progress', JSON.stringify(g));
};
