/* 中ボス：部屋に入る -> 巨大蜂が飛来 -> 撃破 -> 探索に戻る */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  // 中ボスが出るのは最終ステージだけ
  await page.evaluate(() => {
    G.game.cleared = { cut:1, elec:1, ice:1, fire:1, bomb:1, guts:1 };
    G.game.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.scene.go('stage', { key: 'final' }, { fade: 4 });
  });
  await waitStage('final'); await waitPhase('play', 15000);

  const mb = await page.evaluate(() => {
    const d = G.scenes.stage.state.data;
    return d.midBoss ? { trigger: d.midBoss.triggerX, x0: d.midBoss.arena.x0,
                         x1: d.midBoss.arena.x1, cp: d.checkpoint.x } : null;
  });
  if (!mb) { console.log('!! 中ボス部屋が生成されていない'); throw new Error('no midboss room'); }
  console.log(`中ボス部屋: x ${mb.x0}〜${mb.x1} (幅${mb.x1-mb.x0}px) / 中間ポイント x=${mb.cp}`);

  // 部屋の手前へ移動して歩いて入る
  await page.evaluate((t) => {
    const s = G.scenes.stage.state;
    s.player.x = t - 60;
    s.player.y = s.data.midBoss.arena.floorY - s.player.h;
    s.camX = s.player.x - 150;
  }, mb.trigger);
  await page.keyboard.down('ArrowRight');
  await waitPhase('midboss', 9000);
  await page.keyboard.up('ArrowRight');
  console.log('中ボス戦に入った');
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });

  await page.waitForTimeout(1400);
  await page.screenshot({ path: DIR + 'mb-intro.png' });
  const b = await page.evaluate(() => {
    const x = G.scenes.stage.state.midBoss;
    return { name: x.name, hp: x.hp, max: x.maxHp, state: x.state, w: x.w, h: x.h };
  });
  console.log(`  ${b.name} HP ${b.hp}/${b.max} (${b.w}x${b.h})`);

  // 各技を撃たせて例外が出ないか確認
  for (const a of ['dive', 'drones', 'needles']) {
    await page.evaluate((act) => {
      const x = G.scenes.stage.state.midBoss;
      x.active = true; x.state = 'fight'; x.setAct(act, 0); x.actT = 0;
    }, a);
    await page.waitForTimeout(a === 'needles' ? 750 : 1700);
    const r = await page.evaluate(() => {
      const s = G.scenes.stage.state;
      return { shots: s.shots.length, drones: s.enemies.filter(e => e.ttl !== undefined).length,
               act: s.midBoss.act, php: s.player.hp };
    });
    console.log(`  技 ${a.padEnd(8)} 弾${r.shots} 子機${r.drones} 現在=${r.act}`);
    await page.evaluate(() => { const p = G.scenes.stage.state.player; p.hp = p.maxHp; });
  }
  await page.screenshot({ path: DIR + 'mb-fight.png' });

  // 部屋の外に出られないことを確認
  const clamp = await page.evaluate(() => {
    const s = G.scenes.stage.state, ar = s.data.midBoss.arena;
    s.player.x = ar.x0 - 200;   // 強引に外へ出そうとする
    return { before: Math.round(s.player.x), x0: ar.x0 };
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => Math.round(G.scenes.stage.state.player.x));
  console.log(`  部屋の外へ: x=${clamp.before} に置いても ${after} に押し戻される (左端 ${clamp.x0})`);

  // 撃破
  await page.evaluate(() => {
    const s = G.scenes.stage.state, b = s.midBoss;
    b.invul = 0; b.hp = 1; b.damage(1, b.weakness, s, { level: 0 });
  });
  await waitPhase('play', 15000);
  const done = await page.evaluate(() => {
    const s = G.scenes.stage.state;
    return { done: s.midBossDone, boss: !!s.midBoss, lock: !!s.lockArena, items: s.items.length };
  });
  console.log(`撃破後: 探索に復帰 midBossDone=${done.done} カメラ固定解除=${!done.lock} ごほうび${done.items}個`);
  await page.screenshot({ path: DIR + 'mb-after.png' });
};
