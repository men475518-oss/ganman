/* 新ギミックがゲーム内で実際に機能するかを動かして確かめる */
module.exports = async ({ page, waitScene, waitPhase, waitStage }) => {
  await waitScene('title'); await page.waitForTimeout(1900);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1500);
  await page.evaluate(() => G.scene.go('stage', { key: 'ice' }, { fade: 4 }));
  await waitStage('ice'); await waitPhase('play', 15000);
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });

  // 指定タイルの上に立たせる小道具
  const standOn = (ch, dy) => page.evaluate(([c, d]) => {
    const s = G.scenes.stage.state, g = s.level.grid, T = 16, p = s.player;
    for (let x = 14; x < s.level.w - 30; x++)
      for (let y = 3; y < s.level.h - 1; y++)
        if (g[y][x] === c) {
          p.x = x * T + 2; p.y = (y + (d || 0)) * T - p.h;
          p.vx = p.vy = 0; p.onGround = true; p.climbing = false;
          s.camX = p.x - 150; s.camY = p.y - 110;
          return { tx: x, ty: y };
        }
    return null;
  }, [ch, dy]);

  /* --- 明滅ブロック：時間で固体/非固体が切り替わるか --- */
  const blink = await page.evaluate(() => {
    const s = G.scenes.stage.state, g = s.level.grid;
    for (let x = 0; x < s.level.w; x++)
      for (let y = 0; y < s.level.h; y++)
        if (g[y][x] === 'o') {
          const a = G.tiles.solidAt(x, y);
          // 半周期ぶん時間を進める
          for (let i = 0; i < G.tiles.BLINK_CYCLE; i++) G.tiles.tick();
          const b = G.tiles.solidAt(x, y);
          return { found: true, before: a, after: b, flipped: a !== b };
        }
    return { found: false };
  });
  console.log(`明滅ブロック: ${blink.found ? (blink.flipped ? 'OK 固体/非固体が切り替わる' : 'NG 切り替わらない') : '見つからず'}`);

  /* --- 水中：重力が弱まり、高く跳べるか ---
     ボタンを押しっぱなしにしないと可変ジャンプの打ち切りが働くので、
     実際の操作と同じくキーを押したまま測る。                        */
  const wpos = await page.evaluate(() => {
    const s = G.scenes.stage.state, g = s.level.grid, T = 16, p = s.player;
    for (let x = 14; x < s.level.w - 30; x++)
      for (let y = 3; y < s.level.h - 1; y++)
        if (g[y][x] === '~' && g[y + 1][x] === '#') {   // 水底に立たせる
          p.x = x * T + 2; p.y = (y + 1) * T - p.h;
          p.vx = p.vy = 0; p.onGround = true; p.climbing = false;
          s.camX = p.x - 150; s.camY = p.y - 110;
          return { tx: x, ty: y };
        }
    return null;
  });
  if (wpos) {
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => {
      const p = G.scenes.stage.state.player;
      return { inWater: p.inWater, sink: +p.vy.toFixed(2) };
    });
    await page.keyboard.down('KeyX');
    const jumpH = await page.evaluate(() => new Promise(res => {
      const p = G.scenes.stage.state.player;
      const y0 = p.y; let best = 0, n = 0;
      const tick = () => {
        n++; best = Math.max(best, y0 - p.y);
        if (n > 150) return res(best);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.up('KeyX');
    console.log(`水中: 判定=${w.inWater} 沈下速度=${w.sink}(地上の落下上限は7) ` +
                `ジャンプ高さ=${jumpH.toFixed(0)}px (地上は48px)`);
  } else console.log('水中: 水底が見つからず');

  /* --- ベルトコンベア：乗ると流されるか --- */
  await page.evaluate(() => G.scene.go('stage', { key: 'elec' }, { fade: 4 }));
  await waitStage('elec'); await waitPhase('play', 15000);
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });
  const cpos = await standOn('>', -1) || await standOn('<', -1);
  if (cpos) {
    const x0 = await page.evaluate(() => Math.round(G.scenes.stage.state.player.x));
    await page.waitForTimeout(900);   // 何も押さずに待つ
    const r = await page.evaluate(() => ({
      x: Math.round(G.scenes.stage.state.player.x),
      belt: G.scenes.stage.state.player.belt }));
    console.log(`コンベア: 向き=${r.belt} 無操作で ${x0} -> ${r.x} (${r.x - x0 > 0 ? '+' : ''}${r.x - x0}px 流された)`);
  } else console.log('コンベア: 見つからず');

  /* --- 崩れる床：乗ると崩れ、しばらくして復活するか --- */
  await page.evaluate(() => G.scene.go('stage', { key: 'guts' }, { fade: 4 }));
  await waitStage('guts'); await waitPhase('play', 15000);
  await page.evaluate(() => { G.scenes.stage.state.player.invul = 999999; });
  const kpos = await standOn('c', -1);
  if (kpos) {
    const seq = await page.evaluate((t) => new Promise(res => {
      const s = G.scenes.stage.state;
      const out = { solid0: G.tiles.solidAt(t.tx, t.ty) };
      let n = 0;
      const tick = () => {
        n++;
        if (n === 60) out.solidAfterStand = G.tiles.solidAt(t.tx, t.ty);
        if (n === 220) { out.solidAfterWait = G.tiles.solidAt(t.tx, t.ty); return res(out); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), kpos);
    console.log(`崩れる床: 最初=${seq.solid0} 乗って1秒後=${seq.solidAfterStand} さらに待って=${seq.solidAfterWait}` +
                ` -> ${seq.solid0 && !seq.solidAfterStand && seq.solidAfterWait ? 'OK 崩れて復活する' : 'NG'}`);
  } else console.log('崩れる床: 見つからず');
};
