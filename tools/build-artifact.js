/* =========================================================================
   build-artifact.js  --  Artifact 公開用のHTMLを作る

   Artifact は publish 時に <!doctype><head></head><body> で包まれるため、
   index.html をそのまま渡すと二重の文書構造になってしまう。
   ここでは <style> と <body> の中身とスクリプトだけを取り出して
   「本文だけのHTML」を組み立てる。
     node tools/build-artifact.js  ->  dist/ganman-artifact.html
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- <style> の中身 ---
const style = /<style>([\s\S]*?)<\/style>/.exec(html);
if (!style) throw new Error('<style> が見つかりません');

// --- <body> の中身（script タグは後で個別に処理する） ---
const body = /<body>([\s\S]*?)<\/body>/.exec(html);
if (!body) throw new Error('<body> が見つかりません');

let markup = body[1];
const scripts = [];
markup = markup.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
  scripts.push(src);
  return '';
});
// 残った空行とコメントを整理
markup = markup.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();

let code = '';
for (const src of scripts) {
  let js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  js = js.replace(/<\/script>/g, '<\\/script>');
  code += '\n/* ===== ' + src + ' ===== */\n' + js + '\n';
}

const out = `<title>GANMAN</title>
<style>
/* ==========================================================================
   Artifact 版のスタイル。
   これは「意図的に単一テーマ」のページ：8bit機のブラウン管画面そのものなので、
   閲覧者のライト/ダーク設定に関わらず黒地で描画する。
   ただし背景色は必ず明示し、ホスト側の地色を借りないようにしている。
   ========================================================================== */
${style[1].trim()}

/* Artifact のラッパー内でも全画面になるように念のため上書き */
html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; }
</style>

${markup}

<script>
${code}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const outPath = path.join(ROOT, 'dist', 'ganman-artifact.html');
fs.writeFileSync(outPath, out);
console.log(`スクリプト ${scripts.length} 本を結合`);
console.log(`出力: dist/ganman-artifact.html (${(out.length/1024).toFixed(1)} KB)`);
