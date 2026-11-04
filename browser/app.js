'use strict';
(() => {
  const { Match, legalActions, narrate, BUILD, moveKey } = window.FloatPreview;
  const match = new Match();
  const $ = id => document.getElementById(id);
  const names = { K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn' };
  const abilities = {mirrorShift:'Mirror Shift',floatJump:'Float Jump',sewerSlide:'Sewer Slide',redBalloon:'Red Balloon',castleK:'Castle kingside',castleQ:'Castle queenside'};
  let source = '', selection = null, actions = [], replay = 'live', busy = false;
  const describe = m => `${m.from} → ${m.to}${m.special ? ' · '+abilities[m.special] : ''}${m.promotion ? ' · promote to '+names[m.promotion] : ''}`;
  const announce = text => { $('status').textContent = text; };
  function option(parent, value, label) { const o = document.createElement('option'); o.value=value; o.textContent=label; parent.append(o); }
  function fillChoices() {
    const all = legalActions(match.game);
    $('from').replaceChildren(); option($('from'), '', 'Choose a white piece');
    for (const square of [...new Set(all.map(m=>m.from))]) {
      const p = match.game.toJSON().squares[square]; option($('from'),square,`${square} · white ${names[p.type]}`);
    }
    $('from').value=source;
    actions = source ? all.filter(m=>m.from===source) : [];
    $('action').replaceChildren(); option($('action'), '', source ? 'Choose a destination' : 'Choose a piece first');
    actions.forEach(m => option($('action'), moveKey(m), describe(m)));
    $('action').value=selection ? moveKey(selection) : '';
    const locked = match.completed || replay !== 'live' || busy;
    $('from').disabled=locked; $('action').disabled=locked || !source;
    $('confirm').disabled=locked || !selection;
    $('restart').disabled=busy; $('replay').disabled=busy; $('live').disabled=busy;
    $('finish').disabled=match.completed || busy;
    $('cancel').disabled=locked;
    $('selection').textContent=selection ? `Ready: ${describe(selection)}. Confirm or cancel.` : source ? `${source} selected. Choose a destination and ability.` : 'No move selected.';
  }
  function drawBoard() {
    const snapshot = replay === 'live' ? match.game.toJSON() : match.snapshots[Number(replay)];
    $('board').replaceChildren();
    for (let rank=8;rank>=1;rank--) for (let c=0;c<8;c++) {
      const square='abcdefgh'[c]+rank, p=snapshot.squares[square];
      const b=document.createElement('button'); b.type='button'; b.dataset.square=square;
      const available = replay==='live' && actions.some(m=>m.to===square);
      b.className='square'+((rank+c)%2 ? ' light':'')+(square===source&&replay==='live'?' selected':'')+(available?' available':'');
      b.setAttribute('aria-label', `${square}, ${p ? (p.color==='w'?'white ':'black ')+names[p.type] : 'empty'}${available?', available destination':''}`);
      b.setAttribute('aria-pressed',String(square===source && replay==='live'));
      const coords=document.createElement('span');coords.className='coordinate';coords.textContent=square;
      const piece=document.createElement('span');piece.textContent=(p ? p.color.toUpperCase()+p.type : '—')+(available?' •':'');
      b.append(coords,piece);
      // Keep read-only snapshots inspectable by keyboard.
      b.addEventListener('click',()=>boardChoice(square)); $('board').append(b);
    }
  }
  function render() {
    fillChoices(); drawBoard();
    $('history').replaceChildren();
    if (!match.history.length) {const li=document.createElement('li');li.textContent='No turns yet. Choose a legal move to begin.';$('history').append(li);}
    match.history.forEach(h=>{const li=document.createElement('li');li.textContent=`Turn ${h.turn}: you ${describe(h.human)}; Harbour ${describe(h.opponent)}. ${narrate(h.events)} Status: ${h.status}.`;$('history').append(li);});
    $('replay').replaceChildren();option($('replay'),'live','Live position');
    match.snapshots.forEach((s,i)=>option($('replay'),String(i),i===0?'Starting position':`After turn ${i} · ${s.status}`));$('replay').value=replay;
    if (!$('summary-panel').hidden) $('summary').value=JSON.stringify(match.summary(),null,2);
  }
  function boardChoice(square) {
    if (replay!=='live'||match.completed||busy) {announce('This board is for inspection. Return to live play or restart.');return;}
    const moves=actions.filter(m=>m.to===square);
    if (moves.length) { selection=moves[0]; render();$('action').focus();announce(`Selected ${describe(selection)}.${moves.length>1?' Other abilities are available in the destination menu.':''} Confirm or cancel.`);return; }
    const p=match.game.toJSON().squares[square];
    if (p?.color==='w') {source=square;selection=null;render();$('action').focus();announce(`${square} selected. ${actions.length} legal actions. Choose a destination.`);}
    else {announce('No legal action selected. Choose a white piece or a highlighted destination. The board is unchanged.');}
  }
  function clear(message) {source='';selection=null;render();announce(message);}
  $('from').addEventListener('change',()=>{source=$('from').value;selection=null;render();announce(source?`${source} selected. Choose a destination.`:'Selection cleared.');});
  $('action').addEventListener('change',()=>{selection=actions.find(m=>moveKey(m)===$('action').value)||null;fillChoices();drawBoard();announce(selection?`Selected ${describe(selection)}. Confirm or cancel.`:'Choose a destination.');});
  $('cancel').addEventListener('click',()=>{if(busy)return;clear('Selection cancelled. No move submitted.');$('from').focus();});
  document.addEventListener('keydown',e=>{if(!busy&&e.key==='Escape'&&(source||selection)){clear('Selection cancelled. No move submitted.');$('from').focus();}});
  $('confirm').addEventListener('click',()=>{
    if(!selection||busy)return;
    const submitted={...selection};busy=true;fillChoices();announce('Resolving both committed moves…');
    // Yield once so the resolution state can be rendered. No timed input.
    requestAnimationFrame(()=>{
      const result=match.play(submitted);busy=false;
      if(!result.ok){render();announce(result.reason);return;}
      try {$('narration').textContent=narrate(result.events);}catch{$('narration').textContent='Narration unavailable. Inspect the event history.';}
      clear(`Turn resolved. ${match.completed?'Match complete: '+match.game.status+'. Replay or restart.':'Turn '+match.game.turn+'. Choose your next move.'}`);
      $('from').focus();
    });
  });
  $('restart').addEventListener('click',()=>{match.restart();replay='live';$('summary-panel').hidden=true;$('narration').textContent='Scripted narration appears after resolution.';clear('New match. Turn 1. Choose a white piece.');$('from').focus();});
  $('finish').addEventListener('click',()=>{match.finish();clear('Match ended by you. No winner declared. Replay the snapshots or restart.');$('replay').focus();});
  $('replay').addEventListener('change',()=>{replay=$('replay').value;source='';selection=null;render();announce(replay==='live'?'Live position. '+(match.completed?'Match complete.':'Choose your move.'):`Inspecting ${$('replay').selectedOptions[0].textContent}. Live match unchanged.`);});
  $('live').addEventListener('click',()=>{replay='live';render();announce('Live position. '+(match.completed?'Match complete. Replay or restart.':'Choose your move.'));$('from').focus();});
  $('summary-button').addEventListener('click',()=>{$('summary-panel').hidden=false;$('summary').value=JSON.stringify(match.summary(),null,2);$('summary').focus();});
  const body=`Build: ${BUILD}\nBrowser / OS:\nInput method (keyboard, pointer, assistive device):\nSteps to reproduce:\nExpected behavior:\nActual behavior:\nEvidence (remove private information):\n`;
  $('finding').href='https://github.com/ibloud/sewers-and-shadows-bot/issues/new?title='+encodeURIComponent('Float Chess finding')+'&body='+encodeURIComponent(body);
  $('build').textContent=BUILD;render();announce('Turn 1. Human versus Harbour. Choose a white piece.');
})();
