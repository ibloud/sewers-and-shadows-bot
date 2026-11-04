'use strict';
for(const button of document.querySelectorAll('.load-video'))button.addEventListener('click',()=>{
 const slot=button.nextElementSibling;if(slot.childElementCount)return;
 const frame=document.createElement('iframe');frame.title=button.textContent.replace('Load ','');frame.src='https://www.youtube-nocookie.com/embed/'+button.dataset.video;frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';slot.append(frame);button.disabled=true;button.textContent='Video player loaded';frame.focus();
});
