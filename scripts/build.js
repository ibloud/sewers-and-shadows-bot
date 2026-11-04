'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['bot/float-chess-engine.js', 'bot/src/pennywiseAI.js', 'browser/session.js', 'bot/float-cards-engine.js', 'bot/src/pennywiseCardsAI.js', 'browser/cards-session.js'];
function bundle() {
  const definitions = files.map(file => `${JSON.stringify(file)}: function(require,module,exports){\n${fs.readFileSync(path.join(root, file), 'utf8')}\n}`).join(',\n');
  return `'use strict';\n(() => {\nconst factories={${definitions}}, cache={};
function load(id){if(cache[id])return cache[id].exports; const module={exports:{}};cache[id]=module;
factories[id](p=>{const parts=id.split('/');parts.pop();for(const part of p.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}return load(parts.join('/'));},module,module.exports);return module.exports;}
window.FloatPreview=load('browser/session.js');window.FloatCardsPreview=load('browser/cards-session.js');\n})();\n`;
}
if (require.main === module) {
  const out = path.join(root, 'dist');
  fs.mkdirSync(out, { recursive: true });
  for (const name of ['index.html', 'app.js', 'style.css', 'chapter.js', 'story.js', 'symbol.png', 'cards.js', 'products.js', 'media.js']) fs.copyFileSync(path.join(root, 'browser', name), path.join(out, name));
  fs.mkdirSync(path.join(out,'vendor'),{recursive:true});
  fs.copyFileSync(path.join(root,'browser/vendor/ink-full.js'),path.join(out,'vendor/ink-full.js'));
  fs.writeFileSync(path.join(out, 'game.js'), bundle());
  console.log('Built dist/: local assets only, no dependencies or credentials.');
}
module.exports = { bundle };
