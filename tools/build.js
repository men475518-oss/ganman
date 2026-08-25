/* =========================================================================
   build.js  --  すべてのソースを1枚のHTMLにまとめる

     node tools/build.js
       -> dist/ganman.html （これ1つで動く。file:// でもOK）

   スマホへ転送したり、そのまま配布したりするのに使う。
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'ganman.html');

let html = fs.readFileSync(SRC, 'utf8');

// <script src="..."></script> を中身に置き換える
const re = /<script\s+src="([^"]+)"\s*><\/script>/g;
let count = 0, bytes = 0;
html = html.replace(re, (m, src) => {
  const file = path.join(ROOT, src);
  if (!fs.existsSync(file)) {
    throw new Error('ソースが見つかりません: ' + src);
  }
  let code = fs.readFileSync(file, 'utf8');
  count++;
  bytes += code.length;
  // </script> が文字列中にあると壊れるので保険
  code = code.replace(/<\/script>/g, '<\\/script>');
  return '<script>\n/* ===== ' + src + ' ===== */\n' + code + '\n</script>';
});

// 単体HTMLである旨をコメントで残す
html = html.replace('<head>',
  '<head>\n<!-- GANMAN : single-file build. tools/build.js が index.html から生成 -->');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`結合したスクリプト : ${count} 本 (${kb(bytes)})`);
console.log(`出力              : ${path.relative(ROOT, OUT)} (${kb(html.length)})`);
