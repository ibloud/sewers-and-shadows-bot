'use strict';
(()=>{
 const $=id=>document.getElementById(id);let match=null,selected='',busy=false;
 function render(){
  $('card-choice').replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a card';$('card-choice').append(placeholder);
  for(const card of match.game.handFor('w')){const o=document.createElement('option');o.value=card;o.textContent=card.replace('♠',' of spades').replace('♥',' of hearts').replace('♦',' of diamonds').replace('♣',' of clubs');$('card-choice').append(o);}
  $('card-choice').value=selected;$('card-choice').disabled=busy||match.closed;$('card-confirm').disabled=busy||match.closed||!selected;$('card-leave').disabled=busy||match.closed;
  $('card-return').hidden=!match.closed;
  $('cards-status').textContent=`Violet: ${match.game.rp.w} RP. Pennywise: ${match.game.rp.b} RP. `+(match.closed?`Finished: ${match.game.status==='won-w'?'Violet wins':match.game.status==='won-b'?'Pennywise wins':'draw'}. Return to the story.`:`Round ${match.round}. Pennywise’s card is committed and hidden.`);
  $('card-log').replaceChildren();for(const r of match.log){const li=document.createElement('li');li.textContent=`Round ${r.round}: Violet ${r.a}; Pennywise ${r.b}. ${r.winner==='w'?'Violet wins the round':r.winner==='b'?'Pennywise wins the round':'Tie — no damage'}. RP after reveal: Violet ${r.rp.w}, Pennywise ${r.rp.b}.`;$('card-log').append(li);}
 }
 document.addEventListener('chapter-cards',()=>{match=new window.FloatCardsPreview.CardsMatch();selected='';busy=false;render();});
 $('card-choice').addEventListener('change',()=>{selected=match.game.handFor('w').includes($('card-choice').value)?$('card-choice').value:'';$('card-confirm').disabled=!selected||busy||match.closed;});
 $('card-confirm').addEventListener('click',()=>{
  if(busy||!selected||match.closed)return;const card=selected,round=match.round;busy=true;render();
  requestAnimationFrame(()=>{const result=match.play(card,round);selected='';busy=false;render();if(!result.ok)$('cards-status').textContent=result.reason;(match.closed?$('card-return'):$('card-choice')).focus();});
 });
 $('card-leave').addEventListener('click',()=>{if(busy||!match.leave())return;window.ChapterBridge.completeCards('left');});
 $('card-return').addEventListener('click',()=>{if(!match.closed)return;const status=match.game.status;window.ChapterBridge.completeCards(status==='won-w'?'won':status==='won-b'?'lost':'draw');});
})();
