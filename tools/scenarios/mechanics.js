/* 氷の床の滑り／壊せるブロック／アイススラッシャーの凍結／一方通行足場 */
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);

  /* --- 氷の床：入力を離しても滑り続けるか --- */
  await page.evaluate(() => G.scene.go('stage', { key: 'ice' }, { fade: 4 }));
  await waitStage('ice'); await waitPhase('play', 15000);
  const iceRes = await page.evaluate(async () => {
    const s = G.scenes.stage.state, T = 16;
    // 足元を氷にした平地を用意する
    const p = s.player;
    const ty = Math.floor((p.y + p.h) / T);
    const tx = Math.floor(p.x / T);
    for (let i = -2; i < 20; i++) s.level.grid[ty][tx + i] = 'I';
    p.vx = 0;
    return { ty, tx, onIceBefore: p.onIce };
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  const during = await page.evaluate(() => ({ vx: +G.scenes.stage.state.player.vx.toFixed(2),
                                              onIce: G.scenes.stage.state.player.onIce }));
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(120);
  const t1 = await page.evaluate(() => +G.scenes.stage.state.player.vx.toFixed(2));
  await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => +G.scenes.stage.state.player.vx.toFixed(2));
  console.log(`氷: onIce=${during.onIce} 走行中vx=${during.vx} / 離した直後=${t1} / 0.6秒後=${t2} (滑って減速)`);

  /* --- アイススラッシャーで敵が凍るか --- */
  const frozen = await page.evaluate(() => {
    const s = G.scenes.stage.state, p = s.player;
    const e = G.enemies.create('hop', p.x + 60, p.y);
    e.x = p.x + 60; e.y = p.y; s.enemies.push(e);
    const shot = new G.weapons.Ice(e.x + e.w/2, e.y + e.h/2, 1);
    s.shots.push(shot);
    // 手動で当てる
    if (G.util.overlap(shot.hitbox(), e.hitbox())) { e.freezeMe(shot.freeze); e.damage(shot.dmg,'ice',s); }
    return { frozen: e.frozen, hp: e.hp };
  });
  console.log(`凍結: frozen=${frozen.frozen}F hp=${frozen.hp}`);

  /* --- スーパーアームで壊せるブロックを破壊 --- */
  await page.evaluate(() => G.scene.go('stage', { key: 'guts' }, { fade: 4 }));
  await waitStage('guts'); await waitPhase('play', 15000);
  const brk = await page.evaluate(() => {
    const s = G.scenes.stage.state, g = s.level.grid, T = 16;
    let found = null;
    for (let x = 0; x < s.level.w && !found; x++)
      for (let y = 0; y < s.level.h; y++)
        if (g[y][x] === 'B') { found = { x, y }; break; }
    if (!found) return { found: false };
    // ブロックの一番下の行を探して、その床に立たせる
    let bottom = found.y;
    while (g[bottom + 1] && g[bottom + 1][found.x] === 'B') bottom++;
    const groundRow = bottom + 1;
    const p = s.player;
    p.x = (found.x - 3) * T; p.y = groundRow * T - p.h; p.vx = p.vy = 0; p.face = 1;
    p.weapons = ['buster','arm']; p.weaponIndex = 1; p.ammo.arm = 28;
    const before = g[found.y][found.x];
    G.weapons.fire(p, s, 'arm', 0);
    return { found: true, tile: found, before, rocks: s.shots.filter(x => x instanceof G.weapons.Rock).length };
  });
  if (brk.found) {
    await page.waitForTimeout(900);
    const after = await page.evaluate((t) => G.scenes.stage.state.level.grid[t.y][t.x], brk.tile);
    console.log(`スーパーアーム: 岩${brk.rocks}個発射 / ブロック '${brk.before}' -> '${after}'`);
  } else console.log('スーパーアーム: 壊せるブロックが見つからず');

  /* --- 一方通行足場：当たり判定そのものを直接検証する --- */
  const ow = await page.evaluate(() => {
    const s = G.scenes.stage.state, g = s.level.grid, T = 16;
    // 上下が空いている '=' タイルを探す
    let f = null;
    for (let x = 20; x < s.level.w - 2 && !f; x++)
      for (let y = 5; y < s.level.h - 4; y++)
        if (g[y][x] === '=' && g[y-1][x] === '.' && g[y+1][x] === '.') { f = { x, y }; break; }
    if (!f) return { found: false };
    const top = f.y * T;
    const box = { x: f.x * T + 2, y: 0, w: 12, h: 22, vx: 0, vy: 0 };

    // ① 下から上へ通り抜けられるか（足元が板より下 → 上へ移動）
    box.y = top + 10; box.vy = -5;
    const up = G.tiles.moveY(box, -5);

    // ② 上から落ちてきたら乗れるか
    box.y = top - 22 - 4; box.vy = 5;
    const down = G.tiles.moveY(box, 5);
    const feet = box.y + box.h;
    return { found: true, tile: f, top,
             passedUp: up === 0, landed: down === 1, feet,
             landedExactly: Math.abs(feet - top) < 2 };
  });
  if (ow.found) {
    console.log(`一方通行足場: 下から通過=${ow.passedUp ? 'OK' : 'NG'} / 上から着地=${ow.landed && ow.landedExactly ? 'OK' : 'NG'} (足元${ow.feet} 板${ow.top})`);
  } else console.log('一方通行足場: 判定できる足場が見つからず');

  /* --- 壊せるブロックの生成状況を確認 --- */
  const bcheck = await page.evaluate(() => {
    const out = {};
    ['guts','cut','ice'].forEach(k => {
      const d = G.stages.build(k);
      let n = 0;
      d.rows.forEach(r => { for (const c of r) if (c === 'B') n++; });
      out[k] = { breakable: !!d.theme.breakable, Bタイル: n };
    });
    return out;
  });
  console.log('壊せるブロック:', JSON.stringify(bcheck));
};
