/* 6体すべてのボスを順に起動し、登場→各攻撃を一通り実行させて例外を洗い出す */
const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene, waitPhase, getState }) => {
  const keys = ['cut','elec','ice','fire','bomb','guts'];
  await waitScene('title'); await page.waitForTimeout(1800);
  await page.keyboard.press('Enter'); await waitScene('select'); await page.waitForTimeout(1400);

  for (const key of keys) {
    // 直接ステージへ入る
    await page.evaluate((k) => G.scene.go('stage', { key: k }, { fade: 4 }), key);
    await waitScene('stage'); await waitPhase('play', 15000);
    await page.evaluate(() => {
      const s = G.scenes.stage.state;
      s.player.x = s.data.boss.triggerX - 30;
      s.player.y = s.data.boss.arena.floorY - s.player.h;
      s.camX = s.player.x - 200;
    });
    await page.keyboard.down('ArrowRight');
    await waitPhase('door', 9000);
    await page.keyboard.up('ArrowRight');
    await waitPhase('boss', 20000);

    // 各攻撃を強制的に実行させる（3種＋強化版）
    const attacks = await page.evaluate(() => {
      const b = G.scenes.stage.state.boss;
      // runAct の switch に出てくる攻撃名を拾う
      return b.def.id;
    });
    const ATT = {
      cut:['boomerang','dash','aerial'], elec:['volley','pillar','beam'],
      ice:['shards','slick','walls'], fire:['flame','radial','rain'],
      bomb:['lob','mines','rain'], guts:['throw','quake','barrage']
    };
    for (const enraged of [false, true]) {
      await page.evaluate((e) => { G.scenes.stage.state.boss.enraged = e; }, enraged);
      for (const a of ATT[key]) {
        await page.evaluate((a) => {
          const b = G.scenes.stage.state.boss;
          b.setAct(a, 0); b.actT = 0;
        }, a);
        await page.waitForTimeout(1700);
        const s = await page.evaluate(() => {
          const st = G.scenes.stage.state;
          return { hz: st.hazards.length, sh: st.shots.length, act: st.boss.act, php: st.player.hp };
        });
        console.log(`${key}${enraged?'+':' '} ${a.padEnd(10)} hz=${s.hz} shots=${s.sh} act=${s.act} playerHP=${s.php}`);
        // プレイヤーを全快させて次へ
        await page.evaluate(() => { const p=G.scenes.stage.state.player; p.hp=p.maxHp; p.invul=0; });
      }
    }
    await page.screenshot({ path: DIR+'boss-'+key+'.png' });
  }
};
