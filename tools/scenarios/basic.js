/* タイトル → セレクト → ステージ開始 → 歩く・撃つ・ジャンプ */
module.exports = async ({ page, report, waitScene, waitPhase }) => {
  await waitScene('title');
  await page.waitForTimeout(1800);          // 「PRESS START」が出るまで
  await page.keyboard.press('Enter');
  await waitScene('select');
  await report('at-select');

  await page.waitForTimeout(1400);          // パネル点灯演出
  await page.keyboard.press('Enter');
  await waitScene('stage');
  await report('at-stage');

  await waitPhase('play', 12000);
  await report('intro-done');

  // 右に歩いて撃つ／跳ぶ
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(220);
  }
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(400);
  await report('after-walk');
};
