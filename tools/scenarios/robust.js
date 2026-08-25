/* 音が使えない環境／タッチ操作／画面サイズ変更を検証 */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, report, waitScene, waitPhase }) => {
  /* --- 1) タッチ操作（実際に指でボタンを押す） --- */
  await waitScene('title'); await page.waitForTimeout(1800);
  // 画面中央をタップ＝スタート
  await page.touchscreen.tap(422, 195);
  await waitScene('select', 8000);
  console.log('タッチでタイトル突破 OK');
  await page.waitForTimeout(1500);

  // パネルをタップして選択→もう一度タップで決定
  const panel = await page.evaluate(() => {
    // ICE パネル(index 2)の画面座標を返す
    const gw = 62*3+6*2, gh = 46*3+6*2;
    const ox = (G.gfx.W-gw)/2, oy = (G.gfx.H-gh)/2+8;
    const r = { x: ox + 2*(62+6) + 31, y: oy + 0*(46+6) + 23 };
    return { x: r.x * G.gfx.scale + G.gfx.offX, y: r.y * G.gfx.scale + G.gfx.offY };
  });
  await page.touchscreen.tap(panel.x, panel.y);
  await page.waitForTimeout(400);
  const sel1 = await page.evaluate(() => G.scene.name);
  await page.touchscreen.tap(panel.x, panel.y);
  await waitScene('stage', 8000);
  console.log('パネル2回タップで決定 OK (1回目は選択のまま:', sel1 + ')');
  await waitPhase('play', 15000);

  /* --- 2) タッチでのチャージショット --- */
  const btn = await page.evaluate(() => {
    const L = G.input.layout();
    const conv = (c) => ({ x: c.x * G.gfx.scale + G.gfx.offX, y: c.y * G.gfx.scale + G.gfx.offY });
    return { shot: conv(L.shot), jump: conv(L.jump), wpn: conv(L.weapon) };
  });
  // SHOT を長押ししてチャージ段階を確認
  await page.touchscreen.touchStart ? null : null;
  await page.evaluate((b) => {
    // Playwright の touchscreen は tap のみなので、生の TouchEvent を投げる
    const cv = document.getElementById('screen');
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 7, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent(type, { touches: type==='touchend'?[]:[t],
        changedTouches: [t], bubbles: true, cancelable: true }));
    };
    window.__mk = mk;
    mk('touchstart', b.shot.x, b.shot.y);
  }, btn);
  await page.waitForTimeout(1400);            // 1.4秒＝84フレーム押しっぱなし
  const charged = await page.evaluate(() => {
    const p = G.scenes.stage.state.player;
    return { charge: p.charge, level: p.chargeLevel() };
  });
  await page.evaluate((b) => window.__mk('touchend', b.shot.x, b.shot.y), btn);
  await page.waitForTimeout(200);
  const fired = await page.evaluate(() => {
    const s = G.scenes.stage.state;
    const big = s.shots.filter(x => x instanceof G.weapons.Buster && x.level > 0);
    return { total: s.shots.length, charged: big.length, level: big[0] ? big[0].level : -1 };
  });
  console.log(`チャージ: ${charged.charge}F -> level ${charged.level} / 発射後 チャージ弾${fired.charged}発 (level ${fired.level})`);
  await page.screenshot({ path: DIR+'r-charge.png' });

  /* --- 3) 画面サイズ変更に追従するか --- */
  for (const [w,h] of [[667,375],[932,430],[1024,768],[390,844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const g = await page.evaluate(() => ({ W: G.gfx.W, H: G.gfx.H,
      scale: +G.gfx.scale.toFixed(2), portrait: document.body.classList.contains('portrait') }));
    console.log(`viewport ${w}x${h} -> 仮想 ${g.W}x${g.H} scale ${g.scale}${g.portrait?' (縦持ち案内)':''}`);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
};
