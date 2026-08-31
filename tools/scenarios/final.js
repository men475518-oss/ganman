/* 最終ステージ：セレクト中央 -> ステージ -> 3形態のラスボス -> エンディング */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage, report }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select');

  // 6体すべて撃破・全武器所持の状態にする
  await page.evaluate(() => {
    G.game.cleared = { cut:1, elec:1, ice:1, fire:1, bomb:1, guts:1 };
    G.game.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.weapons.WEAPONS.forEach(w => G.game.ammo[w.id] = 28);
    G.scene.go('select', null, { fade: 4 });
  });
  await waitScene('select'); await page.waitForTimeout(1600);
  await page.screenshot({ path: DIR + 'f2-select.png' });

  // 中央の FINAL を2回タップして決定
  const panel = await page.evaluate(() => {
    const gw = 62*3+6*2, gh = 46*3+6*2;
    const ox = (G.gfx.W-gw)/2, oy = (G.gfx.H-gh)/2+8;
    const r = { x: ox + 1*(62+6) + 31, y: oy + 1*(46+6) + 23 };
    return { x: r.x * G.gfx.scale + G.gfx.offX, y: r.y * G.gfx.scale + G.gfx.offY };
  });
  await page.touchscreen.tap(panel.x, panel.y);
  await page.waitForTimeout(350);
  await page.touchscreen.tap(panel.x, panel.y);
  await waitStage('final', 15000);
  console.log('中央パネルから最終ステージへ入れた');
  await waitPhase('play', 15000);

  const info = await page.evaluate(() => {
    const s = G.scenes.stage.state, d = s.data;
    const kinds = {}; d.spawns.forEach(sp => kinds[sp.type] = (kinds[sp.type]||0)+1);
    const tiles = {}; d.rows.forEach(r => { for (const c of r) if ('<>opc~IB'.includes(c)) tiles[c]=(tiles[c]||0)+1; });
    return { theme: d.theme.name, spawns: d.spawns.length, kinds, tiles };
  });
  console.log(`ステージ: 敵${info.spawns}体 [${Object.entries(info.kinds).map(([a,b])=>a+':'+b).join(' ')}]`);
  console.log(`          地形 [${Object.entries(info.tiles).map(([a,b])=>a+':'+b).join(' ')}]`);
  await page.screenshot({ path: DIR + 'f2-stage.png' });

  // ボス部屋へ
  await page.evaluate(() => {
    const s = G.scenes.stage.state;
    s.player.x = s.data.boss.triggerX - 30;
    s.player.y = s.data.boss.arena.floorY - s.player.h;
  });
  await page.keyboard.down('ArrowRight');
  await waitPhase('door', 9000);
  await page.keyboard.up('ArrowRight');
  await waitPhase('bossin', 12000);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: DIR + 'f2-bossname.png' });
  await waitPhase('boss', 20000);
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });

  const b0 = await page.evaluate(() => {
    const b = G.scenes.stage.state.boss;
    return { name: b.name, hp: b.hp, max: b.maxHp, phase: b.phase, weak: b.weakness };
  });
  console.log(`ラスボス: ${b0.name} HP ${b0.hp}/${b0.max} 形態${b0.phase+1} 弱点=${b0.weak}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: DIR + 'f2-boss1.png' });

  // 各形態を弱点武器で削って、形態変化を確認する
  for (let ph = 0; ph < 4; ph++) {
    // 形態変化の演出中は無敵なので、終わるまで待つ
    await page.waitForFunction(
      () => { const b = G.scenes.stage.state.boss; return !b || b.dead || b.transition === 0; },
      { timeout: 10000 });
    const r = await page.evaluate(() => {
      const s = G.scenes.stage.state, b = s.boss;
      const weak = b.weakness, startPhase = b.phase;
      let hits = 0;
      while (b.phase === startPhase && b.hp > 0 && b.transition === 0 && hits < 40) {
        b.invul = 0;
        b.damage(1, weak, s, { level: 0 });
        hits++;
      }
      return { hits, weak, hp: b.hp, phase: b.phase, newWeak: b.weakness, dead: b.hp <= 0 };
    });
    console.log(`  形態${ph+1}: 弱点=${r.weak} で ${r.hits}発 -> 残りHP${r.hp}` +
                (r.dead ? ' 撃破' : ` / 次は形態${r.phase+1} 弱点=${r.newWeak}`));
    if (r.dead) break;
  }
  await page.screenshot({ path: DIR + 'f2-boss3.png' });

  await waitPhase('dying', 15000);
  console.log('撃破演出へ');
  await waitScene('ending', 30000);
  console.log('エンディングへ到達');
};
