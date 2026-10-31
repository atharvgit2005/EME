'use strict';
const stage=document.querySelector('.study-stage'),moment=document.querySelector('#moment'),play=document.querySelector('#play-study');
const notes={editorial:'Editorial: expressive type, a quiet entrance, space to breathe.',balanced:'Balanced: clear hierarchy, a composed panel, measured motion.',neobrutalism:'Neobrutalism: bold type, hard edges, no hesitation.'};
let raf=null,start=0,initial=0;
function render(){const f=Number(moment.value),opacity=Math.min(1,f/15,(180-f)/15);stage.style.setProperty('--opacity',opacity);stage.style.setProperty('--shift',`${(1-opacity)*22}px`);document.querySelector('#frame').value=String(f).padStart(3,'0');document.querySelector('#time').value=(f/30).toFixed(2)+' s';}
function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;play.textContent='▶';play.setAttribute('aria-label','Play design study');}
function animate(now){const f=Math.min(180,Math.floor(initial+(now-start)*.03));moment.value=f;render();if(f>=180){stop();return;}raf=requestAnimationFrame(animate);}
play.addEventListener('click',()=>{if(raf!==null){stop();return;}initial=Number(moment.value)>=180?0:Number(moment.value);start=performance.now();play.textContent='Ⅱ';play.setAttribute('aria-label','Pause design study');raf=requestAnimationFrame(animate);});
moment.addEventListener('input',()=>{stop();render();});
document.querySelectorAll('button[data-style]').forEach(b=>b.addEventListener('click',()=>{stop();document.querySelectorAll('button[data-style]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));stage.dataset.style=b.dataset.style;if(Number(moment.value)<15||Number(moment.value)>165)moment.value=60;document.querySelector('#style-note').textContent=notes[b.dataset.style];render();}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop();}).observe(stage);
document.querySelector('#copy-command').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('npm start');document.querySelector('#copy-status').textContent='Copied npm start.';}catch{document.querySelector('#copy-status').textContent='Select and copy: npm start';}});
render();


// Native video works without JavaScript; these controls add chapter navigation.
const demoVideo = document.querySelector('#eme-demo');
const demoPlay = document.querySelector('#demo-play');
const demoStatus = document.querySelector('#demo-playback-status');
const demoChapters = [...document.querySelectorAll('[data-demo-time]')];
demoPlay.hidden = false;
document.querySelector('.demo-chapters').hidden = false;
let requestedDemoTime = null;
async function playDemo(at) {
  demoStatus.textContent = '';
  if (typeof at === 'number') {
    if (demoVideo.readyState >= 1) demoVideo.currentTime = at;
    else requestedDemoTime = at;
  }
  try { await demoVideo.play(); }
  catch { demoStatus.textContent = 'Use the player controls to start, or download the video below.'; }
}
demoVideo.addEventListener('loadedmetadata', () => {
  if (requestedDemoTime !== null) { demoVideo.currentTime = requestedDemoTime; requestedDemoTime = null; }
});
demoPlay.addEventListener('click', () => {
  if (!demoVideo.paused) demoVideo.pause();
  else playDemo(demoVideo.ended ? 0 : undefined);
});
demoChapters.forEach(button => button.addEventListener('click', () => playDemo(Number(button.dataset.demoTime))));
function demoPlaybackLabel() {
  demoPlay.textContent = demoVideo.ended ? 'Replay walkthrough ↻' : demoVideo.paused ? 'Play walkthrough ▶' : 'Pause walkthrough Ⅱ';
}
['play', 'pause', 'ended'].forEach(event => demoVideo.addEventListener(event, demoPlaybackLabel));
demoVideo.addEventListener('timeupdate', () => {
  let active = demoChapters[0];
  for (const button of demoChapters) if (demoVideo.currentTime >= Number(button.dataset.demoTime)) active = button;
  demoChapters.forEach(button => button.setAttribute('aria-current', String(button === active)));
});
demoVideo.addEventListener('error', () => { demoStatus.textContent = 'The video could not load. Try the download link or read the transcript below.'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) demoVideo.pause(); });
