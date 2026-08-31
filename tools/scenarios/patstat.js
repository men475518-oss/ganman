module.exports = async ({ page, waitScene }) => {
  await waitScene('title');
  const out = await page.evaluate(() => {
    const total = {};
    const per = {};
    ['cut','elec','ice','fire','bomb','guts','final'].forEach(k => {
      const d = G.stages.build(k);
      per[k] = d.patternLog.join(' ');
      d.patternLog.forEach(n => total[n] = (total[n]||0)+1);
    });
    return { total, per };
  });
  for (const [k, v] of Object.entries(out.per)) console.log(`${k.padEnd(6)} ${v}`);
  console.log('\n--- 採用回数（7ステージ合計）---');
  Object.entries(out.total).sort((a,b)=>b[1]-a[1])
    .forEach(([k,v]) => console.log(`  ${k.padEnd(13)} ${v}`));
};
