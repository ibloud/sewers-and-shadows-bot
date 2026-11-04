'use strict';
const {FloatCardsGame}=require('../bot/float-cards-engine.js');
const {chooseMove}=require('../bot/src/pennywiseCardsAI.js');
class CardsMatch {
 constructor(){this.game=new FloatCardsGame();this.round=1;this.log=[];this.closed=false;this.commit();}
 commit(){if(this.game.status==='active'){const card=chooseMove(this.game,'b');const result=this.game.submitMove('b',card);if(!result.accepted)throw Error('Opponent has no legal card');}}
 play(card,round){
  if(this.closed||this.game.status!=='active'||round!==this.round)return {ok:false,reason:'This round is already closed.'};
  if(!this.game.handFor('w').includes(card))return {ok:false,reason:'Choose a card from Violet’s current hand.'};
  const result=this.game.submitMove('w',card);if(!result.accepted)return {ok:false,reason:result.reason};
  this.log.push({round:this.round,...this.game.slab,winner:this.game.lastEvents[0].winner,rp:{...this.game.rp}});this.round++;
  this.closed=this.game.status!=='active';if(!this.closed)this.commit();
  return {ok:true,status:this.game.status};
 }
 leave(){if(this.closed)return false;this.closed=true;return true;}
}
module.exports={CardsMatch};
