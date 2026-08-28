/* 難易度カーブの検証：ステージを3分割し、区間ごとの敵の顔ぶれと数を見る */
module.exports = async ({ page, waitScene }) => {
  await waitScene('title');
  const out = await page.evaluate(() => {
    const TIER = { met:0, fly:0, turret:0, hop:0, spike:0,
                   crawl:1, bat:1, split:1, riser:1, joe:2, tank:2 };
    const res = {};
    ['cut','elec','ice','fire','bomb','guts'].forEach(k => {
      const d = G.stages.build(k);
      // ボス前の休憩通路は意図的に敵を置かない区間なので、
      // カーブの計測からは外し、「敵が配置される区間」を3等分して見る
      let last = 0;
      d.spawns.forEach(sp => { if (TIER[sp.type] !== undefined) last = Math.max(last, sp.x); });
      const span = Math.max(1, last);
      const seg = [[],[],[]];
      d.spawns.forEach(sp => {
        if (TIER[sp.type] === undefined) return;      // 設置物は除く
        const p = sp.x / span;
        seg[p < 0.34 ? 0 : (p < 0.67 ? 1 : 2)].push(sp.type);
      });
      res[k] = seg.map(list => {
        const byTier = [0,0,0];
        const kinds = {};
        list.forEach(t => { byTier[TIER[t]]++; kinds[t] = (kinds[t]||0)+1; });
        return { n: list.length, byTier, kinds };
      });
    });
    return res;
  });

  const label = ['序盤', '中盤', '終盤'];
  const totalTier = [[0,0,0],[0,0,0],[0,0,0]];
  const totalN = [0,0,0];
  for (const [k, segs] of Object.entries(out)) {
    console.log(`\n[${k}]`);
    segs.forEach((sg, i) => {
      totalN[i] += sg.n;
      sg.byTier.forEach((v, t) => totalTier[i][t] += v);
      const kinds = Object.entries(sg.kinds).map(([a,b]) => `${a}:${b}`).join(' ') || '-';
      console.log(`  ${label[i]} 敵${String(sg.n).padStart(2)}体 ` +
                  `[段階0:${sg.byTier[0]} 段階1:${sg.byTier[1]} 段階2:${sg.byTier[2]}]  ${kinds}`);
    });
  }
  console.log('\n=== 6ステージ合計 ===');
  let ok = true;
  label.forEach((L, i) => {
    const t = totalTier[i], sum = t[0] + t[1] + t[2] || 1;
    console.log(`${L}: 敵${String(totalN[i]).padStart(3)}体  ` +
      `段階0 ${(t[0]/sum*100).toFixed(0)}% / 段階1 ${(t[1]/sum*100).toFixed(0)}% / 段階2 ${(t[2]/sum*100).toFixed(0)}%`);
  });
  // 期待：序盤は段階0のみ、敵数は右肩上がり
  if (totalTier[0][1] + totalTier[0][2] > 0) { console.log('!! 序盤に上位段階の敵が出ている'); ok = false; }
  if (!(totalN[0] < totalN[1] && totalN[1] <= totalN[2])) {
    console.log('!! 敵の数が右肩上がりになっていない'); ok = false;
  }
  console.log(ok ? '\n難易度カーブ OK（序盤は基本の敵のみ／数は後半ほど多い）' : '\n難易度カーブに問題あり');
  if (!ok) throw new Error('difficulty curve check failed');
};
