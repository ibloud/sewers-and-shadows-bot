const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {Compiler}=require('../browser/vendor/ink-full.js');
function boot(){return new Compiler(fs.readFileSync('story/derry.ink','utf8')).Compile();}
function drain(s){let t='';while(s.canContinue)t+=s.Continue();return t;}
function choose(s,text){const c=s.currentChoices.find(c=>c.text.includes(text));assert.ok(c,text);s.ChooseChoiceIndex(c.index);return drain(s);}
function encounter(s){drain(s);choose(s,'Ask Violet');choose(s,'Inspect the sticker');choose(s,'Follow Violet');choose(s,'Inspect the hoodie');choose(s,'Inspect the candle');choose(s,'Use the candle');choose(s,'Begin the bounded');}
for(const outcome of ['won','lost','draw','bounded','left'])test('Ink return '+outcome,()=>{const s=boot();encounter(s);for(const v of ['sticker','candle','hoodie','route','encounter'])assert.equal(s.variablesState.$(v),true);s.variablesState.$('result',outcome);s.ChoosePathString('return_scene');assert.ok(drain(s));choose(s,'Decline');assert.equal(s.variablesState.$('ended'),true);choose(s,'Inspect the story');choose(s,'Inspect the candle again');choose(s,'Return to the ending');assert.equal(s.variablesState.$('result'),outcome);});
test('compiled story matches source',()=>{const s=boot();assert.equal(fs.readFileSync('browser/story.js','utf8'),'window.DERRY_STORY='+s.ToJson()+';\n');});
