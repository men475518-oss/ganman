/* ボス戦でプレイヤーが常に画面内・かつ仮想パッドに隠れないかを検証する */
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'cut' }, { fade: 4 }));
  await waitStage('cut'); await waitPhase('play', 15000);

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
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });

  const info = await page.evaluate(() => {
    const s = G.scenes.stage.state, ar = s.data.boss.arena;
    return { arenaW: ar.x1 - ar.x0, viewW: G.gfx.W, viewH: G.gfx.H };
  });
  console.log(`アリーナ幅 ${info.arenaW}px / 画面幅 ${info.viewW}px ` +
              `-> ${info.arenaW > info.viewW ? '画面に収まらない(' + (info.arenaW - info.viewW) + 'px はみ出す)' : '収まる'}`);

  // 画面サイズを変えながら、左端/中央/右端でプレイヤーとボスの見え方を調べる
  for (const [vw, vh] of [[844, 390], [667, 375], [1024, 768], [740, 360]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => ({ W: G.gfx.W, H: G.gfx.H }));
    console.log(`\n[ viewport ${vw}x${vh} -> 仮想 ${g.W}x${g.H} ]`);

    for (const [label, t] of [['左端', 0], ['中央', 0.5], ['右端', 1]]) {
      // プレイヤーを指定位置に、ボスを反対の端に置く（最も厳しい配置）
      await page.evaluate((tt) => {
        const s = G.scenes.stage.state, ar = s.data.boss.arena, p = s.player;
        p.x = ar.x0 + 4 + (ar.x1 - ar.x0 - p.w - 8) * tt;
        p.y = ar.floorY - p.h; p.vx = p.vy = 0;
        const b = s.boss;
        if (b) {
          b.x = ar.x0 + 4 + (ar.x1 - ar.x0 - b.w - 8) * (1 - tt);
          b.y = ar.floorY - b.h; b.vx = 0;
        }
      }, t);
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const s = G.scenes.stage.state, p = s.player, b = s.boss;
        const L = G.input.layout(), z = s.zoom;
        // ワールドは ctx.scale(zoom) 越しに描かれるので、全て画面座標に直して比べる
        const rect = (e) => ({ x: (e.x - s.camX) * z, y: (e.y - s.camY) * z,
                               w: e.w * z, h: e.h * z });
        const onScreen = (r) => r.x >= 0 && r.x + r.w <= G.gfx.W &&
                                r.y >= 0 && r.y + r.h <= G.gfx.H;
        const near = (r, c) => {
          const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
          const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
          return Math.hypot(c.x - cx, c.y - cy) < c.r;
        };
        const pr = rect(p), br = b ? rect(b) : null;
        const hid = [near(pr, L.stickBase) && 'スティック', near(pr, L.shot) && 'SHOT',
                     near(pr, L.jump) && 'JUMP'].filter(Boolean).join('/');
        return {
          pv: { sx: Math.round(pr.x), sy: Math.round(pr.y), on: onScreen(pr) },
          bv: br ? { sx: Math.round(br.x), sy: Math.round(br.y), on: onScreen(br) } : null,
          hid: hid, zoom: +z.toFixed(2)
        };
      });
      console.log(`  ${label}: 自機(${r.pv.sx},${r.pv.sy}) ${r.pv.on ? 'OK' : '画面外!!'}` +
        (r.bv ? ` / ボス(${r.bv.sx},${r.bv.sy}) ${r.bv.on ? 'OK' : '画面外→矢印表示'}` : '') +
        (r.hid ? ` / パッドに重なる:${r.hid}` : ''));
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);

  // 見た目の確認：自機を左端、ボスを右端に置いて矢印を撮る
  await page.evaluate(() => {
    const s = G.scenes.stage.state, ar = s.data.boss.arena, p = s.player, b = s.boss;
    p.x = ar.x0 + 4; p.y = ar.floorY - p.h; p.vx = p.vy = 0;
    if (b) { b.x = ar.x1 - b.w - 8; b.y = ar.floorY - b.h; b.vx = 0; }
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/cam-left-edge.png' });
  console.log('\n左端＋ボス画面外の見た目を撮影');
};
