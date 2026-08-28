/* 新しいタイルギミックと敵が、各ステージに実際に出ているかを確認する */
module.exports = async ({ page, waitScene }) => {
  await waitScene('title');
  const out = await page.evaluate(() => {
    const TILE_NAMES = { '<':'コンベア左', '>':'コンベア右', 'o':'明滅A', 'p':'明滅B',
                         'c':'崩れる床', '~':'水', 'I':'氷', 'B':'壊せる', 'L':'はしご', '^':'トゲ' };
    const res = {};
    ['cut','elec','ice','fire','bomb','guts'].forEach(k => {
      const d = G.stages.build(k);
      const tiles = {};
      d.rows.forEach(r => { for (const c of r) if (TILE_NAMES[c]) tiles[TILE_NAMES[c]] = (tiles[TILE_NAMES[c]]||0)+1; });
      const enemies = {};
      d.spawns.forEach(sp => { enemies[sp.type] = (enemies[sp.type]||0)+1; });
      res[k] = { tiles, enemies, total: d.spawns.length };
    });
    return res;
  });
  const allTiles = new Set(), allEnemies = new Set();
  for (const [k, v] of Object.entries(out)) {
    Object.keys(v.tiles).forEach(t => allTiles.add(t));
    Object.keys(v.enemies).forEach(e => allEnemies.add(e));
    console.log(`${k.padEnd(5)} 敵${String(v.total).padStart(2)}体 [${Object.entries(v.enemies).map(([a,b])=>a+':'+b).join(' ')}]`);
    console.log(`      地形 [${Object.entries(v.tiles).map(([a,b])=>a+':'+b).join(' ')}]`);
  }
  console.log('\n出現した地形ギミック:', [...allTiles].join(', '));
  console.log('出現した敵の種類  :', [...allEnemies].join(', '), `(全${allEnemies.size}種)`);
  const want = ['met','fly','turret','hop','spike','plat','joe','bat','crawl','tank','split','riser','vent','crusher'];
  const missing = want.filter(w => !allEnemies.has(w));
  if (missing.length) console.log('!! どのステージにも出ていない敵:', missing.join(', '));
  const wantT = ['コンベア左','コンベア右','明滅A','明滅B','崩れる床','水'];
  const missT = wantT.filter(w => !allTiles.has(w));
  if (missT.length) console.log('!! どのステージにも出ていない地形:', missT.join(', '));
};
