import * as THREE from './vendor/three.module.js';

const host = document.querySelector('#object-stage');
const separate = document.querySelector('#separate');
const reset = document.querySelector('#reset-view');
const toggle = document.querySelector('#motion-toggle');
const hint = document.querySelector('#object-hint');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive edit layers. Drag left or right, or use arrow keys to rotate. Press Home to reset.');
  host.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  camera.position.set(0, .45, 12.8);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-4, 7, 9); scene.add(light);
  const fill = new THREE.DirectionalLight(0xe1e8cb, 1.5);
  fill.position.set(4, -2, 2); scene.add(fill);
  const stack = new THREE.Group(); scene.add(stack);
  const black = new THREE.MeshStandardMaterial({color:0x171717, roughness:.9});
  const yellow = new THREE.MeshStandardMaterial({color:0xe6fb66, roughness:.8});
  const white = new THREE.MeshStandardMaterial({color:0xf6f4ed, roughness:.8});
  const blue = new THREE.MeshStandardMaterial({color:0x85956a, roughness:.9});
  function box(w,h,d,material,x=0,y=0,z=0,parent=stack){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function texture(draw){const c=document.createElement('canvas');c.width=1024;c.height=640;const ctx=c.getContext('2d');draw(ctx);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t;}
  function panel(t,group,z=.1){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(5,3.125),new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false}));mesh.position.z=z;group.add(mesh);return mesh;}
  function frame(group,material){box(5.18,.105,.14,material,0,1.61,0,group);box(5.18,.105,.14,material,0,-1.61,0,group);box(.105,3.12,.14,material,-2.54,0,0,group);box(.105,3.12,.14,material,2.54,0,0,group);}
  const footage = new THREE.Group(); stack.add(footage);
  box(5.18,3.32,.16,black,0,0,-.05,footage);
  const sceneTexture=texture(ctx=>{
    ctx.fillStyle='#30392c';ctx.fillRect(0,0,1024,640);
    ctx.fillStyle='#252f21';ctx.fillRect(0,395,1024,245);
    ctx.strokeStyle='#dce4cd33';ctx.lineWidth=2;
    for(let x=-500;x<1600;x+=100){ctx.beginPath();ctx.moveTo(510+(x-510)*.5,395);ctx.lineTo(x,640);ctx.stroke();}
    for(const y of [425,470,535,620]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y);ctx.stroke();}
    ctx.fillStyle='#f6f4ed';ctx.font='bold 18px monospace';ctx.fillText('EME — SEQUENCE 01',35,42);ctx.fillText('00:00:03:00',790,603);
    ctx.beginPath();ctx.arc(700,254,118,0,Math.PI*2);ctx.fillStyle='#f47c52';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#171717';ctx.stroke();
    const g=ctx.createRadialGradient(655,210,10,700,254,118);g.addColorStop(0,'#ffc6a5');g.addColorStop(.6,'#f47c52');g.addColorStop(1,'#b34e35');ctx.fillStyle=g;ctx.fill();ctx.stroke();
    ctx.fillStyle='#17171718';ctx.beginPath();ctx.ellipse(720,440,130,23,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#b7d0b8';ctx.fillRect(170,230,175,175);ctx.strokeStyle='#171717';ctx.strokeRect(170,230,175,175);
    ctx.beginPath();ctx.moveTo(170,230);ctx.lineTo(214,201);ctx.lineTo(389,201);ctx.lineTo(345,230);ctx.closePath();ctx.fillStyle='#d1e2cc';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(345,230);ctx.lineTo(389,201);ctx.lineTo(389,375);ctx.lineTo(345,405);ctx.closePath();ctx.fillStyle='#78957e';ctx.fill();ctx.stroke();
  });panel(sceneTexture,footage,.045);
  const type = new THREE.Group(); stack.add(type);frame(type,white);
  const typeTexture=texture(ctx=>{
    ctx.fillStyle='#171717';ctx.fillRect(58,300,756,253);ctx.fillStyle='#e6fb66';ctx.fillRect(45,287,756,253);ctx.strokeStyle='#171717';ctx.lineWidth=5;ctx.strokeRect(45,287,756,253);
    ctx.fillStyle='#171717';ctx.font='bold 15px monospace';ctx.fillText('MAKE SOMETHING THAT MOVES.',72,325);ctx.font='900 81px Arial';ctx.fillText('YOUR NEXT',68,414);ctx.fillText('GREAT CUT.',68,500);
    ctx.fillStyle='#f6f4ed';ctx.fillRect(725,27,260,42);ctx.strokeRect(725,27,260,42);ctx.fillStyle='#171717';ctx.font='bold 17px monospace';ctx.fillText('02 / TYPOGRAPHY',743,55);
  });panel(typeTexture,type,.1);
  const motion = new THREE.Group(); stack.add(motion);
  const guideTexture=texture(ctx=>{
    ctx.strokeStyle='#f6f4ed';ctx.lineWidth=4;
    for(const [x,y,sx,sy] of [[8,8,1,1],[1016,8,-1,1],[8,632,1,-1],[1016,632,-1,-1]]){ctx.beginPath();ctx.moveTo(x,y+sy*48);ctx.lineTo(x,y);ctx.lineTo(x+sx*48,y);ctx.stroke();}
    ctx.fillStyle='#171717';ctx.fillRect(26,26,269,45);ctx.fillStyle='#f6f4ed';ctx.font='bold 17px monospace';ctx.fillText('03 / MOTION',45,56);
    ctx.setLineDash([8,9]);ctx.strokeStyle='#f6f4ed80';ctx.lineWidth=2;ctx.strokeRect(28,90,968,515);ctx.setLineDash([]);
  });panel(guideTexture,motion,0);
  const playDisk=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.12,48),yellow);playDisk.rotation.x=Math.PI/2;playDisk.position.set(1.76,-.77,.15);motion.add(playDisk);
  const triangle = new THREE.Shape();triangle.moveTo(-.1,-.17);triangle.lineTo(.18,0);triangle.lineTo(-.1,.17);triangle.closePath();
  const playMark=new THREE.Mesh(new THREE.ShapeGeometry(triangle),new THREE.MeshBasicMaterial({color:0x171717,side:THREE.DoubleSide}));playMark.position.set(1.76,-.77,.22);motion.add(playMark);
  // A compact timeline under the stack anchors the illustration to editing.
  const timeline=new THREE.Group();timeline.position.set(0,-2.13,-.15);stack.add(timeline);
  box(5.25,.63,.17,black,0,0,0,timeline);box(4.98,.48,.05,white,0,0,.11,timeline);
  box(2.65,.13,.04,blue,-.98,.1,.16,timeline);box(1.63,.13,.04,yellow,.39,-.1,.16,timeline);box(.04,.55,.055,black,.3,0,.2,timeline);
  let expanded=false, spread=.4, rotation=-.48, elevation=.24, active=true, moving=!reduced.matches, raf=null, drag=null, tickTime=0, visible=true;
  const layers=[footage,type,motion];
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=w/h<1.1?14.2:12.8;camera.updateProjectionMatrix();render();}
  function render(){stack.rotation.set(elevation,rotation,-.065);layers.forEach((layer,i)=>{layer.position.set((i-1)*spread*.65,(i-1)*spread*.35,i*spread-.5);});renderer.render(scene,camera);}
  function animate(now){raf=null;if(!active||!visible||document.hidden)return;const dt=Math.min((now-tickTime)/1000||0,.05);tickTime=now;const target=expanded?1.4:.4;spread+=(target-spread)*Math.min(1,dt*8);stack.position.y=moving?Math.sin(now*.0007)*.065:0;render();if(moving||Math.abs(target-spread)>.002)raf=requestAnimationFrame(animate);}
  function request(){if(raf===null&&active&&visible&&!document.hidden){tickTime=performance.now();raf=requestAnimationFrame(animate);}}
  function stopLoop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;}
  function toggleLabel(){toggle.textContent=moving?'Ⅱ':'▶';toggle.setAttribute('aria-label',moving?'Pause 3D animation':'Play 3D animation');toggle.title=moving?'Pause animation':'Play animation';}
  separate.addEventListener('click',()=>{expanded=!expanded;separate.setAttribute('aria-pressed',String(expanded));separate.innerHTML=expanded?'Bring together <span>↙</span>':'Separate layers <span>↗</span>';if(reduced.matches){spread=expanded?1.4:.4;render();}else request();});
  function resetView(){rotation=-.48;elevation=.24;render();}
  reset.addEventListener('click',resetView);
  toggle.addEventListener('click',()=>{moving=!moving;toggleLabel();if(!moving)stack.position.y=0;render();request();});
  reduced.addEventListener('change',()=>{moving=!reduced.matches;toggleLabel();stack.position.y=0;render();request();});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,rotation,elevation};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;rotation=Math.max(-1,Math.min(1,drag.rotation+(e.clientX-drag.x)*.006));elevation=Math.max(-.5,Math.min(.6,drag.elevation+(e.clientY-drag.y)*.003));render();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')resetView();else if(e.key==='ArrowLeft')rotation=Math.max(-1,rotation-.12);else if(e.key==='ArrowRight')rotation=Math.min(1,rotation+.12);else elevation=THREE.MathUtils.clamp(elevation+(e.key==='ArrowUp'?-.1:.1),-.5,.6);render();}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;stopLoop();host.classList.remove('ready');canvas.hidden=true;hint.textContent='Static preview';document.querySelector('.live-mark').textContent='STATIC VIEW';[separate,reset,toggle].forEach(b=>b.disabled=true);});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else stopLoop();},{rootMargin:'50px'});intersection.observe(host);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLoop();else request();});
  window.addEventListener('pagehide',()=>{stopLoop();});window.addEventListener('pageshow',request);
  resize();host.classList.add('ready');hint.textContent='Drag to rotate';document.querySelector('.live-mark').textContent='INTERACTIVE 3D';[separate,reset,toggle].forEach(b=>b.disabled=false);toggleLabel();request();
} catch (error) {
  renderer?.dispose();host.querySelector('canvas')?.remove();host.classList.remove('ready');hint.textContent='Static preview';document.querySelector('.live-mark').textContent='STATIC VIEW';
  console.info('EME: using the static 3D illustration.');
}
