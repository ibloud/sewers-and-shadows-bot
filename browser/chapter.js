'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let story=new inkjs.Story(window.DERRY_STORY), cachedText=[];
  const save=()=>{try{sessionStorage.setItem('derry-story',JSON.stringify({ink:story.state.ToJson(),text:cachedText}));}catch{}};
  // Restore story choices, never infer an engine result from saved presentation.
  try { const saved=sessionStorage.getItem('derry-story');if(saved){const snapshot=JSON.parse(saved);story.state.LoadJson(snapshot.ink);cachedText=snapshot.text||[];if(story.variablesState.$('cards_entered')&&!story.variablesState.$('cards_result')){story.variablesState.$('cards_result','left');story.ChoosePathString('cards_return');}else if(story.variablesState.$('encounter')&&!story.variablesState.$('result')){story.variablesState.$('result','left');story.ChoosePathString('return_scene');}}} catch {story=new inkjs.Story(window.DERRY_STORY);}
  function render(){
    $('story-text').replaceChildren();$('story-choices').replaceChildren();
    let launch=false, launchCards=false;const paragraphs=[];
    while(story.canContinue){const text=story.Continue().trim();if(text){const p=document.createElement('p');p.textContent=text;paragraphs.push(text);$('story-text').append(p);}if(story.currentTags.includes('encounter:chess'))launch=true;if(story.currentTags.includes('encounter:cards'))launchCards=true;}
    if(!paragraphs.length)for(const text of cachedText){const p=document.createElement('p');p.textContent=text;$('story-text').append(p);}
    else cachedText=paragraphs;
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
  $('chapter-replay').addEventListener('click',()=>{story=new inkjs.Story(window.DERRY_STORY);render();});
  render();
})();
