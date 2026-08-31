const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select');
  await page.evaluate(() => {
    G.game.cleared = { cut:1, elec:1, ice:1, fire:1, bomb:1, guts:1 };
    G.game.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.scene.go('stage', { key: 'final' }, { fade: 4 });
  });
  await waitStage('final'); await waitPhase('play', 15000);
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
  await page.waitForTimeout(1000);

  const dump = await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player, b = s.boss;
    return {
      player: { x: Math.round(p.x), y: Math.round(p.y), sx: Math.round(p.x - s.camX),
                sy: Math.round(p.y - s.camY), state: p.state, invul: p.invul },
      boss: { x: Math.round(b.x), y: Math.round(b.y), sx: Math.round(b.x - s.camX),
              w: b.w, h: b.h, act: b.act },
      enemies: s.enemies.map(e => ({ t: e.constructor.name, sx: Math.round(e.x - s.camX),
                                     sy: Math.round(e.y - s.camY), w: e.w, h: e.h })),
      hazards: s.hazards.length, shots: s.shots.length,
      cam: { x: Math.round(s.camX), y: Math.round(s.camY) }
    };
  });
  console.log(JSON.stringify(dump, null, 1));
  await page.screenshot({ path: DIR + 'dbg-final.png' });
};
