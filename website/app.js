'use strict';
const stage = document.querySelector('.study-stage'), moment = document.querySelector('#moment'), play = document.querySelector('#play-study');
const notes = { editorial: 'Editorial — expressive type, a quiet entrance, space to breathe.', balanced: 'Balanced — a composed panel, clear hierarchy, measured motion.', neobrutalism: 'Neobrutalism — bold type, hard edges, an unapologetic yellow.' };
let raf = null, start = 0, initial = 0;
function render() {
 const f = Number(moment.value), opacity = Math.min(1, f / 15, (180 - f) / 15);
 stage.style.setProperty('--opacity', opacity);
 stage.style.setProperty('--shift', `${(1 - opacity) * 22}px`);
 document.querySelector('#frame').value = String(f).padStart(3, '0');
 document.querySelector('#time').value = (f / 30).toFixed(2) + ' s';
}
function stop(){if(raf !== null) cancelAnimationFrame(raf); raf=null; play.textContent='▶'; play.setAttribute('aria-label','Play design study');}
function animate(now){const f = Math.min(180, Math.floor(initial + (now-start)*.03)); moment.value=f;render();if(f>=180){stop();return;}raf=requestAnimationFrame(animate);}
play.addEventListener('click',()=>{if(raf !== null){stop();return;}initial=Number(moment.value)>=180?0:Number(moment.value);start=performance.now();play.textContent='Ⅱ';play.setAttribute('aria-label','Pause design study');raf=requestAnimationFrame(animate);});
moment.addEventListener('input',()=>{stop();render();});
document.querySelectorAll('button[data-style]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('button[data-style]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));stage.dataset.style=b.dataset.style;if(Number(moment.value)<15||Number(moment.value)>165){stop();moment.value=60;}document.querySelector('#style-note').textContent=notes[b.dataset.style];render();}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
document.querySelector('#copy-command').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('npm start');document.querySelector('#copy-status').textContent='Copied npm start.';}catch{document.querySelector('#copy-status').textContent='Select and copy: npm start';}});
render();
