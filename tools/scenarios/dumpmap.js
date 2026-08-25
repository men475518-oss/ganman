module.exports = async ({ page }) => {
  const out = await page.evaluate(() => {
    const res = {};
    ['cut','elec','ice','fire','bomb','guts'].forEach(k => {
      const d = G.stages.build(k);
      const counts = {};
      d.rows.forEach(r => { for (const c of r) counts[c] = (counts[c]||0)+1; });
      res[k] = { counts, spawns: d.spawns.length, items: d.items.length };
    });
    // cut ステージの先頭120タイルを可視化
    const d = G.stages.build('cut');
    res.map = d.rows.map(r => r.slice(0, 120)).join('\n');
    return res;
  });
  console.log(JSON.stringify({counts: Object.fromEntries(Object.entries(out).filter(([k])=>k!=='map'))}, null, 1));
  console.log('\n--- MAP (cut, tiles 0-119) ---');
  console.log(out.map);
};
