'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let story=new inkjs.Story(window.DERRY_STORY), cachedText=[], cachedItem='';
  const save=()=>{try{sessionStorage.setItem('derry-story',JSON.stringify({ink:story.state.ToJson(),text:cachedText,item:cachedItem}));}catch{}};
  // Restore story choices, never infer an engine result from saved presentation.
  try { const saved=sessionStorage.getItem('derry-story');if(saved){const snapshot=JSON.parse(saved);story.state.LoadJson(snapshot.ink);cachedText=snapshot.text||[];cachedItem=snapshot.item||'';if(story.variablesState.$('cards_entered')&&!story.variablesState.$('cards_result')){story.variablesState.$('cards_result','left');story.ChoosePathString('cards_return');}else if(story.variablesState.$('encounter')&&!story.variablesState.$('result')){story.variablesState.$('result','left');story.ChoosePathString('return_scene');}}} catch {story=new inkjs.Story(window.DERRY_STORY);}
  function showItem(key){
    const panel=$('item-preview'),product=window.STORY_PRODUCTS[key];panel.replaceChildren();panel.hidden=!product;if(!product)return;
    const title=document.createElement('h3');title.textContent=product.title;
    const image=document.createElement('img');image.src=product.image;image.alt=product.title+' — shop product photograph';image.loading='lazy';
    const fallback=document.createElement('p');fallback.textContent='Product image unavailable. You can still inspect the item and visit the shop.';fallback.hidden=true;
    image.addEventListener('error',()=>{image.hidden=true;fallback.hidden=false;});
    const link=document.createElement('a');link.href=product.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View in shop ↗';
    const note=document.createElement('p');note.textContent='Opens the shop in a new tab. Purchase is optional.';
    panel.append(title,image,fallback,link,note);
  }
  function render(){
    $('story-text').replaceChildren();$('story-choices').replaceChildren();
    let launch=false, launchCards=false;const paragraphs=[];let item='';
    while(story.canContinue){const text=story.Continue().trim();if(text){const p=document.createElement('p');p.textContent=text;paragraphs.push(text);$('story-text').append(p);}for(const tag of story.currentTags)if(tag.startsWith('item:'))item=tag.slice(5);if(story.currentTags.includes('encounter:chess'))launch=true;if(story.currentTags.includes('encounter:cards'))launchCards=true;}
    if(!paragraphs.length)for(const text of cachedText){const p=document.createElement('p');p.textContent=text;$('story-text').append(p);}
    else {cachedText=paragraphs;cachedItem=item;}
    showItem(cachedItem);
    story.currentChoices.forEach(choice=>{const b=document.createElement('button');b.textContent=choice.text;b.addEventListener('click',()=>{story.ChooseChoiceIndex(choice.index);render();});$('story-choices').append(b);});
    $('chapter-status').textContent=story.variablesState.$('ended')?'Chapter complete':'Chapter in progress';
    save();
    $('cards').hidden=!launchCards;
    if(launchCards){$('play').hidden=true;document.dispatchEvent(new Event('chapter-cards'));$('cards-title').focus();}
    else if(launch){$('play').hidden=false;document.dispatchEvent(new Event('chapter-chess'));$('play-title').focus();}
    else {$('play').hidden=true;$('story-heading').focus();}
  }
  window.ChapterBridge={
    completeCards(result){
      if(!story.variablesState.$('cards_entered')||story.variablesState.$('cards_result')||!['won','lost','draw','left'].includes(result))return false;
      story.variablesState.$('cards_result',result);story.ChoosePathString('cards_return');render();return true;
    },
    complete(result){
      if(!story.variablesState.$('encounter')||story.variablesState.$('result'))return false;
      if(!['won','lost','draw','bounded','left'].includes(result))return false;
      story.variablesState.$('result',result);story.ChoosePathString('return_scene');render();return true;
    }
  };
  const motion=$('symbol-motion'),mark=document.querySelector('.chapter-symbol'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function motionState(){motion.disabled=reduced.matches;$('symbol-motion-status').textContent=reduced.matches?'Symbol stays still because Reduce Motion is enabled.':'';}
  motion.addEventListener('click',()=>{const paused=motion.getAttribute('aria-pressed')!=='true';motion.setAttribute('aria-pressed',String(paused));motion.textContent=paused?'Resume symbol animation':'Pause symbol animation';mark.classList.toggle('motion-paused',paused);});reduced.addEventListener('change',motionState);motionState();
  $('chapter-replay').addEventListener('click',()=>{story=new inkjs.Story(window.DERRY_STORY);render();});
  render();
})();
