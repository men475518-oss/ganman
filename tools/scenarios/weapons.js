/* 全武器の発射と、弱点ダメージ倍率(3倍)を検証する */
module.exports = async ({ page, waitScene, waitPhase }) => {
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);
  await page.evaluate(() => G.scene.go('stage', { key: 'cut' }, { fade: 4 }));
  await waitScene('stage'); await waitPhase('play', 15000);

  // 全武器を持たせる
  await page.evaluate(() => {
    const p = G.scenes.stage.state.player;
    p.weapons = G.weapons.WEAPONS.map(w => w.id);
    G.weapons.WEAPONS.forEach(w => p.ammo[w.id] = 28);
  });

  // 1) 各武器が実際に弾を出すか
  console.log('--- 発射テスト ---');
  for (let i = 0; i < 7; i++) {
    const r = await page.evaluate((idx) => {
      const s = G.scenes.stage.state, p = s.player;
      p.weaponIndex = idx;
      s.shots.length = 0;
      const before = s.shots.length;
      const ok = G.weapons.fire(p, s, p.weaponId(), 0);
      return { id: p.weaponId(), fired: ok, shots: s.shots.length - before,
               ammo: p.ammo[p.weaponId()] };
    }, i);
    console.log(`  ${r.id.padEnd(8)} fired=${r.fired} 弾数=${r.shots} 残エネルギー=${r.ammo}`);
  }

  // 2) 弱点の倍率チェック（全ボスに全属性を1発ずつ当てる）
  console.log('--- 弱点ダメージ表 (buster=1 を基準) ---');
  const table = await page.evaluate(() => {
    const out = {};
    G.bosses.LIST.forEach(entry => {
      const key = entry.key;
      const res = {};
      ['buster','thunder','fire','ice','bomb','cutter','arm'].forEach(el => {
        const b = G.bosses.create(key, 100, 100);
        b.arena = { x0: 0, x1: 400, floorY: 100 };
        b.active = true; b.state = 'fight'; b.invul = 0;
        const before = b.hp;
        b.damage(1, el, null);
        res[el] = before - b.hp;
      });
      out[key] = { weakness: G.bosses.BY_KEY[key].def.weakness, dmg: res };
    });
    return out;
  });
  for (const [k, v] of Object.entries(table)) {
    const d = v.dmg;
    console.log(`  ${k.padEnd(5)} 弱点=${v.weakness.padEnd(8)} ` +
      Object.entries(d).map(([e,n]) => `${e}:${n}`).join(' '));
  }

  // 3) 弱点の輪が閉じているか（どのボスから始めても攻略できるか）
  const chain = await page.evaluate(() => {
    const drops = {}, weak = {};
    G.bosses.LIST.forEach(e => { drops[e.key] = e.def.drop; weak[e.key] = e.def.weakness; });
    // 「その武器を落とすボス」を逆引き
    const dropper = {};
    for (const k in drops) dropper[drops[k]] = k;
    return G.bosses.LIST.map(e => `${e.key} <- ${weak[e.key]} (from ${dropper[weak[e.key]]})`);
  });
  console.log('--- 弱点の連鎖 ---');
  chain.forEach(c => console.log('  ' + c));
};
