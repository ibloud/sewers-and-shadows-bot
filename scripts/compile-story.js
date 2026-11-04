'use strict';
const fs=require('node:fs');
const {Compiler}=require('../browser/vendor/ink-full.js');
const story=new Compiler(fs.readFileSync('story/derry.ink','utf8')).Compile();
fs.writeFileSync('browser/story.js','window.DERRY_STORY='+story.ToJson()+';\n');
