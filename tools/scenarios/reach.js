/* =========================================================================
   地形の踏破可能性チェック（手続き生成の安全網）

   「立てるタイル」をノードとしたグラフを作り、スタートからボス扉まで
   到達できるかを幅優先探索で確かめる。
   移動能力は実際のジャンプ性能に合わせて控えめに見積もる：
     上へ3タイルまで／横4タイルまで／落下は任意
   ここで到達不能が出たら、そのステージは詰む可能性がある。
   ========================================================================= */
module.exports = async ({ page, waitScene }) => {
  await waitScene('title');
  const results = await page.evaluate(() => {
    const SOLID = c => c === '#' || c === 'I' || c === 'B' || c === 'D';
    const BLOCK = c => SOLID(c);                 // 頭がぶつかるもの
    const STAND = c => SOLID(c) || c === '=';    // 足を乗せられるもの
    const out = [];

    ['cut','elec','ice','fire','bomb','guts'].forEach(key => {
      const d = G.stages.build(key);
      const W = d.w, H = d.h;
      const g = d.rows.map(r => r.split(''));
      const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? '#' : g[y][x];

      // --- 立てる場所を列挙（足場の上に2タイル分の空間がある所） ---
      const isSurface = (x, y) =>
        STAND(at(x, y)) && !BLOCK(at(x, y - 1)) && !BLOCK(at(x, y - 2));
      // --- はしごの中も移動できる ---
      const isLadder = (x, y) => at(x, y) === 'L';

      const key2 = (x, y) => y * W + x;
      const nodes = new Set();
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++) {
          if (isSurface(x, y)) nodes.add(key2(x, y));
          if (isLadder(x, y)) nodes.add(key2(x, y));
        }

      // --- スタート地点 ---
      const sx = Math.floor(d.playerStart.x / 16);
      const sy = Math.floor(d.playerStart.y / 16);
      let start = null;
      for (let dy = 0; dy < 4 && !start; dy++)
        for (const cx of [sx, sx + 1, sx - 1])
          if (nodes.has(key2(cx, sy + dy))) { start = key2(cx, sy + dy); break; }

      // --- 幅優先探索 ---
      const seen = new Set([start]);
      const q = [start];
      let maxX = sx;
      while (q.length) {
        const cur = q.shift();
        const cx = cur % W, cy = (cur / W) | 0;
        if (cx > maxX) maxX = cx;
        const push = (nx, ny) => {
          const k = key2(nx, ny);
          if (!nodes.has(k) || seen.has(k)) return;
          seen.add(k); q.push(k);
        };
        // はしごは上下に自由
        if (isLadder(cx, cy)) { push(cx, cy - 1); push(cx, cy + 1); push(cx - 1, cy); push(cx + 1, cy); }
        // はしごに乗り移る
        for (const dx of [-1, 0, 1]) for (let dy = -2; dy <= 2; dy++)
          if (isLadder(cx + dx, cy + dy)) push(cx + dx, cy + dy);
        // ジャンプ・落下（上は3タイル・横は4タイルまで／落下は任意）
        for (let dx = -4; dx <= 4; dx++) {
          for (let dy = -3; dy <= 14; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (dy < 0 && Math.abs(dx) > 3) continue;      // 高く跳ぶほど横には行けない
            push(cx + dx, cy + dy);
          }
        }
      }

      // --- ボス扉の手前まで行けるか ---
      const doorTx = Math.floor(d.boss.doorX / 16);
      let reachedDoor = false;
      for (let y = 0; y < H; y++)
        for (let x = doorTx - 3; x < doorTx; x++)
          if (seen.has(key2(x, y))) reachedDoor = true;

      out.push({ key, reachedDoor, maxX, doorTx, nodes: nodes.size, reached: seen.size });
    });
    return out;
  });

  let bad = 0;
  results.forEach(r => {
    const ok = r.reachedDoor;
    if (!ok) bad++;
    console.log(`${r.key.padEnd(5)} 扉まで到達=${ok ? 'OK ' : '到達不能!!'} ` +
      `最遠到達x=${r.maxX}/${r.doorTx} 立てる場所${r.nodes}箇所中${r.reached}箇所に到達`);
  });
  if (bad) throw new Error(bad + ' 個のステージが踏破不能です');
  console.log('全6ステージ 踏破可能');
};
