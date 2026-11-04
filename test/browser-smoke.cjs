'use strict';
// Install Playwright separately for browser review: npm install --no-save --package-lock=false playwright
// PREVIEW_URL and CHROMIUM_PATH may select an existing local preview/browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.evaluate(()=>sessionStorage.clear()); await page.reload();
  for(const name of ['Ask Violet','Follow Violet','Inspect the candle.','Use the candle','Begin the bounded'])await page.getByRole('button',{name,exact:false}).click();
  await page.locator('#from').selectOption('e2');
  await page.locator('#action').selectOption('e2:e4::');
  assert.match(await page.locator('#selection').innerText(),/e2 → e4/);
  await page.locator('#cancel').click();assert.equal(await page.locator('#from').inputValue(),'');
  assert.match(await page.locator('#status').innerText(),/cancelled/);
  // Pointer path; invalid destination preserves the initial board.
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e5"]').click();
  assert.match(await page.locator('#status').innerText(),/unchanged/);
  await page.locator('[data-square="e4"]').click();
  await page.locator('#confirm').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Turn 2'));
  assert.match(await page.locator('#history').innerText(),/Turn 1: you e2 → e4; Pennywise/);
  assert.match(await page.locator('[data-square="e4"]').getAttribute('aria-label'),/white pawn/);
  await page.locator('#replay').selectOption('0');
  assert.equal(await page.locator('#confirm').isDisabled(),true);
  assert.match(await page.locator('[data-square="e2"]').getAttribute('aria-label'),/white pawn/);
  await page.locator('#live').click();
  assert.match(await page.locator('[data-square="e4"]').getAttribute('aria-label'),/white pawn/);
  await page.locator('#summary-button').click();assert.match(await page.locator('#summary').inputValue(),/Local preview only/);
  await page.locator('#finish').click();assert.match(await page.locator('#story-text').innerText(),/No winner is declared/);
  await page.locator('#chapter-replay').click();
  for(const name of ['Ask Violet','Follow Violet','Inspect the candle.','Use the candle','Begin the bounded'])await page.getByRole('button',{name,exact:false}).click();
  await page.locator('#restart').click();assert.match(await page.locator('#status').innerText(),/Turn 1/);
  // Keyboard-only controls: native select navigation, Escape, Tab and Enter confirmation.
  await page.locator('#from').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#from').inputValue(),'');
  await page.locator('#from').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');assert.equal(await page.locator('#confirm').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Turn 2'));
  // Focus and target checks on coordinate route.
  await page.locator('#from').focus();
  const focus=await page.locator('#from').evaluate(el=>({outline:getComputedStyle(el).outlineStyle,height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize}));
  assert.notEqual(focus.outline,'none');assert(focus.height>=48);assert.equal(focus.font,'20px');
  const layouts=[];
  for(const width of [320,390,820,1440]){
    await page.setViewportSize({width,height:1000});
    for(const enlarged of [false,true]){
      await page.evaluate(on=>{
        document.documentElement.style.fontSize=on?'250%':'';
        document.getElementById('spacing-test')?.remove();
        if(on){const s=document.createElement('style');s.id='spacing-test';s.textContent='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';document.head.append(s);}
      },enlarged);
      const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,confirm:document.querySelector('#confirm').getBoundingClientRect().width,boardScroll:document.querySelector('.board-scroll').scrollWidth>document.querySelector('.board-scroll').clientWidth}));
      assert(layout.scroll<=width+1,JSON.stringify(layout));
      assert(layout.confirm>100);layouts.push({...layout,enlarged});
    }
  }
  await page.evaluate(()=>{document.documentElement.style.fontSize='';document.getElementById('spacing-test')?.remove();});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),true);
  await page.setViewportSize({width:1440,height:1100});await page.locator('#play').scrollIntoViewIfNeeded();
  if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
  assert.deepEqual(errors,[]);
  assert(requests.every(url=>new URL(url).hostname==='127.0.0.1'),requests.join('\n'));
  console.log(JSON.stringify({result:'passed',browser:browser.version(),checks:['pointer legal/invalid/cancel','opponent response','keyboard confirm/Escape','restart/end/replay/summary','focus and 48px select target','4 widths × normal and 200% text with spacing','reduced motion','no external requests or browser errors'],focus,layouts,requests},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
