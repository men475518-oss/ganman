const DIR='/tmp/claude-0/-home-user-ganman/a60a3676-fc20-55ff-b7c4-55af35a45fd7/scratchpad/';
module.exports = async ({ page, waitScene }) => {
  await waitScene('title');
  await page.waitForTimeout(700);
  await page.screenshot({ path: DIR+'m-title-drop.png' });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: DIR+'m-title.png' });

  await page.keyboard.press('Enter');
  await waitScene('select');
  await page.waitForTimeout(900);
  await page.screenshot({ path: DIR+'m-select-lighting.png' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: DIR+'m-select.png' });

  // 何体か倒した状態にして再描画
  await page.evaluate(() => { G.game.cleared = {cut:true, elec:true}; G.game.weapons=['buster','cutter','thunder']; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR+'m-select-progress.png' });
};
