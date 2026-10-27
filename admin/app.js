/* Arev Service — админка. Работает напрямую с вашим сервером Supabase. */
(function(){
"use strict";
const CFG=window.AREV_CONFIG||{};
const sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});

/* ---------- иконки ---------- */
const I={
 chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
 team:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/></svg>',
 clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 fuel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
 cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
 alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
 route:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/></svg>',
 more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
 refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
 box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
 pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
 info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
};
const CATS={inverter:'Не работает инвертор',output:'Упала выработка',panel:'Повреждена панель',wiring:'Проводка и разъёмы',battery:'Аккумулятор',cleaning:'Чистка панелей',checkup:'Плановый техосмотр',expand:'Расширение или чужая станция',other:'Другое'};
const ST={new:['Новая','c-info'],assigned:['Взята','c-info'],enroute:['В пути','c-warn'],onsite:['На месте','c-sun'],done:['Выполнена','c-ok'],closed:['Закрыта','c-muted'],cancelled:['Отменена','c-muted']};
const ACTIVE=['new','assigned','enroute','onsite'];

/* ---------- помощники ---------- */
const h=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=v=>v?new Date(v).getTime():null;
const MON=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];const WD=['вс','пн','вт','ср','чт','пт','сб'];
const p2=n=>String(n).padStart(2,'0');
const fT=ts=>{if(!ts)return '—';const d=new Date(ts);return d.getDate()+' '+MON[d.getMonth()]+', '+p2(d.getHours())+':'+p2(d.getMinutes())};
const fHM=ts=>{if(!ts)return '—';const d=new Date(ts);return p2(d.getHours())+':'+p2(d.getMinutes())};
const fDay=ts=>{const d=new Date(ts);return WD[d.getDay()]+', '+d.getDate()+' '+MON[d.getMonth()]};
const fDur=m=>{if(m==null||m<0)return '—';const x=Math.round(m/60000);return x<60?x+' мин':Math.floor(x/60)+' ч '+p2(x%60)+' мин'};
const ago=ts=>{const m=Math.round((Date.now()-ts)/60000);if(m<1)return 'только что';if(m<60)return m+' мин назад';const hh=Math.floor(m/60);if(hh<24)return hh+' ч назад';return fT(ts)};
const money=n=>n==null||isNaN(n)?'—':Math.round(n).toLocaleString('ru-RU')+' ֏';
const n1=x=>(Math.round((+x||0)*10)/10).toLocaleString('ru-RU');
const fDist=m=>m==null?'—':m<1000?Math.round(m)+' м':(m/1000).toFixed(1).replace('.',',')+' км';
function distM(a,b){if(!a||!b||a.lat==null||b.lat==null)return null;const R=6371000,t=Math.PI/180;const dLa=(b.lat-a.lat)*t,dLo=(b.lng-a.lng)*t;const x=Math.sin(dLa/2)**2+Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
const mapUrl=p=>'https://www.google.com/maps?q='+(+p.lat).toFixed(6)+','+(+p.lng).toFixed(6);
const initials=n=>String(n||'?').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
const dayStart=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()};
const monthStart=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).getTime()};
const hmToTs=(day,hm)=>{const p=String(hm||'09:00').split(':').map(Number);return dayStart(day)+((p[0]||0)*60+(p[1]||0))*60000};
const LS={get(k,d){try{const v=localStorage.getItem('arevadm.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('arevadm.'+k,JSON.stringify(v))}catch(e){}}};

/* ---------- состояние ---------- */
const S={session:null,isAdmin:false,loaded:false,view:{name:'a-dash',p:{}},form:{},filter:'active',per:LS.get('per','week'),empF:null,
 cfg:{},staff:[],shifts:[],fuel:[],tickets:[],buys:[],bf:'open',wph:[],places:[],tasks:[],taskDate:null,dayEmp:null,dayDate:null,dayPts:{},dayLoading:null,map:null,dayCtx:null,tphotos:{},alerts:[],checks:{},tx:[],track:{},urls:{},imp:null,busy:false};
const tech=id=>S.staff.find(m=>m.id===id);
const approved=()=>S.staff.filter(m=>m.status==='approved');
const T=id=>S.tickets.find(t=>t.id===id);
const fuelUnit=m=>m&&m.fuel_type==='gas'?'м³':'л';
const office=()=>S.cfg.office_lat!=null?{lat:S.cfg.office_lat,lng:S.cfg.office_lng}:null;

/* ---------- загрузка ---------- */
// Supabase отдаёт не больше 1000 строк за запрос, поэтому читаем частями
async function pages(mk,max){let out=[];for(let i=0;i<(max||100000);i+=1000){const r=await mk().range(i,i+999);if(r.error)return{error:r.error,data:out};const d=r.data||[];out=out.concat(d);if(d.length<1000)break}return{data:out}}
async function load(){
 const from=new Date(Date.now()-62*864e5).toISOString();const from7=new Date(Date.now()-7*864e5).toISOString();
 const from8=new Date(Date.now()-8*864e5).toISOString();
 const q=await Promise.all([
  sb.from('config').select('*').eq('id',1).maybeSingle(),
  pages(()=>sb.from('staff').select('*').order('created_at')),
  pages(()=>sb.from('shifts').select('*').gte('start_at',from).order('start_at',{ascending:false})),
  pages(()=>sb.from('fuel').select('*').gte('at',from).order('at',{ascending:false})),
  pages(()=>sb.from('tickets').select('*').or('created_at.gte.'+from+',status.in.(new,assigned,enroute,onsite,done)').order('created_at',{ascending:false})),
  pages(()=>sb.from('alerts').select('*').gte('at',from).order('at',{ascending:false})),
  pages(()=>sb.from('ai_checks').select('*').order('photo')),
  pages(()=>sb.from('card_tx').select('*').gte('at',from).order('at',{ascending:false})),
  pages(()=>sb.from('track_points').select('staff_id,at,device_at,lat,lng,acc,mocked').gte('at',from8).order('id')),
  pages(()=>sb.from('purchases').select('*').or('created_at.gte.'+from+',status.in.(bought,partial,delivered)').order('created_at',{ascending:false})),
  pages(()=>sb.from('work_photos').select('*').gte('at',from).order('at',{ascending:false})),
  pages(()=>sb.from('places').select('*').order('name')),
  pages(()=>sb.from('tasks').select('*').or('day.gte.'+from.slice(0,10)+',archived_at.is.null').order('day').order('ord').order('created_at'))
 ]);
 const err=q.find(r=>r&&r.error);if(err)toast('Ошибка загрузки: '+err.error.message);
 S.cfg=q[0].data||{};S.staff=q[1].data||[];
 S.shifts=(q[2].data||[]).map(x=>({...x,masterId:x.staff_id,startAt:ms(x.start_at),endAt:ms(x.end_at),
   start:{lat:x.start_lat,lng:x.start_lng,acc:x.start_acc,dist:x.start_dist,odo:x.start_odo,photo:x.start_photo,wifi:x.start_wifi_ok},
   end:x.end_at?{lat:x.end_lat,lng:x.end_lng,acc:x.end_acc,dist:x.end_dist,odo:x.end_odo,photo:x.end_photo,wifi:x.end_wifi_ok}:null}));
 S.fuel=(q[3].data||[]).map(x=>({...x,masterId:x.staff_id,at:ms(x.at),sum:x.amount,loc:x.lat!=null?{lat:x.lat,lng:x.lng}:null}));
 S.tickets=(q[4].data||[]).map(x=>({...x,techId:x.staff_id,createdAt:ms(x.created_at),loc:x.lat!=null?{lat:x.lat,lng:x.lng}:null,
   times:{assigned:ms(x.assigned_at),enroute:ms(x.enroute_at),onsite:ms(x.onsite_at),done:ms(x.done_at),closed:ms(x.closed_at)},
   gps:{enroute:x.enroute_lat!=null?{lat:x.enroute_lat,lng:x.enroute_lng}:null,onsite:x.onsite_lat!=null?{lat:x.onsite_lat,lng:x.onsite_lng,dist:x.onsite_dist}:null,done:x.done_lat!=null?{lat:x.done_lat,lng:x.done_lng,dist:x.done_dist}:null}}));
 S.alerts=(q[5].data||[]).map(x=>({...x,at:ms(x.at)}));
 S.checks={};(q[6].data||[]).forEach(c=>S.checks[c.photo]=c);
 S.tx=(q[7].data||[]).map(x=>({...x,at:ms(x.at)}));
 S.track={};(q[8].data||[]).forEach(p=>{(S.track[p.staff_id]=S.track[p.staff_id]||[]).push({lat:p.lat,lng:p.lng,acc:p.acc,at:ms(p.device_at||p.at),mocked:p.mocked,what:'трек'})});
 Object.values(S.track).forEach(a=>a.sort((x,y)=>x.at-y.at));
 S.wph=(q[10].data||[]).map(x=>({...x,masterId:x.staff_id,at:ms(x.taken_at||x.at),sentAt:ms(x.at),offline:!!x.taken_at&&ms(x.at)-ms(x.taken_at)>10*60000,loc:x.lat!=null?{lat:x.lat,lng:x.lng}:null}));
 S.tasks=(q[12].data||[]).map(x=>({...x,masterId:x.staff_id,dAt:ms(x.done_at),loc:x.lat!=null?{lat:x.lat,lng:x.lng}:null}));
 S.places=(q[11].data||[]).filter(x=>x.active!==false);
 S.dayPts={};
 S.buys=(q[9].data||[]).map(x=>({...x,masterId:x.staff_id,at:ms(x.created_at),dAt:ms(x.delivered_at),lAt:ms(x.left_at),accAt:ms(x.accepted_at),loc:x.lat!=null?{lat:x.lat,lng:x.lng}:null}));
 const ids=S.tickets.map(t=>t.id);S.tphotos={};
 if(ids.length){for(let i=0;i<ids.length;i+=150){const r=await sb.from('ticket_photos').select('*').in('ticket_id',ids.slice(i,i+150));(r.data||[]).forEach(p=>{(S.tphotos[p.ticket_id]=S.tphotos[p.ticket_id]||[]).push({...p,at:ms(p.at)})})}}
 S.loaded=true;render(true)}

/* ---------- фото: подписанные ссылки ---------- */
let pending=new Set(),pendT=null;
function thumb(path,cls){if(!path)return '<span class="tiny muted">нет фото</span>';const u=S.urls[path];const ch=S.checks[path];
 if(!u){pending.add(path);clearTimeout(pendT);pendT=setTimeout(signPending,30)}
 return '<span class="thw"><img class="'+(cls||'thumb')+'" alt="Фото" data-path="'+h(path)+'" '+(u?'src="'+h(u)+'"':'')+' data-act="view">'+(ch?'<span class="aib" title="Проверено ИИ">ИИ</span>':'')+'</span>'}
async function signPending(){const list=[...pending].filter(p=>!S.urls[p]);pending.clear();if(!list.length)return;
 const r=await sb.storage.from('photos').createSignedUrls(list,3600);(r.data||[]).forEach(x=>{if(x.signedUrl)S.urls[x.path]=x.signedUrl});
 document.querySelectorAll('img[data-path]').forEach(im=>{const u=S.urls[im.dataset.path];if(u&&!im.getAttribute('src'))im.src=u})}

/* ---------- расчёты и отклонения ---------- */
function routeKm(sh){return sh.route_km!=null?+sh.route_km:0}
const odoKm=sh=>sh.end&&sh.end.odo!=null&&sh.start.odo!=null?sh.end.odo-sh.start.odo:null;
const normOf=m=>+(m&&m.norm_approved)||+S.cfg.default_norm||9;
function aiOdo(mk){const f=[];const ch=mk&&mk.photo&&S.checks[mk.photo];if(!ch)return f;const r=ch.result||{};
 if(r.isDashboard===false)f.push({lv:'bad',t:'ИИ: на фото нет приборной панели'});if(r.isScreen)f.push({lv:'bad',t:'ИИ: похоже на фото экрана или снимка'});
 if(r.odo!=null&&mk.odo!=null&&Math.abs(+r.odo-mk.odo)>2)f.push({lv:'bad',t:'ИИ: на фото '+(+r.odo).toLocaleString('ru-RU')+' км, введено '+mk.odo.toLocaleString('ru-RU')});return f}
function aiRcpt(rec){const f=[];const ch=S.checks[rec.photo];if(!ch)return f;const r=ch.result||{};
 if(r.isReceipt===false)f.push({lv:'bad',t:'ИИ: на фото не чек'});if(r.isScreen)f.push({lv:'bad',t:'ИИ: похоже на фото экрана или снимка'});
 if(r.liters!=null&&Math.abs(+r.liters-rec.liters)>0.5)f.push({lv:'bad',t:'ИИ: в чеке '+n1(r.liters)+', введено '+n1(rec.liters)});
 if(r.sum!=null&&rec.sum&&Math.abs(+r.sum-rec.sum)>Math.max(100,rec.sum*0.02))f.push({lv:'warn',t:'ИИ: в чеке сумма '+money(+r.sum)+', введено '+money(rec.sum)});
 if(r.date){const m=String(r.date).match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/);if(m){const d=new Date(+(m[3].length===2?'20'+m[3]:m[3]),+m[2]-1,+m[1]).getTime();if(Math.abs(d-dayStart(rec.at))>864e5)f.push({lv:'bad',t:'ИИ: чек от '+r.date+', а заправка внесена '+fDay(rec.at)})}}
 if(r.nonFuel)f.push({lv:'warn',t:'ИИ: в чеке есть не только топливо'});return f}
/* --- маршрут по GPS: километры и стоянки --- */
const whPoint=()=>S.cfg.warehouse_lat!=null?{lat:S.cfg.warehouse_lat,lng:S.cfg.warehouse_lng}:office();
function trackOf(id,a,b,pts){return (pts||S.track[id]||[]).filter(p=>p.at>=a&&p.at<=b&&!p.mocked&&(p.acc==null||p.acc<=100))}
function gpsKm(id,a,b,pts){const p=trackOf(id,a,b,pts);if(p.length<2)return null;let d=0;for(let i=1;i<p.length;i++){const x=distM(p[i-1],p[i]),dt=(p[i].at-p[i-1].at)/1000;if(dt>0&&x/dt<55)d+=x}return d/1000}
const shiftGps=sh=>sh.gps_km!=null?+sh.gps_km:gpsKm(sh.masterId,sh.startAt,sh.endAt||Date.now());
const PLK={client:['Клиент','client'],supplier:['Поставщик','shop'],warehouse:['Склад','office'],other:['Другое','client']};
function placeOf(id,p){const o=office(),w=whPoint();
 const pl=S.places.map(x=>({x,d:distM(p,x)})).filter(r=>r.d<=(+r.x.radius||200)).sort((a,b)=>a.d-b.d)[0];if(pl)return{k:(PLK[pl.x.kind]||PLK.other)[1],t:pl.x.name,place:1};
 if(o&&distM(p,o)<=Math.max(250,+S.cfg.office_radius||150))return{k:'office',t:'Офис'};
 if(w&&distM(p,w)<=250)return{k:'office',t:'Склад'};
 const t=S.tickets.find(t=>t.techId===id&&t.loc&&distM(p,t.loc)<=(+S.cfg.client_radius||200)+100);if(t)return{k:'client',t:'Клиент '+t.num};
 const wf=S.wph.find(x=>x.masterId===id&&x.loc&&distM(p,x.loc)<=250);if(wf)return{k:'client',t:'Объект: '+(wf.object||'фото работ')};
 const b=S.buys.find(b=>b.masterId===id&&b.loc&&distM(p,b.loc)<=250);if(b)return{k:'shop',t:'Закупка: '+b.supplier};
 const r=S.fuel.find(r=>r.masterId===id&&r.loc&&distM(p,r.loc)<=250);if(r)return{k:'fuel',t:'Заправка'};
 return{k:'unknown',t:'Неизвестное место'}}
// стоянка: подряд идущие точки в радиусе 200 м. Телефон не шлёт точки, пока машина стоит,
// поэтому конец стоянки = время следующей точки минус время на дорогу до неё (~40 км/ч).
function stopsOf(id,a,b,pts){const p=trackOf(id,a,b,pts);const out=[];const minMs=(+S.cfg.stop_min||20)*60000;let i=0;
 while(i<p.length){const anc=p[i];let j=i;while(j+1<p.length&&distM(anc,p[j+1])<=200)j++;const nx=p[j+1];
  let end,gap=false;if(nx){const d=distM(p[j],nx)||0;end=Math.max(p[j].at,nx.at-d/11*1000);gap=d>3000&&nx.at-p[j].at>minMs}else end=Math.max(p[j].at,Math.min(b,Date.now()));
  if(end-anc.at>=minMs)out.push({at:anc.at,end,dur:end-anc.at,lat:anc.lat,lng:anc.lng,place:placeOf(id,anc),gap});i=j+1}
 return out}
function longStops(sh){const lim=(+S.cfg.long_stop_min||30)*60000;return stopsOf(sh.masterId,sh.startAt,sh.endAt||Date.now()).filter(x=>x.place.k==='unknown'&&x.dur>=lim)}

/* --- закупки --- */
const BST={bought:['Не сдано','c-warn'],partial:['Остаток не сдан','c-warn'],delivered:['Ждёт приёмки','c-info'],accepted:['Принято','c-ok'],cancelled:['Отменено','c-muted']};
const lineTxt=l=>h(l.name)+' — '+n1(l.qty)+(l.unit?' '+h(l.unit):'');
const leftLines=b=>(b.left_lines||[]).filter(l=>+l.qty>0);
const acceptLines=b=>b.dest!=='warehouse'?leftLines(b):(b.lines||[]);
function aiBuy(b){const f=[];const ch=S.checks[b.photo];if(!ch)return f;const r=ch.result||{};
 if(r.isReceipt===false)f.push({lv:'bad',t:'ИИ: на фото не чек и не накладная'});if(r.isScreen)f.push({lv:'bad',t:'ИИ: похоже на фото экрана или снимка'});
 if(r.handwritten)f.push({lv:'warn',t:'ИИ: документ написан от руки'});
 if(r.sum!=null&&b.amount&&Math.abs(+r.sum-b.amount)>Math.max(200,b.amount*0.03))f.push({lv:'bad',t:'ИИ: в чеке '+money(+r.sum)+', введено '+money(b.amount)});
 if(r.date){const m=String(r.date).match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/);if(m){const d=new Date(+(m[3].length===2?'20'+m[3]:m[3]),+m[2]-1,+m[1]).getTime();if(Math.abs(d-dayStart(b.at))>864e5)f.push({lv:'bad',t:'ИИ: чек от '+r.date+', а закупка внесена '+fDay(b.at)})}}
 if(r.note)f.push({lv:'warn',t:'ИИ: '+r.note});return f}
function buyFlags(b){const c=S.cfg,f=[];if(b.status==='cancelled')return f;const now=Date.now();const maxH=(+c.purchase_max_hours||24)*36e5;const radO=+c.office_radius||150,radC=+c.client_radius||200;const t=b.ticket_id?T(b.ticket_id):null;
 if(b.status==='bought'&&now-b.at>maxH)f.push({lv:'bad',t:(b.dest!=='warehouse'?'Не отмечено на объекте':'Не сдано на склад')+' уже '+fDur(now-b.at)});
 if(b.status==='partial'&&now-(b.dAt||b.at)>maxH)f.push({lv:'bad',t:'Остаток не сдан на склад уже '+fDur(now-(b.dAt||b.at))});
 if(b.delivered_dist!=null&&b.delivered_dist>(b.dest==='ticket'?radC:radO))f.push({lv:'bad',t:(b.dest==='ticket'?'На объекте отмечено в '+fDist(b.delivered_dist)+' от объекта':'Сдача отмечена в '+fDist(b.delivered_dist)+' от склада')});
 if(b.left_dist!=null&&b.left_dist>radO)f.push({lv:'bad',t:'Остаток сдан в '+fDist(b.left_dist)+' от склада'});
 if(t&&t.status==='cancelled')f.push({lv:'bad',t:'Заказ '+t.num+' отменён, а материал записан на него'});
 if(t&&t.rating===1&&/не было/.test(t.review||''))f.push({lv:'bad',t:'Клиент заказа '+t.num+' сказал, что мастера не было'});
 if(b.dest==='site'&&b.delivered_lat!=null){const dl={lat:b.delivered_lat,lng:b.delivered_lng};if(!S.wph.some(w=>w.masterId===b.masterId&&w.loc&&Math.abs(w.at-b.dAt)<864e5&&distM(w.loc,dl)<=300))f.push({lv:'warn',t:'Материал отмечен там, где нет фото работ'})}
 if(b.shortage)f.push({lv:'bad',t:'Недостача при приёмке'+(b.accept_note?': '+b.accept_note:'')});
 if(b.status==='delivered'&&now-(b.lAt||b.dAt||b.at)>864e5)f.push({lv:'warn',t:'Ждёт приёмки больше суток'});
 if(!b.shift_id)f.push({lv:'warn',t:(b.source==='warehouse'?'Взято':'Куплено')+' вне смены'});
 if(b.source==='warehouse'&&b.loc){const w=whPoint();const d=w?distM(b.loc,w):null;if(d!=null&&d>300)f.push({lv:'bad',t:'Отмечено «со склада», а снято в '+fDist(d)+' от склада'})}
 if(!b.loc)f.push({lv:'warn',t:'Чек без координат'});
 const dup=S.buys.find(x=>x.id!==b.id&&x.status!=='cancelled'&&x.amount===b.amount&&Math.abs(x.at-b.at)<3*864e5&&String(x.supplier).trim().toLowerCase()===String(b.supplier).trim().toLowerCase());
 if(dup)f.push({lv:'warn',t:'Похожая закупка на ту же сумму '+fDay(dup.at)+(dup.masterId!==b.masterId?' у другого сотрудника':'')});
 if(b.source!=='warehouse')f.push(...aiBuy(b));return f}

function taskFlags(t){const f=[];if(t.status==='cancelled')return f;const pl=S.places.find(p=>p.id===t.place_id);const lim=(pl&&pl.radius)||+S.cfg.client_radius||200;
 if(t.status==='done'&&t.done_dist!=null&&t.done_dist>lim)f.push({lv:'bad',t:'Задача «'+t.title+'» отмечена в '+fDist(t.done_dist)+' от места'});
 if(t.status==='new'&&(t.due?ymdTs(t.due):(t.place_id||t.lat!=null)?ymdTs(t.day):1e15)+864e5<=Date.now())f.push({lv:'warn',t:'Задача «'+t.title+'» не выполнена'});return f}
function shiftFlags(sh){const c=S.cfg;const f=[];const s=sh.start,e=sh.end;const g=+c.grace_min||0;const rad=+c.office_radius||150;
 const late=Math.round((sh.startAt-hmToTs(sh.startAt,c.work_start))/60000);if(late>g)f.push({lv:'warn',t:'Опоздание '+fDur(late*60000)});
 if(s.dist!=null&&s.dist>rad)f.push({lv:'bad',t:'Приход отмечен в '+fDist(s.dist)+' от офиса'});else if(s.lat==null)f.push({lv:'warn',t:'Приход без координат'});
 if(c.office_wifi&&s.wifi===false)f.push({lv:'warn',t:'При приходе телефон не видел офисный Wi-Fi'});
 const prev=S.shifts.filter(x=>x.masterId===sh.masterId&&x.endAt&&x.endAt<=sh.startAt).sort((a,b)=>b.endAt-a.endAt)[0];
 if(prev&&prev.end&&s.odo<prev.end.odo)f.push({lv:'bad',t:'Утром одометр меньше, чем был '+fDay(prev.endAt)+' вечером ('+(s.odo-prev.end.odo)+' км)'});
 f.push(...aiOdo(s));
 if(sh.endAt){const early=Math.round((hmToTs(sh.endAt,c.work_end)-sh.endAt)/60000);if(early>g)f.push({lv:'warn',t:'Ушёл раньше на '+fDur(early*60000)});
  if(e.dist!=null&&e.dist>rad)f.push({lv:'bad',t:'Уход отмечен в '+fDist(e.dist)+' от офиса'});
  if(c.office_wifi&&e.wifi===false)f.push({lv:'warn',t:'При уходе телефон не видел офисный Wi-Fi'});
  const ok=odoKm(sh),rk=routeKm(sh),gk=shiftGps(sh);if(ok!=null&&ok>rk*1.3+10)f.push({lv:'bad',t:'Пробег за смену '+ok+' км, по заказам '+n1(rk)+' км'});
  if(ok!=null&&gk!=null&&gk>=1&&ok>gk*1.25+10)f.push({lv:'bad',t:'По одометру '+ok+' км, а по GPS '+n1(gk)+' км'});
  if(gk!=null&&gk>rk*1.5+15&&!(ok!=null&&ok>rk*1.3+10))f.push({lv:'warn',t:'По GPS '+n1(gk)+' км, по заказам '+n1(rk)+' км'});
  if(sh.endAt-sh.startAt>3*36e5&&!S.wph.some(w=>w.masterId===sh.masterId&&w.at>=sh.startAt&&w.at<=sh.endAt)&&!Object.values(S.tphotos).some(a=>a.some(p=>p.staff_id===sh.masterId&&p.at>=sh.startAt&&p.at<=sh.endAt)))f.push({lv:'warn',t:'За смену нет фото работ'});
  f.push(...aiOdo(e));
 }else if(dayStart(sh.startAt)<dayStart(Date.now()))f.push({lv:'warn',t:'Смена не закрыта'});
 const tk=S.tickets.filter(t=>t.techId===sh.masterId&&t.times.enroute>=sh.startAt&&t.times.enroute<=(sh.endAt||Date.now())).sort((a,b)=>a.times.enroute-b.times.enroute);
 for(let i=1;i<tk.length;i++){const d=tk[i-1].times.done;if(d&&tk[i].times.enroute-d>(+c.max_idle_min||120)*60000)f.push({lv:'warn',t:'Пауза '+fDur(tk[i].times.enroute-d)+' между заказами '+tk[i-1].num+' и '+tk[i].num})}
 const tr=(S.track[sh.masterId]||[]).filter(p=>p.at>=sh.startAt&&p.at<=(sh.endAt||Date.now()));
 longStops(sh).forEach(x=>f.push({lv:x.dur>=90*60000?'bad':'warn',t:'Стоянка '+fDur(x.dur)+' в неизвестном месте ('+fHM(x.at)+'–'+fHM(x.end)+')'+(x.gap?', возможно, пропал сигнал':'')}));
  if(sh.endAt&&sh.endAt-sh.startAt>2*36e5&&tr.length<3&&S.shifts.length)f.push({lv:'warn',t:'Маршрут смены почти не записан (нет разрешения «всегда» или выключен GPS)'});
 return f}
const cardOf=m=>String((m&&m.card_last4)||'').replace(/\D/g,'');
function txOf(id){const c=cardOf(tech(id));if(!c)return [];return S.tx.filter(x=>String(x.card||'').replace(/\D/g,'').endsWith(c))}
const txRange=()=>{if(!S.tx.length)return null;let a=Infinity,b=0;S.tx.forEach(x=>{if(x.at<a)a=x.at;if(x.at>b)b=x.at});return{from:dayStart(a),to:dayStart(b)+864e5}};
const covered=at=>{const r=txRange();return r&&at>=r.from&&at<r.to};
const inShiftAt=(id,at)=>S.shifts.some(s=>s.masterId===id&&at>=s.startAt-30*60000&&at<=(s.endAt||Date.now())+30*60000);
const matchTx=r=>txOf(r.masterId).filter(x=>Math.abs(x.at-r.at)<3*36e5).sort((a,b)=>Math.abs(a.at-r.at)-Math.abs(b.at-r.at))[0]||null;
const matchRec=(tx,id)=>S.fuel.filter(r=>r.masterId===id&&Math.abs(r.at-tx.at)<3*36e5).sort((a,b)=>Math.abs(a.at-tx.at)-Math.abs(b.at-tx.at))[0]||null;
const NONFUEL=/кофе|напит|вода|сигар|табак|магаз|товар|шоколад|снек|мойк|масло мотор|омывай|coffee|shop|market|wash/i;
function txFlags(tx,id){const f=[];const m=tech(id);const rec=matchRec(tx,id);
 if(!rec)f.push({lv:'bad',t:'Заправка по карте не внесена в приложение'});else if(Math.abs(rec.liters-tx.liters)>0.5)f.push({lv:'bad',t:'По выписке '+n1(tx.liters)+', в приложении '+n1(rec.liters)+' '+fuelUnit(m)});
 if(!inShiftAt(id,tx.at))f.push({lv:'bad',t:'Заправка по карте вне смены'+([0,6].includes(new Date(tx.at).getDay())?' (выходной)':'')});
 if(m&&m.tank&&tx.liters>m.tank*1.05)f.push({lv:'bad',t:'По карте '+n1(tx.liters)+' '+fuelUnit(m)+', а бак '+m.tank});
 if(tx.product&&NONFUEL.test(tx.product))f.push({lv:'bad',t:'По топливной карте куплено: '+tx.product});return f}
function fuelFlags(r){const m=tech(r.masterId);const f=[];
 if(m&&m.tank&&r.liters>m.tank*1.05)f.push({lv:'bad',t:'Залито '+n1(r.liters)+' '+fuelUnit(m)+', а бак '+m.tank});
 if(!inShiftAt(r.masterId,r.at))f.push({lv:'warn',t:'Заправка вне смены'});
 if(!r.loc)f.push({lv:'warn',t:'Чек без координат'});
 if(cardOf(m)&&covered(r.at)){const tx=matchTx(r);if(!tx)f.push({lv:'warn',t:'Нет в выписке по карте'});else if(Math.abs(tx.liters-r.liters)>0.5)f.push({lv:'bad',t:'По выписке '+n1(tx.liters)+', в приложении '+n1(r.liters)+' '+fuelUnit(m)})}
 f.push(...aiRcpt(r));return f}
function fuelBal(id,from){const m=tech(id);const norm=normOf(m);const sh=S.shifts.filter(s=>s.masterId===id&&s.startAt>=from);
 const rk=sh.reduce((a,s)=>a+routeKm(s),0);const ok=sh.reduce((a,s)=>{const k=odoKm(s);return a+(k>0?k:0)},0);
 const tx=txOf(id).filter(x=>x.at>=from);const useTx=tx.length>0;const fl=S.fuel.filter(r=>r.masterId===id&&r.at>=from&&!(useTx&&covered(r.at)));
 const filled=tx.reduce((a,x)=>a+(+x.liters||0),0)+fl.reduce((a,r)=>a+(+r.liters||0),0);const sum=tx.reduce((a,x)=>a+(+x.amount||0),0)+fl.reduce((a,r)=>a+(+r.sum||0),0);
 const gk=sh.reduce((a,s)=>{const g=shiftGps(s);return a+(g>0?g:0)},0);const base=sh.reduce((a,s)=>{const g=shiftGps(s);return a+(g!=null&&g>=1?g:routeKm(s))},0);
 const ord=S.shifts.filter(s=>s.masterId===id).sort((a,b)=>a.startAt-b.startAt);let off=0;for(let i=1;i<ord.length;i++){const pv=ord[i-1],cu=ord[i];if(cu.startAt>=from&&pv.end&&pv.end.odo!=null&&cu.start.odo!=null&&cu.start.odo>pv.end.odo)off+=cu.start.odo-pv.end.odo}
 const allowed=base*norm/100;const over=filled-allowed;return{gk,off,fact:ok>0?filled/ok*100:null,rk,ok,allowed,filled,sum,over,bad:over>Math.max(5,allowed*0.2),norm,days:sh.length,unit:fuelUnit(m),src:useTx?'выписка':'приложение',normOk:!!(m&&m.norm_approved)}}
function ticketFlags(t){const f=[];const c=S.cfg;const g=t.gps,tm=t.times;const rad=+c.client_radius||200;
 if(g.onsite&&g.onsite.dist!=null&&g.onsite.dist>rad)f.push({lv:'bad',t:'«На месте» отмечено в '+fDist(g.onsite.dist)+' от объекта'});
 if(g.done&&g.done.dist!=null&&g.done.dist>rad)f.push({lv:'bad',t:'Работа завершена в '+fDist(g.done.dist)+' от объекта'});
 if(tm.enroute&&tm.onsite&&tm.onsite-tm.enroute>90*60000)f.push({lv:'warn',t:'Дорога заняла '+fDur(tm.onsite-tm.enroute)});
 if(tm.onsite&&tm.done&&tm.done-tm.onsite<10*60000)f.push({lv:'warn',t:'На объекте всего '+fDur(tm.done-tm.onsite)});
 if(t.price&&t.est_max&&t.price>t.est_max*1.2)f.push({lv:'warn',t:'Цена выше оценки на '+Math.round((t.price/t.est_max-1)*100)+'%'});
 if((t.refusals||[]).length>=2)f.push({lv:'warn',t:'От заказа отказались '+t.refusals.length+' раза'});
 if(t.rating&&t.rating<=3)f.push({lv:'warn',t:'Низкая оценка клиента: '+t.rating+' из 5'});
 if(t.status==='done'&&tm.done&&Date.now()-tm.done>2*864e5)f.push({lv:'warn',t:'Визит не подтверждён клиентом больше 2 дней'});return f}
function marksOf(id){const out=[];const add=(p,at,what)=>{if(p&&p.lat!=null&&at)out.push({lat:p.lat,lng:p.lng,at,what})};
 S.shifts.filter(s=>s.masterId===id).forEach(s=>{add(s.start,s.startAt,'приход');if(s.endAt)add(s.end,s.endAt,'уход')});
 S.fuel.filter(r=>r.masterId===id).forEach(r=>add(r.loc,r.at,'заправка'));
 S.buys.filter(b=>b.masterId===id).forEach(b=>{add(b.loc,b.at,'закупка');if(b.delivered_lat!=null)add({lat:b.delivered_lat,lng:b.delivered_lng},b.dAt,'сдача закупки');if(b.left_lat!=null)add({lat:b.left_lat,lng:b.left_lng},b.lAt,'сдача остатка')});
 S.tickets.filter(t=>t.techId===id).forEach(t=>{add(t.gps.enroute,t.times.enroute,'выезд '+t.num);add(t.gps.onsite,t.times.onsite,'на месте '+t.num);add(t.gps.done,t.times.done,'завершение '+t.num)});
 return out.concat(S.track[id]||[]).sort((a,b)=>a.at-b.at)}
function teleports(id){const ms_=marksOf(id);const out=[];for(let i=1;i<ms_.length;i++){const a=ms_[i-1],b=ms_[i];const dt=(b.at-a.at)/36e5;if(dt<=0||dt>8)continue;const d=distM(a,b)/1000;if(d>3&&d/dt>130)out.push({lv:'bad',t:'Невозможное перемещение: '+n1(d)+' км за '+fDur(b.at-a.at)+' ('+a.what+' → '+b.what+')',at:b.at})}return out}
function todayStatus(m){const now=Date.now(),t0=dayStart(now),c=S.cfg;const sh=S.shifts.filter(s=>s.masterId===m.id&&s.startAt>=t0).sort((a,b)=>a.startAt-b.startAt)[0];
 const wk=[0,6].includes(new Date(now).getDay());const due=now>hmToTs(now,c.work_start)+(+c.grace_min||0)*60000;
 if(!sh){if(wk)return{code:'off',label:'Выходной',chip:'c-muted',flags:[]};return due?{code:'absent',label:'Не отметился',chip:'c-bad',flags:[{lv:'bad',t:'Нет отметки о приходе'}]}:{code:'notyet',label:'Ещё не пришёл',chip:'c-muted',flags:[]}}
 const fl=shiftFlags(sh);return sh.endAt?{code:'done',label:'Ушёл',chip:'c-muted',sh,flags:fl}:{code:'on',label:'На смене',chip:'c-ok',sh,flags:fl}}
const nowDoing=m=>{const t=S.tickets.find(x=>x.techId===m.id&&['enroute','onsite'].includes(x.status))||S.tickets.find(x=>x.techId===m.id&&x.status==='assigned');return t?ST[t.status][0]+' · '+t.num:''};
function allIssues(from){const out=[];const t0=dayStart(Date.now());
 S.alerts.filter(a=>a.at>=from).forEach(a=>out.push({lv:a.level,t:a.message,who:a.staff_id,at:a.at,kind:a.kind==='mock'?'Подмена GPS':a.kind==='device'?'Чужой телефон':'Сервер',go:['a-emp',a.staff_id]}));
 approved().forEach(m=>{const st=todayStatus(m);if(st.code==='absent')out.push({lv:'bad',t:'Нет отметки о приходе',who:m.id,at:hmToTs(t0,S.cfg.work_start),kind:'Смена',go:['a-emp',m.id]});
  teleports(m.id).filter(x=>x.at>=from).forEach(x=>out.push({lv:'bad',t:x.t,who:m.id,at:x.at,kind:'GPS',go:['a-emp',m.id]}));
  txOf(m.id).filter(x=>x.at>=from).forEach(x=>txFlags(x,m.id).forEach(f=>out.push({lv:f.lv,t:f.t,who:m.id,at:x.at,kind:'Выписка по карте',go:['a-fuel','']})));
  if(m.norm_claimed&&+m.norm_claimed!==+m.norm_approved)out.push({lv:'warn',t:'Расход машины ждёт утверждения: '+n1(m.norm_claimed),who:m.id,at:ms(m.created_at),kind:'Профиль',go:['a-emp',m.id]})});
 S.shifts.filter(s=>s.startAt>=from).forEach(s=>shiftFlags(s).forEach(f=>out.push({lv:f.lv,t:f.t,who:s.masterId,at:s.startAt,kind:'Смена',go:['a-emp',s.masterId]})));
 S.fuel.filter(r=>r.at>=from).forEach(r=>fuelFlags(r).forEach(f=>out.push({lv:f.lv,t:f.t,who:r.masterId,at:r.at,kind:'Заправка',go:['a-fuel','']})));
 S.tasks.filter(t=>ymdTs(t.day)>=dayStart(from)).forEach(t=>taskFlags(t).forEach(f=>out.push({lv:f.lv,t:f.t,who:t.masterId,at:t.dAt||ymdTs(t.day)+18*36e5,kind:'Задача',go:['a-tasks','']})));
 S.buys.filter(b=>b.at>=from||['bought','partial','delivered'].includes(b.status)).forEach(b=>buyFlags(b).forEach(f=>out.push({lv:f.lv,t:f.t+' ('+b.supplier+', '+money(b.amount)+')',who:b.masterId,at:b.at,kind:'Закупка',go:['a-buys','']})));
 S.tickets.filter(t=>(t.createdAt>=from||(t.times.done>=from))&&t.status!=='cancelled').forEach(t=>ticketFlags(t).forEach(f=>out.push({lv:f.lv,t:f.t,who:t.techId,at:t.times.done||t.times.onsite||t.createdAt,kind:'Заказ '+t.num,go:['a-order',t.id]})));
 const seen={};return out.filter(x=>{const k=x.who+'|'+x.t+'|'+dayStart(x.at);return seen[k]?false:(seen[k]=1)}).sort((a,b)=>((a.lv==='bad'?0:1)-(b.lv==='bad'?0:1))||(b.at-a.at))}
const todayIssues=()=>approved().filter(m=>todayStatus(m).flags.length).length;

/* ---------- общий интерфейс ---------- */
const kpi=(v,l,alert,go)=>go?'<button class="kpi go'+(alert?' alert':'')+'" data-act="kgo" data-v="'+h(go)+'"><b class="num">'+v+'</b><span>'+l+'</span><i class="kgo">открыть →</i></button>':'<div class="kpi'+(alert?' alert':'')+'"><b class="num">'+v+'</b><span>'+l+'</span></div>';
const chip=st=>{const s=ST[st]||ST.new;return '<span class="chip '+s[1]+'">'+s[0]+'</span>'};
const back=(l,to)=>'<button class="btn ghost sm" style="align-self:flex-start" data-act="nav" data-v="'+to+'">'+I.back+h(l)+'</button>';
const atop=(t,r)=>'<div class="atop"><h1>'+t+'</h1>'+(r||'')+'</div>';
function geoChip(mk,ref){if(!mk||mk.lat==null)return '<span class="chip c-warn">без координат</span>';const r=ref==='office'?(+S.cfg.office_radius||150):(+S.cfg.client_radius||200);
 if(mk.dist==null)return '<a class="chip c-muted" href="'+mapUrl(mk)+'" target="_blank" rel="noopener">на карте</a>';
 return '<a class="chip '+(mk.dist>r?'c-bad':'c-ok')+'" href="'+mapUrl(mk)+'" target="_blank" rel="noopener">'+fDist(mk.dist)+(ref==='office'?' от офиса':'')+'</a>'}
const flagCell=fl=>fl.length?fl.map(f=>'<span style="color:'+(f.lv==='bad'?'var(--bad)':'var(--warn)')+'">'+h(f.t)+'</span>').join('<br>'):'<span class="okv">нет</span>';
function issueList(a){if(!a.length)return '<div class="empty" style="padding:18px"><p>Отклонений нет.</p></div>';
 return '<div class="ilist">'+a.map(i=>{const m=tech(i.who);return '<button class="irow" data-act="ago" data-v="'+i.go[0]+'" data-id="'+h(i.go[1]||'')+'"><span class="sev '+(i.lv==='bad'?'bad':'warn')+'"></span><span class="grow"><b>'+h(i.t)+'</b><span class="tiny muted" style="display:block">'+h(m?m.name:'—')+' · '+h(i.kind)+' · '+fDay(i.at)+'</span></span></button>'}).join('')+'</div>'}
const PERS=[['today','Сегодня'],['week','7 дней'],['month','Месяц']];
const perFrom=p=>{const t0=dayStart(Date.now());return p==='today'?t0:p==='week'?t0-6*864e5:monthStart()};
const perSeg=()=>'<div class="seg" style="width:min(100%,360px)">'+PERS.map(x=>'<button class="'+(S.per===x[0]?'on':'')+'" data-act="per" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
const empSel=()=>'<select class="inp" id="f-emp" data-act="emp" style="width:min(100%,260px);padding:9px 12px;font-size:14px"><option value="">Все сотрудники</option>'+approved().map(m=>'<option value="'+h(m.id)+'"'+(S.empF===m.id?' selected':'')+'>'+h(m.name)+'</option>').join('')+'</select>';
const officeWarn=()=>office()?'':'<div class="flag warn">'+I.alert+'<span>Не задана точка офиса. Откройте «Настройки» и укажите координаты, иначе приход и уход не проверяются.</span></div>';

const ANAV=[['a-dash','Сводка','chart'],['a-day','Маршрут дня','route'],['a-tasks','Задачи','check'],['a-photos','Фото работ','camera'],['a-buys','Закупки','box'],['a-places','Места','pin'],['a-fuel','Топливо','fuel'],['a-shifts','Смены','clock'],['a-staff','Сотрудники','team'],['a-orders','Заявки','list'],['a-settings','Настройки','cog']];
function shell(body){const n=S.view.name;const cur={'a-issues':'a-dash','a-emp':'a-staff','a-order':'a-orders','a-new':'a-orders'}[n]||n;
 const cnt={'a-staff':S.staff.filter(m=>m.status==='pending').length,'a-orders':S.tickets.filter(t=>t.status==='new').length,'a-dash':todayIssues(),'a-tasks':S.tasks.filter(t=>!t.archived_at&&(t.status==='report'||t.disc_status==='open')).length,'a-buys':S.buys.filter(b=>['bought','partial','delivered'].includes(b.status)&&buyFlags(b).some(f=>f.lv==='bad')||b.status==='delivered').length};
 const MN=[['a-dash','Сводка','chart'],['a-day','Маршрут','route'],['a-buys','Закупки','box'],['a-photos','Фото','camera']];const inMN=MN.some(x=>x[0]===cur);
 const title=(ANAV.find(x=>x[0]===cur)||['','Arev Admin'])[1];
 const top='<header class="mtop"><span class="sunmark" aria-hidden="true"></span><b class="grow">'+h(title)+'</b>'+(installable()?'<button class="mtbtn" data-act="install">Установить</button>':'')+'<button class="mtbtn ic" data-act="reload" aria-label="Обновить данные">'+I.refresh+'</button></header>';
 const bot='<nav class="mnav" aria-label="Разделы">'+MN.map(i=>'<button class="'+(cur===i[0]?'on':'')+'" data-act="nav" data-v="'+i[0]+'">'+I[i[2]]+'<span>'+i[1]+'</span>'+(cnt[i[0]]?'<i>'+cnt[i[0]]+'</i>':'')+'</button>').join('')+'<button class="'+(!inMN?'on':'')+'" data-act="more">'+I.more+'<span>Ещё</span>'+(ANAV.filter(x=>!MN.some(y=>y[0]===x[0])).some(x=>cnt[x[0]])?'<i>•</i>':'')+'</button></nav>';
 return top+'<div class="adm"><aside class="side"><div class="brand"><span class="sunmark" aria-hidden="true"></span><div style="min-width:0"><b>'+h(S.cfg.company||'Arev Service')+'</b><small>Контроль сотрудников</small></div></div><nav class="nav">'+ANAV.map(i=>'<button class="'+(cur===i[0]?'on':'')+'" data-act="nav" data-v="'+i[0]+'">'+I[i[2]]+'<span class="lbl">'+i[1]+'</span>'+(cnt[i[0]]?'<span class="cnt">'+cnt[i[0]]+'</span>':'')+'</button>').join('')+'</nav><div class="foot"><button class="lnk" style="color:inherit" data-act="reload">Обновить данные</button><br><button class="lnk" style="color:inherit" data-act="logout">Выйти</button></div></aside><main class="amain">'+body+'</main></div>'+bot}
// установка как приложения
let installEvt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(S.loaded)render(true)});
const standalone=()=>window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||(window.navigator||{}).standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test((typeof navigator!=='undefined'&&navigator.userAgent)||'');
const installable=()=>!standalone()&&(!!installEvt||isIOS());

/* ---------- экраны ---------- */
function vLogin(){const f=S.form;return '<div class="loginwrap"><div class="card" style="max-width:420px;width:100%"><div class="row"><span class="sunmark"></span><h2>Arev Service</h2></div><p class="muted small">Вход в админку. Используйте свой e-mail, не номер сотрудника.</p>'+
 '<div class="field"><label for="l-em">E-mail</label><input id="l-em" class="inp" data-f="email" type="email" value="'+h(f.email||'')+'" autocomplete="email"></div><div class="field"><label for="l-pw">Пароль</label><input id="l-pw" class="inp" data-f="pw" type="password" value="'+h(f.pw||'')+'" autocomplete="current-password"></div>'+
 '<button class="btn primary block" data-act="login">Войти</button><button class="btn ghost block" data-act="signup">Создать аккаунт администратора</button></div></div>'}
function vClaim(){return '<div class="loginwrap"><div class="card" style="max-width:460px"><h2>Нет прав администратора</h2><p class="small">Вы вошли как '+h(S.session.user.email)+'. Если вы владелец и это первый вход, нажмите кнопку ниже. Она сработает только один раз, пока в системе нет ни одного администратора.</p><button class="btn primary block" data-act="claim">Стать администратором</button><button class="btn ghost block" data-act="logout">Выйти</button></div></div>'}

function dashCells(m,sh,t0){const gk=sh?shiftGps(sh):null;const ls=sh?longStops(sh):[];const wp=S.wph.filter(w=>w.masterId===m.id&&w.at>=t0).length;const nb=S.buys.filter(b=>b.masterId===m.id&&['bought','partial'].includes(b.status)).length;
 return '<td>'+(gk!=null?n1(gk):'—')+'</td><td class="'+(ls.length?'over':'')+'">'+(ls.length?ls.length+' · '+fDur(ls.reduce((a,x)=>a+x.dur,0)):sh?'нет':'—')+'</td><td class="'+(sh&&!wp&&Date.now()-sh.startAt>3*36e5?'over':'')+'">'+(sh||wp?wp:'—')+'</td><td class="'+(nb?'over':'')+'">'+(nb||'—')+'</td>'}
function dashCard(m,st,t0){const sh=st.sh;const gk=sh?shiftGps(sh):null;const ls=sh?longStops(sh):[];const wp=S.wph.filter(w=>w.masterId===m.id&&w.at>=t0).length;const nb=S.buys.filter(b=>b.masterId===m.id&&['bought','partial'].includes(b.status)).length;
 const tk=S.tasks.filter(t=>t.masterId===m.id&&t.day===ymd(t0)&&t.status!=='cancelled');const bad=st.flags.filter(f=>f.lv==='bad').length;
 const cell=(v,l,cls)=>'<span class="mc '+(cls||'')+'"><b>'+v+'</b><small>'+l+'</small></span>';
 return '<button class="mcard'+(bad?' bad':'')+'" data-act="day" data-id="'+h(m.id)+'"><span class="mrow"><span class="avatar">'+h(initials(m.name))+'</span><span class="grow"><b>'+h(m.name)+'</b><small>'+h(nowDoing(m)||(sh?(sh.endAt?'смена закончена в '+fHM(sh.endAt):'на смене'):st.label))+'</small></span><span class="chip '+st.chip+'">'+(sh?(sh.endAt?'ушёл':'с '+fHM(sh.startAt)):st.label)+'</span></span>'+
  (sh?'<span class="mgrid">'+cell(gk!=null?n1(gk):'—','км GPS')+cell(ls.length,'стоянки',ls.length?'w':'')+cell(wp,'фото',!wp&&Date.now()-sh.startAt>3*36e5?'w':'')+cell(tk.length?tk.filter(t=>t.status==='done').length+'/'+tk.length:nb,tk.length?'задачи':'не сдано',!tk.length&&nb?'b':'')+'</span>':'')+
  (st.flags.length?'<span class="mflags">'+st.flags.slice(0,3).map(f=>'<span class="'+f.lv+'">'+h(f.t)+'</span>').join('')+(st.flags.length>3?'<span class="muted">и ещё '+(st.flags.length-3)+'</span>':'')+'</span>':'')+'</button>'}
function vDash(){const now=Date.now(),t0=dayStart(now);const staff=approved();const rows=staff.map(m=>({m,st:todayStatus(m)}));
 const on=rows.filter(r=>r.st.code==='on').length;const lateAbs=rows.filter(r=>r.st.code==='absent'||r.st.flags.some(f=>/Опоздание/.test(f.t))).length;
 const act=S.tickets.filter(t=>['assigned','enroute','onsite'].includes(t.status)).length;const nw=S.tickets.filter(t=>t.status==='new').length;
 const fb=staff.map(m=>fuelBal(m.id,monthStart()));const fsum=fb.reduce((a,b)=>a+b.sum,0);const over=fb.filter(b=>b.bad).length;
 const iss=allIssues(t0-6*864e5);const bad=iss.filter(i=>i.lv==='bad').length;const tr=txRange();
 const ph=[];S.shifts.filter(s=>s.startAt>=monthStart()).forEach(s=>{ph.push(s.start.photo);if(s.end)ph.push(s.end.photo)});S.fuel.filter(r=>r.at>=monthStart()).forEach(r=>ph.push(r.photo));const chk=ph.filter(p=>S.checks[p]).length;
 const bOpen=S.buys.filter(b=>['bought','partial'].includes(b.status));const bLate=bOpen.filter(b=>buyFlags(b).some(f=>/уже/.test(f.t))).length;
 let s=atop('Сводка','<span class="muted">'+fDay(now)+', '+fHM(now)+'</span>')+officeWarn();
 s+='<div class="kgrid">'+kpi(on+' из '+staff.length,'на смене сейчас',false,'a-staff')+kpi(lateAbs,'опоздали или не пришли',lateAbs>0,'a-shifts|today')+kpi(act,'заказов в работе'+(nw?', '+nw+' новых':''),false,'a-orders|active')+kpi(bad,'серьёзных отклонений за 7 дней',bad>0,'a-issues')+kpi(money(fsum),'топливо за месяц'+(over?', перерасход у '+over:''),over>0,'a-fuel|month')+kpi(bOpen.length,'закупок не сдано'+(bLate?', просрочено '+bLate:''),bLate>0,'a-buys|open')+'</div>';
 s+='<div class="stack"><section class="card"><div class="row between"><h2>Сегодня</h2><span class="tiny muted">нажмите на сотрудника, чтобы открыть маршрут</span><span class="muted small">график '+h(String(S.cfg.work_start||'').slice(0,5))+'–'+h(String(S.cfg.work_end||'').slice(0,5))+'</span></div>'+
  '<div class="tblw flat only-d"><table class="tbl"><thead><tr><th>Сотрудник</th><th>Пришёл</th><th>Ушёл</th><th>Км по GPS</th><th>Долгие стоянки</th><th>Фото работ</th><th>Не сдано закупок</th><th class="l">Отклонения</th></tr></thead><tbody>'+
  (rows.length?rows.map(r=>'<tr class="click" data-act="day" data-id="'+h(r.m.id)+'"><td><b>'+h(r.m.name)+'</b></td><td>'+(r.st.sh?fHM(r.st.sh.startAt):'<span class="chip '+r.st.chip+'">'+r.st.label+'</span>')+'</td><td>'+(r.st.sh&&r.st.sh.endAt?fHM(r.st.sh.endAt):'—')+'</td>'+dashCells(r.m,r.st.sh,t0)+'<td class="l wrapc">'+flagCell(r.st.flags)+'</td></tr>').join(''):'<tr><td colspan="8" class="l muted">Сотрудников пока нет. Они регистрируются сами в приложении.</td></tr>')+'</tbody></table></div>'+
  '<div class="only-m mcards">'+(rows.length?rows.map(r=>dashCard(r.m,r.st,t0)).join(''):'<p class="muted small">Сотрудников пока нет.</p>')+'</div>'+
  '<div class="prot"><span class="label">Перекрёстные проверки за месяц</span><div class="row wrapx" style="gap:8px"><span class="chip '+(chk===ph.length?'c-ok':'c-warn')+'">ИИ проверил '+chk+' из '+ph.length+' фото</span><span class="chip '+(tr?'c-ok':'c-warn')+'">'+(tr?'Выписка по картам: '+fDay(tr.from)+' – '+fDay(tr.to-1):'Выписка по картам не загружена')+'</span></div></div></section>'+
  '<section class="card"><div class="row between"><h2>Требует внимания</h2><span class="muted small">7 дней</span></div>'+issueList(iss.slice(0,15))+(iss.length>15?'<button class="btn ghost sm" style="align-self:flex-start" data-act="kgo" data-v="a-issues">Все отклонения ('+iss.length+')</button>':'')+'</section></div>';
 return s}

function vStaff(){const pend=S.staff.filter(x=>x.status==='pending');const from=monthStart();
 let s=atop('Сотрудники','<span class="muted small">Сотрудник сам регистрируется в приложении на телефоне</span>');
 if(pend.length)s+='<section class="card"><div class="row between"><h2>Новые анкеты</h2><span class="chip c-warn">'+pend.length+'</span></div><div class="tblw flat"><table class="tbl"><thead><tr><th>Имя</th><th>Телефон</th><th class="l">Машина</th><th>Когда</th><th></th></tr></thead><tbody>'+
  pend.map(x=>'<tr><td><b>'+h(x.name)+'</b></td><td class="num" style="user-select:all">'+h(x.phone)+'</td><td class="l">'+h(x.car_model||'—')+(x.norm_claimed?' · '+n1(x.norm_claimed)+' '+fuelUnit(x)+'/100':'')+'</td><td>'+ago(ms(x.created_at))+'</td><td><div class="row" style="justify-content:flex-end"><button class="btn primary sm" data-act="approve" data-id="'+h(x.id)+'">Принять</button><button class="btn danger sm" data-act="reject" data-id="'+h(x.id)+'">Отклонить</button></div></td></tr>').join('')+'</tbody></table></div><p class="tiny muted">При приёме расход из анкеты утверждается автоматически. Сверьте его с паспортной нормой модели.</p></section>';
 const rows=approved().map(m=>{const sh=S.shifts.filter(x=>x.masterId===m.id&&x.startAt>=from);const fl=sh.reduce((a,x)=>a.concat(shiftFlags(x)),[]).concat(teleports(m.id).filter(x=>x.at>=from));
  const rated=S.tickets.filter(t=>t.techId===m.id&&t.rating);return {m,sh,late:fl.filter(f=>/Опоздание/.test(f.t)).length,bad:fl.filter(f=>f.lv==='bad').length+S.alerts.filter(a=>a.staff_id===m.id&&a.at>=from).length,b:fuelBal(m.id,from),st:todayStatus(m),avg:rated.length?(rated.reduce((a,t)=>a+t.rating,0)/rated.length).toFixed(1).replace('.',','):'—'}});
 s+='<section class="card"><div class="row between"><h2>Работают</h2><span class="muted small">показатели за месяц</span></div><div class="tblw flat"><table class="tbl"><thead><tr><th>Сотрудник</th><th class="l">Сегодня</th><th class="l">Машина</th><th>Карта</th><th>Смен</th><th>Опозданий</th><th>Серьёзных отклонений</th><th>Топливо: залито / положено</th><th>Рейтинг</th></tr></thead><tbody>'+
  (rows.length?rows.map(r=>'<tr class="click" data-act="ago" data-v="a-emp" data-id="'+h(r.m.id)+'"><td><b>'+h(r.m.name)+'</b><div class="tiny muted num">'+h(r.m.phone)+'</div></td><td class="l"><span class="chip '+r.st.chip+'">'+r.st.label+(r.st.sh?' '+fHM(r.st.sh.startAt):'')+'</span></td><td class="l">'+h(r.m.car_model||'не указана')+'<div class="tiny muted">'+(r.b.normOk?n1(r.b.norm)+' '+fuelUnit(r.m)+'/100 км':'<span style="color:var(--warn)">расход не утверждён</span>')+'</div></td><td>'+(cardOf(r.m)?'•• '+h(cardOf(r.m).slice(-4)):'<span style="color:var(--warn)">нет</span>')+'</td><td>'+r.sh.length+'</td><td class="'+(r.late?'over':'')+'">'+r.late+'</td><td class="'+(r.bad?'over':'')+'">'+r.bad+'</td><td class="'+(r.b.bad?'over':'')+'">'+n1(r.b.filled)+' / '+n1(r.b.allowed)+' '+r.b.unit+'</td><td>'+r.avg+'</td></tr>').join(''):'<tr><td colspan="9" class="l muted">Пока никого нет</td></tr>')+'</tbody></table></div></section>';
 const off=S.staff.filter(x=>x.status==='blocked'||x.status==='rejected');
 if(off.length)s+='<section class="card tight"><h2>Отклонённые и приостановленные</h2>'+off.map(x=>'<div class="row between"><span>'+h(x.name)+' <span class="muted small">'+(x.status==='blocked'?'приостановлен':'отклонён')+'</span></span><button class="btn ghost sm" data-act="restore" data-id="'+h(x.id)+'">Вернуть</button></div>').join('')+'</section>';
 return s}

function shiftRows(list,showName){return '<div class="tblw flat"><table class="tbl"><thead><tr><th>День</th>'+(showName?'<th class="l">Сотрудник</th>':'')+'<th>Приход</th><th>Одометр утром</th><th>Уход</th><th>Одометр вечером</th><th>Часов</th><th>Км по заказам</th><th>Км по GPS</th><th>Км по одометру</th><th class="l">Отклонения</th></tr></thead><tbody>'+
 (list.length?list.map(x=>{const m=tech(x.masterId);const ff=shiftFlags(x);
  return '<tr><td>'+fDay(x.startAt)+'</td>'+(showName?'<td class="l"><button class="lnk" data-act="ago" data-v="a-emp" data-id="'+h(x.masterId)+'">'+h(m?m.name:'—')+'</button></td>':'')+
  '<td>'+fHM(x.startAt)+'</td><td><div class="odo">'+thumb(x.start.photo)+'<div><span class="num">'+x.start.odo.toLocaleString('ru-RU')+'</span><br>'+geoChip(x.start,'office')+'</div></div></td>'+
  '<td>'+(x.endAt?fHM(x.endAt):'<span class="chip c-ok">идёт</span>')+'</td><td>'+(x.end?'<div class="odo">'+thumb(x.end.photo)+'<div><span class="num">'+x.end.odo.toLocaleString('ru-RU')+'</span><br>'+geoChip(x.end,'office')+'</div></div>':'—')+'</td>'+
  '<td>'+(x.endAt?n1((x.endAt-x.startAt)/36e5):'—')+'</td><td>'+n1(routeKm(x))+'</td><td class="'+(ff.some(f=>/по GPS/.test(f.t))?'over':'')+'">'+(shiftGps(x)!=null?n1(shiftGps(x)):'—')+'</td><td class="'+(ff.some(f=>/Пробег|По одометру/.test(f.t))?'over':'')+'">'+(odoKm(x)!=null?odoKm(x):'—')+'</td><td class="l wrapc">'+flagCell(ff)+'</td></tr>'}).join(''):'<tr><td colspan="11" class="l muted">Смен за этот период нет</td></tr>')+'</tbody></table></div>'}
function aiBar(){return '<div class="card tight aibar"><div class="row between wrapx"><div><b>Проверка фото ИИ</b><div class="small muted">ИИ читает пробег на фото одометра и данные чеков, ищет фото экрана вместо реальной панели и сравнивает с тем, что ввёл сотрудник.</div></div><button class="btn dark sm" data-act="ai"'+(S.busy?' disabled':'')+'>'+(S.busy==='ai'?'Проверяю…':'Проверить новые фото')+'</button></div></div>'}
function vShifts(){const from=perFrom(S.per);const list=S.shifts.filter(x=>x.startAt>=from&&(!S.empF||x.masterId===S.empF)).sort((a,b)=>b.startAt-a.startAt);
 return atop('Смены','<div class="row wrapx">'+empSel()+perSeg()+'</div>')+officeWarn()+aiBar()+shiftRows(list,true)}

/* --- выписка --- */
const KEYS={date:/дата|date/i,time:/^время|time/i,card:/карт|card|pan/i,liters:/литр|кол-?во|количеств|объ[её]м|qty|quantit|volume|liter/i,sum:/сумм|amount|стоимост|total|sum/i,station:/азс|станц|station|адрес|точк|место/i,product:/товар|продукт|вид топлива|услуг|product|наименов|номенкл/i};
function guessMap(hd){const m={};Object.keys(KEYS).forEach(k=>{m[k]=hd.findIndex(x=>KEYS[k].test(String(x||'')))});if(m.time===m.date)m.time=-1;return m}
const numOf=v=>{if(typeof v==='number')return v;return parseFloat(String(v||'').replace(/\s| /g,'').replace(/[^\d,.\-]/g,'').replace(',','.'))};
function dateOf(v,t){const tt=t instanceof Date?p2(t.getHours())+':'+p2(t.getMinutes()):t;if(v instanceof Date&&!isNaN(v)){const d=new Date(v.getTime());const m=String(tt||'').match(/(\d{1,2}):(\d{2})/);if(m)d.setHours(+m[1],+m[2],0,0);return d.getTime()}
 const s=String(v||'')+(tt?' '+tt:'');let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:\D+(\d{1,2}):(\d{2}))?/);if(m)return new Date(+(m[3].length===2?'20'+m[3]:m[3]),+m[2]-1,+m[1],+(m[4]||12),+(m[5]||0)).getTime();
 m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);if(m)return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||12),+(m[5]||0)).getTime();return null}
function parseTxRow(r,mp){const g=k=>mp[k]>=0?r[mp[k]]:'';const at=dateOf(g('date'),mp.time>=0?g('time'):null);const liters=numOf(g('liters'));if(!at||!(liters>0))return null;
 return{at,liters:Math.round(liters*100)/100,amount:Math.round(numOf(g('sum'))||0),card:String(g('card')||'').trim(),station:String(g('station')||'').trim().slice(0,80),product:String(g('product')||'').trim().slice(0,60)}}
function strHash(s){let x=5381;for(let i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))>>>0;return x.toString(36)}
async function readSheet(file){const buf=await file.arrayBuffer();let wb;
 if(/\.csv$|\.txt$/i.test(file.name)){let txt=new TextDecoder('utf-8').decode(buf);if(txt.indexOf('�')>=0)try{txt=new TextDecoder('windows-1251').decode(buf)}catch(e){}wb=XLSX.read(txt,{type:'string',cellDates:true})}
 else wb=XLSX.read(buf,{type:'array',cellDates:true});
 const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
 const hi=rows.findIndex(r=>r.filter(x=>typeof x==='string'&&x.trim()&&isNaN(+x)).length>=3);const hd=(rows[hi>=0?hi:0]||[]).map(x=>String(x||'').trim());
 return{name:file.name,header:hd,rows:rows.slice((hi>=0?hi:0)+1).filter(r=>r.some(x=>String(x).trim())),map:guessMap(hd)}}
function impPanel(){const im=S.imp;if(!im)return '';const F=[['date','Дата'],['time','Время (если отдельно)'],['card','Номер карты'],['liters','Литры / кубы'],['sum','Сумма'],['station','АЗС'],['product','Товар / вид топлива']];
 const opt=sel=>'<option value="-1">—</option>'+im.header.map((x,i)=>'<option value="'+i+'"'+(sel===i?' selected':'')+'>'+h(x||('Столбец '+(i+1)))+'</option>').join('');
 const prev=im.rows.slice(0,5).map(r=>parseTxRow(r,im.map)).filter(Boolean);
 return '<section class="card"><div class="row between"><h2>Загрузка выписки: '+h(im.name)+'</h2><button class="btn ghost sm" data-act="impcancel">Отмена</button></div><p class="small muted">Проверьте, какие столбцы чему соответствуют. Строк в файле: '+im.rows.length+'.</p>'+
 '<div class="cols">'+F.map(x=>'<div class="field"><label>'+x[1]+'</label><select class="inp" data-act="impmap" data-k="'+x[0]+'" style="padding:9px 12px;font-size:14px">'+opt(im.map[x[0]])+'</select></div>').join('')+'</div>'+
 '<div class="tblw flat"><table class="tbl"><thead><tr><th>Дата</th><th>Карта</th><th>Объём</th><th>Сумма</th><th class="l">АЗС</th><th class="l">Товар</th></tr></thead><tbody>'+(prev.length?prev.map(t=>'<tr><td>'+fT(t.at)+'</td><td>'+h(t.card)+'</td><td>'+n1(t.liters)+'</td><td>'+money(t.amount)+'</td><td class="l">'+h(t.station)+'</td><td class="l">'+h(t.product)+'</td></tr>').join(''):'<tr><td colspan="6" class="l" style="color:var(--bad)">Не удалось разобрать строки. Укажите столбцы даты и объёма.</td></tr>')+'</tbody></table></div>'+
 '<button class="btn primary" style="align-self:flex-start" data-act="impsave"'+(prev.length&&!S.busy?'':' disabled')+'>Загрузить '+im.rows.length+' строк</button></section>'}
function vFuel(){const from=perFrom(S.per);const staff=approved().filter(m=>!S.empF||m.id===S.empF);const rows=staff.map(m=>Object.assign({m},fuelBal(m.id,from)));const tot=rows.reduce((a,r)=>a+r.sum,0);const tr=txRange();
 let s=atop('Топливо','<div class="row wrapx">'+empSel()+perSeg()+'</div>');
 s+='<section class="card tight"><div class="row between wrapx"><div><b>Выписка по топливным картам</b><div class="small muted">'+(tr?'Загружено '+S.tx.length+' операций за '+fDay(tr.from)+' – '+fDay(tr.to-1)+'. Литры из выписки заменяют то, что вводят сотрудники.':'Главная защита от занижения литров. Загрузите выписку от поставщика карт (Excel или CSV) и укажите номер карты у каждого сотрудника.')+'</div></div><button class="btn dark sm" data-act="imppick">'+I.plus+'Загрузить выписку</button></div></section>';
 s+=impPanel()+aiBar();
 s+='<section class="card"><h2>Баланс</h2><div class="tblw flat"><table class="tbl"><thead><tr><th>Сотрудник</th><th>Смен</th><th>Км по GPS</th><th>Км по одометру</th><th>Км вне смен</th><th>Расход</th><th>Факт. расход</th><th>Положено</th><th>Залито</th><th>Разница</th><th>Сумма</th><th>Источник</th></tr></thead><tbody>'+
  rows.map(r=>'<tr class="click" data-act="ago" data-v="a-emp" data-id="'+h(r.m.id)+'"><td><b>'+h(r.m.name)+'</b></td><td>'+r.days+'</td><td>'+n1(r.gk)+'</td><td>'+n1(r.ok)+'</td><td class="'+(r.off>50?'over':'')+'">'+n1(r.off)+'</td><td>'+(r.normOk?n1(r.norm)+' '+r.unit+'/100':'<span style="color:var(--warn)">не утверждён</span>')+'</td><td>'+(r.fact!=null?n1(r.fact):'—')+'</td><td>'+n1(r.allowed)+' '+r.unit+'</td><td>'+n1(r.filled)+' '+r.unit+'</td><td class="'+(r.bad?'over':'okv')+'">'+(r.over>0?'+':'')+n1(r.over)+' '+r.unit+'</td><td>'+money(r.sum)+'</td><td>'+(r.src==='выписка'?'<span class="chip c-ok">выписка</span>':'<span class="chip c-warn">со слов</span>')+'</td></tr>').join('')+
  '<tr class="tot"><td>Итого</td><td colspan="9"></td><td>'+money(tot)+'</td><td></td></tr></tbody></table></div><p class="tiny muted">Положено = км по GPS-треку смен × утверждённый расход (если трека нет — км по заказам). Км вне смен: разница одометра между вечером и следующим утром, это личные поездки. Факт. расход = залито / км по одометру × 100.</p></section>';
 const txl=[];staff.forEach(m=>txOf(m.id).filter(x=>x.at>=from).forEach(x=>{const f=txFlags(x,m.id);if(f.length)txl.push({x,m,f})}));txl.sort((a,b)=>b.x.at-a.x.at);
 if(tr)s+='<section class="card"><h2>Расхождения с выпиской</h2>'+(txl.length?'<div class="tblw flat"><table class="tbl"><thead><tr><th>Дата</th><th class="l">Сотрудник</th><th>Объём</th><th>Сумма</th><th class="l">АЗС</th><th class="l">Что не так</th></tr></thead><tbody>'+txl.map(r=>'<tr><td>'+fDay(r.x.at)+', '+fHM(r.x.at)+'</td><td class="l">'+h(r.m.name)+'</td><td>'+n1(r.x.liters)+' '+fuelUnit(r.m)+'</td><td>'+money(r.x.amount)+'</td><td class="l">'+h(r.x.station||'')+'</td><td class="l wrapc">'+flagCell(r.f)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="small okv">Все операции по картам совпадают с приложением.</p>')+'</section>';
 const fl=S.fuel.filter(r=>r.at>=from&&staff.some(m=>m.id===r.masterId)).sort((a,b)=>b.at-a.at);
 s+='<section class="card"><h2>Заправки в приложении</h2><div class="tblw flat"><table class="tbl"><thead><tr><th>Дата</th><th class="l">Сотрудник</th><th>Чек</th><th>Объём</th><th>Сумма</th><th>Где</th><th class="l">Отклонения</th></tr></thead><tbody>'+
  (fl.length?fl.map(r=>{const m=tech(r.masterId);return '<tr><td>'+fDay(r.at)+', '+fHM(r.at)+'</td><td class="l">'+h(m?m.name:'—')+'</td><td>'+thumb(r.photo)+'</td><td>'+n1(r.liters)+' '+fuelUnit(m)+'</td><td>'+money(r.sum)+'</td><td>'+(r.loc?'<a class="chip c-muted" href="'+mapUrl(r.loc)+'" target="_blank" rel="noopener">на карте</a>':'—')+'</td><td class="l wrapc">'+flagCell(fuelFlags(r))+'</td></tr>'}).join(''):'<tr><td colspan="7" class="l muted">Заправок за этот период нет</td></tr>')+'</tbody></table></div></section>';
 return s}

function vEmp(){const m=tech(S.view.p.id);if(!m)return back('Сотрудники','a-staff')+'<div class="empty">Сотрудник не найден</div>';const from=monthStart();const f=S.form;
 const sh=S.shifts.filter(x=>x.masterId===m.id&&x.startAt>=from).sort((a,b)=>b.startAt-a.startAt);const b=fuelBal(m.id,from);const st=todayStatus(m);
 const fl=sh.reduce((a,x)=>a.concat(shiftFlags(x)),[]);const tp=teleports(m.id).filter(x=>x.at>=from);const al=S.alerts.filter(a=>a.staff_id===m.id&&a.at>=from);const hours=sh.filter(x=>x.endAt).reduce((a,x)=>a+(x.endAt-x.startAt)/36e5,0);
 const orders=S.tickets.filter(t=>t.techId===m.id).slice(0,15);const fuel=S.fuel.filter(r=>r.masterId===m.id&&r.at>=from);
 let s=back('Сотрудники','a-staff')+'<div class="atop"><div class="row"><span class="avatar" style="width:52px;height:52px;font-size:18px">'+h(initials(m.name))+'</span><div><h1>'+h(m.name)+'</h1><div class="muted small"><span class="num" style="user-select:all">'+h(m.phone)+'</span> · '+h(m.car_model||'машина не указана')+(m.car_plate?' · '+h(m.car_plate):'')+(m.tank?' · бак '+m.tank:'')+'</div></div></div><div class="row wrapx"><button class="btn dark sm" data-act="day" data-id="'+h(m.id)+'">'+I.route+'Маршрут за сегодня</button><span class="chip '+st.chip+'">Сегодня: '+st.label+'</span>'+(m.status==='approved'?'<button class="btn danger sm" data-act="block" data-id="'+h(m.id)+'">Приостановить</button>':'<button class="btn ghost sm" data-act="restore" data-id="'+h(m.id)+'">Вернуть</button>')+'</div></div>';
 s+='<div class="kgrid">'+kpi(sh.length,'смен в этом месяце')+kpi(n1(hours),'часов отработано')+kpi(fl.filter(x=>/Опоздание/.test(x.t)).length,'опозданий',fl.some(x=>/Опоздание/.test(x.t)))+kpi(fl.filter(x=>x.lv==='bad').length+tp.length+al.length,'серьёзных отклонений',fl.some(x=>x.lv==='bad')||tp.length||al.length)+kpi(n1(b.filled)+' / '+n1(b.allowed)+' '+b.unit,'топливо: залито / положено ('+b.src+')',b.bad)+'</div>';
 s+='<section class="card"><h2>Настройки контроля</h2><div class="cols"><div class="field"><label for="e-card">Последние 4 цифры топливной карты</label><div class="row"><input id="e-card" class="inp num" inputmode="numeric" maxlength="8" data-f="card" value="'+h(f.card!=null?f.card:(m.card_last4||''))+'" placeholder="1234"><button class="btn ghost sm" data-act="setcard" data-id="'+h(m.id)+'">Сохранить</button></div></div>'+
  '<div class="field"><label for="e-norm">Утверждённый расход, '+fuelUnit(m)+'/100 км</label><div class="row"><input id="e-norm" class="inp num" inputmode="decimal" data-f="norm" value="'+h(f.norm!=null?f.norm:(m.norm_approved||''))+'" placeholder="'+h(m.norm_claimed||'')+'"><button class="btn ghost sm" data-act="setnorm" data-id="'+h(m.id)+'">Утвердить</button></div>'+(m.norm_claimed&&+m.norm_claimed!==+m.norm_approved?'<p class="tiny" style="color:var(--warn)">Сотрудник указал '+n1(m.norm_claimed)+'. Сверьте с паспортной нормой модели.</p>':'')+'</div>'+
  '<div class="field"><label>Телефон сотрудника</label><div class="row wrapx"><span class="small muted">'+(m.device_id?'привязан':'не привязан')+'</span><button class="btn ghost sm" data-act="resetdev" data-id="'+h(m.id)+'">Разрешить вход с нового телефона</button></div></div>'+
  '<div class="field"><label for="e-pin">Новый PIN-код (если сотрудник забыл)</label><div class="row"><input id="e-pin" class="inp num" inputmode="numeric" maxlength="12" data-f="pin" value="'+h(f.pin||'')+'" placeholder="6 цифр"><button class="btn ghost sm" data-act="resetpin" data-id="'+h(m.id)+'">Задать</button></div></div></div></section>';
 if(al.length||tp.length)s+='<section class="card tight"><h2>Тревоги</h2>'+al.map(a=>'<div class="flag '+(a.level==='bad'?'bad':'warn')+'">'+I.alert+'<span>'+fT(a.at)+': '+h(a.message)+'</span></div>').join('')+tp.map(x=>'<div class="flag bad">'+I.alert+'<span>'+fT(x.at)+': '+h(x.t)+'. Возможна подмена GPS</span></div>').join('')+'</section>';
 s+='<section class="card"><h2>Смены за месяц</h2>'+shiftRows(sh,false)+'</section>';
 const st7=S.shifts.filter(x=>x.masterId===m.id&&x.startAt>=dayStart(Date.now())-6*864e5).sort((a,b)=>b.startAt-a.startAt).map(x=>({x,stops:stopsOf(m.id,x.startAt,x.endAt||Date.now())}));const lim=(+S.cfg.long_stop_min||30)*60000;
 const PK={office:'c-muted',client:'c-ok',shop:'c-info',fuel:'c-info',unknown:'c-warn'};
 s+='<section class="card"><div class="row between"><h2>Стоянки за 7 дней</h2><span class="muted small">от '+(+S.cfg.stop_min||20)+' мин по GPS-треку</span></div>'+(st7.some(r=>r.stops.length)?'<div class="tblw flat"><table class="tbl"><thead><tr><th>День</th><th>Время</th><th>Сколько</th><th class="l">Где</th><th>Км по GPS за смену</th></tr></thead><tbody>'+
  st7.map(r=>r.stops.map((z,i)=>'<tr><td>'+(i?'':fDay(r.x.startAt))+'</td><td>'+fHM(z.at)+'–'+fHM(z.end)+'</td><td class="'+(z.place.k==='unknown'&&z.dur>=lim?'over':'')+'">'+fDur(z.dur)+'</td><td class="l"><a class="chip '+PK[z.place.k]+'" href="'+mapUrl(z)+'" target="_blank" rel="noopener">'+h(z.place.t)+'</a>'+(z.gap?' <span class="tiny muted">возможно, пропал сигнал</span>':'')+(z.place.k==='unknown'?' <button class="lnk tiny" data-act="addplace" data-lat="'+z.lat+'" data-lng="'+z.lng+'">+ добавить место</button>':'')+'</td><td>'+(i?'':(shiftGps(r.x)!=null?n1(shiftGps(r.x)):'—'))+'</td></tr>').join('')).join('')+'</tbody></table></div>':'<p class="muted small">Стоянок нет или маршрут не записывался.</p>')+'</section>';
 const mb=S.buys.filter(b=>b.masterId===m.id&&(b.at>=from||['bought','partial','delivered'].includes(b.status))).sort((a,b)=>b.at-a.at);
 if(mb.length)s+='<section class="card"><h2>Закупки</h2>'+buyRows(mb,false)+'</section>';
 s+='<div class="cols2"><section class="card"><h2>Заправки за месяц</h2>'+(fuel.length?'<div class="tblw flat"><table class="tbl"><thead><tr><th>Дата</th><th>Чек</th><th>Объём</th><th>Сумма</th><th class="l">Отклонения</th></tr></thead><tbody>'+fuel.map(r=>'<tr><td>'+fDay(r.at)+', '+fHM(r.at)+'</td><td>'+thumb(r.photo)+'</td><td>'+n1(r.liters)+' '+fuelUnit(m)+'</td><td>'+money(r.sum)+'</td><td class="l wrapc">'+flagCell(fuelFlags(r))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted small">Заправок нет.</p>')+'</section>'+
  '<section class="card"><h2>Заказы</h2>'+(orders.length?'<div class="tblw flat"><table class="tbl"><thead><tr><th>№</th><th class="l">Работа</th><th class="l">Статус</th><th>Сумма</th><th class="l">Отклонения</th></tr></thead><tbody>'+orders.map(t=>'<tr class="click" data-act="ago" data-v="a-order" data-id="'+h(t.id)+'"><td>'+h(t.num)+'</td><td class="l">'+h(CATS[t.category]||t.category)+'</td><td class="l">'+chip(t.status)+'</td><td>'+money(t.price)+'</td><td class="l wrapc">'+flagCell(ticketFlags(t))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted small">Заказов пока нет.</p>')+'</section></div>';
 return s}

function vOrders(){const flt=S.filter;const all=S.tickets;let list=all;
 if(flt==='active')list=all.filter(t=>ACTIVE.includes(t.status)||t.status==='done');else if(flt==='new')list=all.filter(t=>t.status==='new');else if(flt==='flags')list=all.filter(t=>t.status!=='cancelled'&&ticketFlags(t).length);else if(flt==='done')list=all.filter(t=>['done','closed'].includes(t.status));
 const F=[['active','Активные'],['new','Новые'],['flags','С отклонениями'],['done','Выполненные'],['all','Все']];
 return atop('Заявки','<div class="row wrapx"><div class="filters">'+F.map(x=>'<button class="'+(flt===x[0]?'on':'')+'" data-act="filter" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div><button class="btn primary sm" data-act="nav" data-v="a-new">'+I.plus+'Новая заявка</button></div>')+
 '<div class="tblw"><table class="tbl"><thead><tr><th>№</th><th>Создана</th><th class="l">Клиент</th><th class="l">Адрес</th><th class="l">Работа</th><th class="l">Сотрудник</th><th class="l">Статус</th><th>Сумма</th><th class="l">Отклонения</th></tr></thead><tbody>'+
 (list.length?list.map(t=>{const m=tech(t.techId);return '<tr class="click" data-act="ago" data-v="a-order" data-id="'+h(t.id)+'"><td>'+h(t.num)+(t.urgent?' <span class="chip c-bad">срочно</span>':'')+'</td><td>'+fT(t.createdAt)+'</td><td class="l">'+h(t.client_name)+'</td><td class="l" style="max-width:220px;white-space:normal">'+h(t.address)+'</td><td class="l">'+h(CATS[t.category]||t.category)+'</td><td class="l">'+(m?h(m.name):'<span style="color:var(--info)">не назначен</span>')+'</td><td class="l">'+chip(t.status)+'</td><td>'+(t.price?money(t.price):t.est_min?'<span class="muted">'+money(t.est_min)+'–'+money(t.est_max)+'</span>':'—')+'</td><td class="l wrapc">'+flagCell(t.status==='cancelled'?[]:ticketFlags(t))+'</td></tr>'}).join(''):'<tr><td colspan="9" class="l muted">В этом списке пусто</td></tr>')+'</tbody></table></div>'}
function vNew(){const f=S.form;if(!f.init){Object.assign(f,{init:1,cat:'inverter',urgent:false})}
 return back('Заявки','a-orders')+atop('Новая заявка')+'<section class="card" style="max-width:760px"><div class="cols">'+
 '<div class="field"><label for="n-name">Имя клиента</label><input id="n-name" class="inp" data-f="cname" value="'+h(f.cname||'')+'"></div><div class="field"><label for="n-phone">Телефон</label><input id="n-phone" class="inp" data-f="cphone" value="'+h(f.cphone||'')+'" placeholder="+374 __ ___ ___"></div></div>'+
 '<div class="field"><label for="n-addr">Адрес станции</label><input id="n-addr" class="inp" data-f="addr" value="'+h(f.addr||'')+'"></div>'+
 '<div class="field"><label for="n-ll">Координаты (из Google Maps: нажмите на точку и скопируйте цифры)</label><input id="n-ll" class="inp" data-f="ll" value="'+h(f.ll||'')+'" placeholder="40.18110, 44.51360"><p class="tiny muted">Нужны, чтобы проверять, что сотрудник действительно приехал к клиенту.</p></div>'+
 '<div class="cols"><div class="field"><label for="n-cat">Что случилось</label><select id="n-cat" class="inp" data-f="cat">'+Object.keys(CATS).map(k=>'<option value="'+k+'"'+(f.cat===k?' selected':'')+'>'+CATS[k]+'</option>').join('')+'</select></div><div class="field"><label for="n-err">Код ошибки инвертора</label><input id="n-err" class="inp" data-f="err" value="'+h(f.err||'')+'"></div>'+
 '<div class="field"><label for="n-min">Оценка от, ֏</label><input id="n-min" class="inp num" type="number" data-f="emin" value="'+h(f.emin||'')+'"></div><div class="field"><label for="n-max">Оценка до, ֏</label><input id="n-max" class="inp num" type="number" data-f="emax" value="'+h(f.emax||'')+'"></div></div>'+
 '<div class="field"><label for="n-desc">Описание</label><textarea id="n-desc" class="inp" data-f="desc">'+h(f.desc||'')+'</textarea></div>'+
 '<label class="toggle small" for="n-urg"><input type="checkbox" id="n-urg" data-act="urg"'+(f.urgent?' checked':'')+'><span>Срочно</span></label>'+
 '<button class="btn primary" style="align-self:flex-start" data-act="createorder"'+(S.busy?' disabled':'')+'>Создать заявку</button></section>'}
function vOrder(){const t=T(S.view.p.id);if(!t)return back('Заявки','a-orders')+'<div class="empty">Заявка не найдена</div>';const tm=t.times,g=t.gps;const fl=ticketFlags(t);const ph=S.tphotos[t.id]||[];
 const ev=[['Заявка создана',t.createdAt,null],['Сотрудник взял заказ',tm.assigned,null],['Выехал',tm.enroute,g.enroute],['На месте',tm.onsite,g.onsite],['Работа завершена',tm.done,g.done],['Подтверждено'+(t.confirmed_by==='admin'?' (по звонку)':''),tm.closed,null]].filter(e=>e[1]);
 let L='<section class="card tight"><div class="row between"><span class="label">'+h(t.num)+'</span>'+chip(t.status)+'</div><h2>'+h(CATS[t.category]||t.category)+(t.urgent?' <span class="chip c-bad">срочно</span>':'')+'</h2>'+
  '<dl class="kv"><dt>Клиент</dt><dd>'+h(t.client_name)+'</dd><dt>Телефон</dt><dd class="num" style="user-select:all">'+h(t.client_phone)+'</dd><dt>Адрес</dt><dd>'+h(t.address)+(t.loc?' · <a href="'+mapUrl(t.loc)+'" target="_blank" rel="noopener">карта</a>':' · <span style="color:var(--warn)">нет точки</span>')+'</dd><dt>Оценка</dt><dd class="num">'+(t.est_min?money(t.est_min)+' – '+money(t.est_max):'—')+'</dd><dt>Итог</dt><dd class="num"><b>'+money(t.price)+'</b></dd>'+(t.rating?'<dt>Оценка клиента</dt><dd style="color:var(--warn)">'+'★'.repeat(t.rating)+'</dd>':'')+'</dl>'+(t.descr?'<p class="small">'+h(t.descr)+'</p>':'')+(t.err_code?'<p class="small">Код ошибки: <b>'+h(t.err_code)+'</b></p>':'')+(t.review?'<p class="small muted">Отзыв: '+h(t.review)+'</p>':'')+'</section>';
 L+='<section class="card tight"><span class="label">Сотрудник</span><select class="inp" id="m-assign" data-act="assign"'+(['done','closed','cancelled'].includes(t.status)?' disabled':'')+'><option value="">— не назначен —</option>'+approved().map(x=>'<option value="'+h(x.id)+'"'+(t.techId===x.id?' selected':'')+'>'+h(x.name)+'</option>').join('')+'</select>'+(t.status==='new'?'<p class="tiny muted">Заказ видят все сотрудники на смене. Можно назначить вручную.</p>':'')+((t.refusals||[]).length?'<p class="tiny" style="color:var(--warn)">Отказы: '+t.refusals.map(r=>h((tech(r.by)||{}).name||'сотрудник')+' в '+fHM(ms(r.at))).join(', ')+'</p>':'')+'</section>';
 if(t.status==='done')L+='<section class="card tight"><span class="label">Подтверждение визита</span><p class="small">Позвоните клиенту: был ли мастер, всё ли сделано, сколько заплатили.</p><div class="row wrapx"><select class="inp" id="o-rate" data-f="rate" style="width:auto">'+[5,4,3,2,1].map(n=>'<option value="'+n+'"'+(+S.form.rate===n?' selected':'')+'>'+'★'.repeat(n)+'</option>').join('')+'</select><button class="btn primary sm" data-act="confirm">Клиент подтвердил</button><button class="btn danger sm" data-act="dispute">Мастера не было</button></div></section>';
 let R='<section class="card tight"><span class="label">Контроль выезда</span>'+(fl.length?fl.map(f=>'<div class="flag '+f.lv+'">'+I.alert+'<span>'+h(f.t)+'</span></div>').join(''):tm.onsite?'<div class="flag note" style="background:var(--ok-soft);color:var(--ok)">'+I.check+'<span>Отклонений нет</span></div>':'<p class="small muted">Появится после отметок сотрудника.</p>')+'</section>';
 R+='<section class="card tight"><span class="label">Хронология</span><div class="tl">'+ev.map(e=>'<div class="tl-i"><time>'+fHM(e[1])+'</time><span>'+e[0]+' '+(e[2]?geoChip(e[2],'obj'):'')+'</span></div>').join('')+'</div></section>';
 if(ph.length)R+='<section class="card tight"><span class="label">Фото</span>'+(t.work?'<p class="small">'+h(t.work)+'</p>':'')+'<div class="row wrapx" style="gap:10px">'+ph.map(p=>'<div style="display:flex;flex-direction:column;gap:3px;align-items:center">'+thumb(p.path,'thumb lg')+'<span class="tiny muted">'+(p.kind==='before'?'до':p.kind==='after'?'после':'клиент')+' '+fHM(p.at)+'</span></div>').join('')+'</div></section>';
 const tb=S.buys.filter(b=>b.ticket_id===t.id&&b.status!=='cancelled');
 if(tb.length)R+='<section class="card tight"><span class="label">Докупленный материал</span>'+tb.map(b=>'<div class="row between wrapx" style="align-items:flex-start"><div class="small"><b>'+h(b.supplier)+' · '+money(b.amount)+'</b><br>'+(b.lines||[]).map((l,i)=>lineTxt(l)+(b.used_lines?' <span class="muted">(использовано '+n1(b.used_lines[i])+')</span>':'')).join('<br>')+'</div><div class="row" style="gap:6px">'+thumb(b.photo)+(b.delivered_photo?thumb(b.delivered_photo):'')+'</div></div>'+flagCell(buyFlags(b))).join('<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">')+(t.status==='done'?'<p class="tiny muted">При звонке спросите клиента, установлен ли этот материал.</p>':'')+'</section>';
 if(!['closed','cancelled'].includes(t.status))R+='<button class="btn danger" style="align-self:flex-start" data-act="cancel">Отменить заявку</button>';
 return back('Заявки','a-orders')+'<div class="cols2"><div class="stack">'+L+'</div><div class="stack">'+R+'</div></div>'}

const dChip=(lat,lng,dist,rad,what)=>lat==null?'<span class="chip c-warn">без координат</span>':'<a class="chip '+(dist==null?'c-muted':dist>rad?'c-bad':'c-ok')+'" href="'+mapUrl({lat,lng})+'" target="_blank" rel="noopener">'+(dist==null?'на карте':fDist(dist)+' от '+what)+'</a>';
function buyDeliv(b){const c=S.cfg,radO=+c.office_radius||150,radC=+c.client_radius||200;let x='';
 if(b.dAt)x+='<div class="odo">'+thumb(b.delivered_photo)+'<div><span class="tiny">'+(b.dest!=='warehouse'?'на объекте':'на складе')+' '+fT(b.dAt)+'</span><br>'+dChip(b.delivered_lat,b.delivered_lng,b.delivered_dist,b.dest==='ticket'?radC:radO,b.dest==='ticket'?'объекта':'склада')+'</div></div>';
 if(b.dest!=='warehouse'&&b.used_lines&&leftLines(b).length)x+='<div class="tiny muted">использовано: '+(b.lines||[]).map((l,i)=>h(l.name)+' '+n1(b.used_lines[i])+' из '+n1(l.qty)).join(', ')+'</div>';
 if(b.lAt)x+='<div class="odo">'+thumb(b.left_photo)+'<div><span class="tiny">остаток на складе '+fT(b.lAt)+'</span><br>'+dChip(b.left_lat,b.left_lng,b.left_dist,radO,'склада')+'</div></div>';
 else if(b.status==='partial')x+='<div class="tiny" style="color:var(--warn)">Остаток к сдаче: '+leftLines(b).map(lineTxt).join(', ')+'</div>';
 return x||'—'}
function buyRows(list,showName){return '<div class="tblw flat"><table class="tbl"><thead><tr><th>Куплено</th>'+(showName?'<th class="l">Сотрудник</th>':'')+'<th class="l">Где и что</th><th>Сумма</th><th>Чек</th><th class="l">Куда</th><th class="l">Сдача</th><th class="l">Статус</th><th class="l">Отклонения</th><th></th></tr></thead><tbody>'+
 (list.length?list.map(b=>{const m=tech(b.masterId);const t=b.ticket_id?T(b.ticket_id):null;const st=BST[b.status]||BST.bought;
  return '<tr><td>'+fT(b.at)+'<br>'+(b.loc?'<a class="tiny" href="'+mapUrl(b.loc)+'" target="_blank" rel="noopener">где купил</a>':'')+'</td>'+(showName?'<td class="l"><button class="lnk" data-act="ago" data-v="a-emp" data-id="'+h(b.masterId)+'">'+h(m?m.name:'—')+'</button></td>':'')+
  '<td class="l wrapc"><b>'+(b.source==='warehouse'?'<span class="chip c-info">Со склада</span>':h(b.supplier))+'</b><div class="small">'+(b.lines||[]).map(lineTxt).join('<br>')+'</div></td><td class="num">'+(b.source==='warehouse'?'—':money(b.amount))+'</td><td>'+thumb(b.photo)+'</td>'+
  '<td class="l">'+(b.dest==='ticket'?(t?'<button class="lnk" data-act="ago" data-v="a-order" data-id="'+h(t.id)+'">Объект '+h(t.num)+'</button><div class="tiny muted">'+h(t.address)+'</div>':'Объект'):b.dest==='site'?'Объект<div class="tiny muted">'+h(b.site||'')+'</div>':'Склад')+'</td>'+
  '<td class="l wrapc">'+buyDeliv(b)+'</td><td class="l"><span class="chip '+st[1]+'">'+(b.status==='delivered'&&b.dest!=='warehouse'&&!leftLines(b).length?'Ждёт проверки':st[0])+'</span>'+(b.accepted_lines&&b.status==='accepted'?'<div class="tiny muted">принято: '+b.accepted_lines.map(lineTxt).join(', ')+'</div>':'')+'</td>'+
  '<td class="l wrapc">'+flagCell(buyFlags(b))+'</td><td><div class="row" style="justify-content:flex-end;gap:6px">'+(b.status==='delivered'?'<button class="btn primary sm" data-act="buyacc" data-id="'+h(b.id)+'">'+(acceptLines(b).length?'Принять':'Подтвердить')+'</button>':'')+(['bought','partial','delivered'].includes(b.status)?'<button class="btn ghost sm" data-act="buycancel" data-id="'+h(b.id)+'">Отменить</button>':'')+'</div></td></tr>'}).join(''):'<tr><td colspan="10" class="l muted">Закупок нет</td></tr>')+'</tbody></table></div>'}
function vBuys(){const f=S.bf;let list=S.buys.filter(b=>!S.empF||b.masterId===S.empF);
 if(f==='open')list=list.filter(b=>['bought','partial'].includes(b.status));else if(f==='accept')list=list.filter(b=>b.status==='delivered');else if(f==='flags')list=list.filter(b=>buyFlags(b).length);
 list=list.slice().sort((a,b)=>b.at-a.at);
 const F=[['open','Не сданы'],['accept','На приёмке'],['flags','С отклонениями'],['all','Все']];
 const sumOpen=S.buys.filter(b=>['bought','partial'].includes(b.status)).reduce((a,b)=>a+(+b.amount||0),0);const sumMonth=S.buys.filter(b=>b.at>=monthStart()&&b.status!=='cancelled').reduce((a,b)=>a+(+b.amount||0),0);
 return atop('Закупки','<div class="row wrapx">'+empSel()+'<div class="filters">'+F.map(x=>'<button class="'+(f===x[0]?'on':'')+'" data-act="bfilter" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div>')+
  '<div class="kgrid">'+kpi(money(sumOpen),'куплено и не сдано',sumOpen>0)+kpi(S.buys.filter(b=>b.status==='delivered').length,'ждут приёмки')+kpi(money(sumMonth),'закупок за месяц')+kpi(S.buys.filter(b=>b.shortage&&b.accAt>=monthStart()).length,'недостач за месяц',S.buys.some(b=>b.shortage&&b.accAt>=monthStart()))+'</div>'+
  '<div class="card tight"><p class="small" style="margin:0">Каждая покупка должна дойти до склада или до объекта. Сотрудник отмечает это фото на месте, телефон записывает координаты. Материал на объект нельзя отметить, пока сотрудник не нажал «Я на месте», а заказ не закроется, пока материал не отмечен. Остаток после объекта сотрудник обязан сдать на склад. При приёмке пересчитайте товар: недостача будет видна в отклонениях. Материал на объекте сверьте по фото и при звонке клиенту.</p></div>'+
  aiBar()+buyRows(list,true)}

/* ---------- маршрут дня ---------- */
const ymd=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
const ymdTs=v=>{const a=String(v).split('-').map(Number);return new Date(a[0],a[1]-1,a[2]).getTime()};
const WK={before:'до',after:'после',other:'работа'};
async function loadDayPts(id,date){const key=id+'|'+date;if(S.dayPts[key]||S.dayLoading===key)return;S.dayLoading=key;const a=ymdTs(date),b=a+864e5;
 const r=await pages(()=>sb.from('track_points').select('at,device_at,lat,lng,acc,mocked').eq('staff_id',id).gte('at',new Date(a-36e5).toISOString()).lt('at',new Date(b+36e5).toISOString()).order('id'));
 if(r.error)toast('Маршрут не загрузился: '+r.error.message);
 S.dayPts[key]=(r.data||[]).map(p=>({lat:p.lat,lng:p.lng,acc:p.acc,mocked:p.mocked,at:ms(p.device_at||p.at)})).filter(p=>p.at>=a&&p.at<b).sort((x,y)=>x.at-y.at);
 S.dayLoading=null;if(S.view.name==='a-day')render(true)}
function dayEvents(id,a,b,pts,shs){const ev=[];const add=(at,lat,lng,c,lbl,t,extra)=>{if(at&&at>=a&&at<b)ev.push(Object.assign({at,lat,lng,c,lbl,t},extra||{}))};
 const lim=(+S.cfg.long_stop_min||30)*60000;
 shs.forEach(sh=>{add(sh.startAt,sh.start.lat,sh.start.lng,'#123a33','Н','Начало смены, одометр '+sh.start.odo+(sh.start.dist!=null?', '+fDist(sh.start.dist)+' от офиса':''),{photo:sh.start.photo});
  if(sh.endAt)add(sh.endAt,sh.end.lat,sh.end.lng,'#123a33','К','Конец смены, одометр '+sh.end.odo+(sh.end.dist!=null?', '+fDist(sh.end.dist)+' от офиса':''),{photo:sh.end.photo});
  stopsOf(id,sh.startAt,sh.endAt||Date.now(),pts).forEach(z=>{const bad=z.place.k==='unknown'&&z.dur>=lim;add(z.at,z.lat,z.lng,bad?'#c23d2c':z.place.k==='unknown'?'#b86d06':'#7c8a85',fDur(z.dur).replace(' мин','м').replace(' ч ','ч'),'Стоянка '+fDur(z.dur)+' ('+fHM(z.at)+'–'+fHM(z.end)+'): '+z.place.t+(z.gap?', возможно, пропал сигнал':''),{stop:1,bad,unk:z.place.k==='unknown'})})});
 S.wph.filter(w=>w.masterId===id).forEach(w=>add(w.at,w.lat,w.lng,'#2c8a57','Ф','Фото работ ('+WK[w.kind]+'): '+(w.object||'')+(w.note?' — '+w.note:''),{photo:w.path}));
 S.buys.filter(x=>x.masterId===id).forEach(x=>{add(x.at,x.lat,x.lng,'#2c67a6','З','Закупка: '+x.supplier+', '+money(x.amount)+' → '+(x.dest==='warehouse'?'склад':'объект'+(x.site?' '+x.site:'')),{photo:x.photo});
  if(x.dAt)add(x.dAt,x.delivered_lat,x.delivered_lng,'#2c67a6','С',(x.dest==='warehouse'?'Сдано на склад: ':'Материал на объекте: ')+x.supplier,{photo:x.delivered_photo});
  if(x.lAt)add(x.lAt,x.left_lat,x.left_lng,'#2c67a6','С','Остаток сдан на склад: '+x.supplier,{photo:x.left_photo})});
 S.fuel.filter(r=>r.masterId===id).forEach(r=>add(r.at,r.loc&&r.loc.lat,r.loc&&r.loc.lng,'#8a4fd8','А','Заправка '+n1(r.liters)+' '+fuelUnit(tech(id))+', '+money(r.sum),{photo:r.photo}));
 S.tickets.filter(t=>t.techId===id).forEach(t=>{const g=t.gps;if(g.onsite)add(t.times.onsite,g.onsite.lat,g.onsite.lng,'#e9a11b','№','Заказ '+t.num+': на месте');if(g.done)add(t.times.done,g.done.lat,g.done.lng,'#e9a11b','✓','Заказ '+t.num+': завершён')});
 S.tasks.filter(t=>t.masterId===id&&t.status==='done').forEach(t=>add(t.dAt,t.done_lat,t.done_lng,'#0f766e','✓','Задача выполнена: '+t.title+(t.done_dist!=null?' ('+fDist(t.done_dist)+' от места)':''),{photo:t.done_photo,bad:taskFlags(t).length>0}));
 S.alerts.filter(x=>x.staff_id===id).forEach(x=>add(x.at,null,null,'#c23d2c','!',x.message,{bad:1}));
 return ev.sort((x,y)=>x.at-y.at)}
function vDay(){const list=approved();const emp=S.dayEmp&&tech(S.dayEmp)?S.dayEmp:(list[0]||{}).id;const date=S.dayDate||ymd(Date.now());S.dayEmp=emp;S.dayDate=date;
 const bar='<div class="daybar"><select class="inp" data-act="dayemp" style="width:auto;padding:9px 12px;font-size:14px">'+list.map(m=>'<option value="'+h(m.id)+'"'+(m.id===emp?' selected':'')+'>'+h(m.name)+'</option>').join('')+'</select><button class="btn ghost sm" data-act="dayshift" data-v="-1" aria-label="Предыдущий день">←</button><input type="date" class="inp" data-act="daydate" value="'+h(date)+'" max="'+ymd(Date.now())+'"><button class="btn ghost sm" data-act="dayshift" data-v="1" aria-label="Следующий день"'+(date>=ymd(Date.now())?' disabled':'')+'>→</button></div>';
 let s=atop('Маршрут дня',bar);if(!emp)return s+'<div class="empty">Сотрудников пока нет</div>';
 const key=emp+'|'+date;const pts=S.dayPts[key];if(!pts){loadDayPts(emp,date);S.dayCtx=null;return s+'<div class="empty">Загружаю маршрут…</div>'}
 const a=ymdTs(date),b=a+864e5;const m=tech(emp);const shs=S.shifts.filter(x=>x.masterId===emp&&x.startAt>=a&&x.startAt<b).sort((x,y)=>x.startAt-y.startAt);
 const ev=dayEvents(emp,a,b,pts,shs);S.dayCtx={pts:pts.filter(p=>!p.mocked&&(p.acc==null||p.acc<=100)),bad:pts.filter(p=>p.mocked),ev};
 const gk=shs.length?shs.reduce((x,sh)=>x+(gpsKm(emp,sh.startAt,sh.endAt||Date.now(),pts)||0),0):gpsKm(emp,a,b,pts);const ok=shs.reduce((x,sh)=>x+(odoKm(sh)>0?odoKm(sh):0),0);
 const stops=ev.filter(e=>e.stop);const longs=stops.filter(e=>e.bad||/#b86d06/.test(e.c));const wp=S.wph.filter(w=>w.masterId===emp&&w.at>=a&&w.at<b);
 const by=S.buys.filter(x=>x.masterId===emp&&x.at>=a&&x.at<b);const nb=S.buys.filter(x=>x.masterId===emp&&['bought','partial'].includes(x.status));const fu=S.fuel.filter(r=>r.masterId===emp&&r.at>=a&&r.at<b);
 const hrs=shs.reduce((x,sh)=>x+((sh.endAt||Date.now())-sh.startAt),0);
 s+='<div class="kgrid">'+kpi(shs.length?fHM(shs[0].startAt)+'–'+(shs[shs.length-1].endAt?fHM(shs[shs.length-1].endAt):'идёт'):'нет смены','смена'+(hrs?', '+fDur(hrs):''),!shs.length&&![0,6].includes(new Date(a).getDay()))+
  kpi(gk!=null?n1(gk)+' км':'—','по GPS'+(ok?', по одометру '+ok+' км':''),ok&&gk!=null&&gk>=1&&ok>gk*1.25+10)+
  kpi(longs.length,'долгих стоянок в неизвестных местах',longs.length>0)+kpi(wp.length,'фото работ',shs.length&&!wp.length)+(()=>{const tk=S.tasks.filter(t=>t.masterId===emp&&t.day===date&&t.status!=='cancelled');return tk.length?kpi(tk.filter(t=>t.status==='done').length+' из '+tk.length,'задач выполнено',tk.some(t=>taskFlags(t).length)):''})()+
  kpi(by.length+(nb.length?' · '+nb.length+' не сдано':''),'закупок',nb.some(x=>buyFlags(x).some(f=>f.lv==='bad')))+kpi(fu.length?n1(fu.reduce((x,r)=>x+(+r.liters||0),0))+' '+fuelUnit(m)+' · '+money(fu.reduce((x,r)=>x+(+r.sum||0),0)):'—','заправки')+'</div>';
 if(!pts.length)s+='<div class="flag warn">'+I.alert+'<span>'+(shs.length?'Маршрут за этот день не записан: у сотрудника нет разрешения на местоположение «всегда», выключен GPS или телефон был без интернета весь день.':'В этот день смены не было.')+'</span></div>';
 s+='<section class="card tight"><div id="daymap" class="daymap" role="img" aria-label="Карта маршрута"></div><div class="dlegend"><span><i style="background:#2c67a6"></i>маршрут, закупки и сдача</span><span><i style="background:#c23d2c"></i>долгая стоянка в неизвестном месте</span><span><i style="background:#b86d06"></i>стоянка в неизвестном месте</span><span><i style="background:#7c8a85"></i>стоянка в известном месте</span><span><i style="background:#2c8a57"></i>фото работ</span><span><i style="background:#8a4fd8"></i>заправка</span><span><i style="background:#0f766e"></i>задача выполнена</span><span><i style="background:#123a33"></i>начало и конец смены</span></div></section>';
 const fl=shs.reduce((x,sh)=>x.concat(shiftFlags(sh)),[]);if(fl.length)s+='<section class="card tight"><span class="label">Отклонения</span>'+fl.map(f=>'<div class="flag '+f.lv+'">'+I.alert+'<span>'+h(f.t)+'</span></div>').join('')+'</section>';
 s+='<section class="card"><h2>Хронология</h2>'+(ev.length?'<div class="tblw flat"><table class="tbl"><thead><tr><th>Время</th><th class="l">Что</th><th>Фото</th><th>Где</th></tr></thead><tbody>'+ev.map(e=>'<tr class="tlrow"><td>'+fHM(e.at)+'</td><td class="l wrapc"'+(e.bad?' style="color:var(--bad)"':'')+'><span class="mk" style="display:inline-flex;background:'+e.c+';margin-right:8px">'+h(e.lbl)+'</span>'+h(e.t)+'</td><td>'+(e.photo?thumb(e.photo):'')+'</td><td>'+(e.lat!=null?'<button class="lnk" data-act="dayfly" data-lat="'+e.lat+'" data-lng="'+e.lng+'">на карте</button>':'—')+(e.unk?'<br><button class="lnk" data-act="addplace" data-lat="'+e.lat+'" data-lng="'+e.lng+'">+ добавить место</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted small">Событий нет.</p>')+'</section>';
 return s}
function initDayMap(){const el=document.getElementById('daymap');if(S.map){try{S.map.remove()}catch(e){}S.map=null}if(!el||!S.dayCtx)return;
 if(typeof L==='undefined'){el.innerHTML='<div class="empty">Карта не загрузилась. Обновите страницу.</div>';return}
 const c=S.dayCtx;const map=L.map(el,{scrollWheelZoom:true});S.map=map;
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
 const ll=[];if(c.pts.length>1){const line=c.pts.map(p=>[p.lat,p.lng]);L.polyline(line,{color:'#2c67a6',weight:4,opacity:.75}).addTo(map);ll.push(...line)}
 c.bad.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:5,color:'#c23d2c',fillOpacity:.8}).bindTooltip('Подмена GPS, '+fHM(p.at)).addTo(map));
 c.ev.filter(e=>e.lat!=null).forEach(e=>{const mk=L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:'<div class="mk" style="background:'+e.c+'">'+h(e.lbl)+'</div>',iconSize:null,iconAnchor:[11,11]}),zIndexOffset:e.bad?1000:e.stop?500:0}).addTo(map);
  mk.bindPopup(()=>'<b>'+fHM(e.at)+'</b> '+h(e.t)+(e.photo&&S.urls[e.photo]?'<img src="'+h(S.urls[e.photo])+'" alt="Фото">':''));ll.push([e.lat,e.lng])});
 if(ll.length)map.fitBounds(ll,{padding:[30,30],maxZoom:16});else{const o=office();map.setView(o?[o.lat,o.lng]:[40.18,44.51],12)}}

/* ---------- фото работ ---------- */
function vPhotos(){const from=perFrom(S.per);const list=S.wph.filter(w=>w.at>=from&&(!S.empF||w.masterId===S.empF)).sort((a,b)=>b.at-a.at);
 const g={};list.forEach(w=>{const k=w.masterId+'|'+dayStart(w.at)+'|'+String(w.object||'').trim().toLowerCase();(g[k]=g[k]||[]).push(w)});
 const groups=Object.values(g).sort((a,b)=>b[0].at-a[0].at);
 const shs=S.shifts.filter(x=>x.startAt>=from&&x.endAt&&(!S.empF||x.masterId===S.empF)&&x.endAt-x.startAt>3*36e5);const empty=shs.filter(sh=>!S.wph.some(w=>w.masterId===sh.masterId&&w.at>=sh.startAt&&w.at<=sh.endAt));
 let s=atop('Фото работ','<div class="row wrapx">'+empSel()+perSeg()+'</div>');
 s+='<div class="kgrid">'+kpi(list.length,'фото')+kpi(groups.length,'объектов по дням')+kpi(empty.length,'смен без фото работ',empty.length>0)+kpi(groups.filter(x=>!x.some(w=>w.kind==='after')).length,'объектов без фото «после»',groups.some(x=>!x.some(w=>w.kind==='after')))+'</div>';
 if(empty.length)s+='<section class="card tight"><span class="label">Смены без фото работ</span>'+empty.map(sh=>'<div class="row between"><span class="small">'+h((tech(sh.masterId)||{}).name||'—')+' · '+fDay(sh.startAt)+' '+fHM(sh.startAt)+'–'+fHM(sh.endAt)+'</span><button class="lnk" data-act="dayopen" data-id="'+h(sh.masterId)+'" data-v="'+ymd(sh.startAt)+'">маршрут</button></div>').join('')+'</section>';
 s+='<section class="card">'+(groups.length?groups.map(gr=>{const w0=gr[gr.length-1];const m=tech(w0.masterId);const pts=gr.filter(w=>w.loc);let spread=0;pts.forEach(x=>pts.forEach(y=>{const d=distM(x.loc,y.loc);if(d>spread)spread=d}));
  const fl=[];if(!gr.some(w=>w.kind==='after'))fl.push({lv:'warn',t:'Нет фото «после»'});if(!gr.some(w=>w.kind==='before'))fl.push({lv:'warn',t:'Нет фото «до»'});if(spread>500)fl.push({lv:'bad',t:'Фото одного объекта сделаны в местах, далёких друг от друга ('+fDist(spread)+')'});
  return '<div class="pgrp"><div class="row between wrapx"><div><b>'+h(w0.object||'Без названия')+'</b><div class="tiny muted">'+h(m?m.name:'—')+' · '+fDay(w0.at)+', '+fHM(w0.at)+'–'+fHM(gr[0].at)+' · '+gr.length+' фото</div></div><div class="row wrapx">'+(w0.loc?'<a class="chip c-muted" href="'+mapUrl(w0.loc)+'" target="_blank" rel="noopener">на карте</a>':'')+'<button class="btn ghost sm" data-act="dayopen" data-id="'+h(w0.masterId)+'" data-v="'+ymd(w0.at)+'">Маршрут дня</button></div></div>'+
   (fl.length?'<div>'+flagCell(fl)+'</div>':'')+'<div class="pgrid">'+gr.slice().reverse().map(w=>'<figure>'+thumb(w.path,'thumb lg')+'<figcaption class="tiny muted">'+WK[w.kind]+' '+fHM(w.at)+(w.offline?'<br><span style="color:var(--warn)">без сети, отправлено '+fHM(w.sentAt)+'</span>':'')+'</figcaption></figure>').join('')+'</div>'+(gr.some(w=>w.note)?'<p class="small" style="margin:0">'+gr.filter(w=>w.note).map(w=>h(w.note)).join(' · ')+'</p>':'')+'</div>'}).join(''):'<div class="empty" style="padding:18px"><p>Фото работ за этот период нет.</p></div>')+'</section>';
 return s}

function vIssues(){const lv=S.ilv||'bad';const from=dayStart(Date.now())-6*864e5;let a=allIssues(from).filter(i=>!S.empF||i.who===S.empF);const nb=a.filter(i=>i.lv==='bad').length;if(lv==='bad')a=a.filter(i=>i.lv==='bad');
 return back('Сводка','a-dash')+atop('Отклонения за 7 дней','<div class="row wrapx">'+empSel()+'<div class="filters"><button class="'+(lv==='bad'?'on':'')+'" data-act="ilv" data-v="bad">Серьёзные ('+nb+')</button><button class="'+(lv==='all'?'on':'')+'" data-act="ilv" data-v="all">Все</button></div></div>')+'<section class="card">'+issueList(a)+'</section>'}

/* ---------- места ---------- */
function unknownSpots(){const from=dayStart(Date.now())-6*864e5;const cl=[];
 S.shifts.filter(sh=>sh.startAt>=from).forEach(sh=>stopsOf(sh.masterId,sh.startAt,sh.endAt||Date.now()).filter(z=>z.place.k==='unknown').forEach(z=>{let c=cl.find(c=>distM(c,z)<=200);if(!c){c={lat:z.lat,lng:z.lng,n:0,dur:0,who:new Set(),last:0};cl.push(c)}c.n++;c.dur+=z.dur;c.who.add(sh.masterId);if(z.at>c.last)c.last=z.at}));
 return cl.sort((a,b)=>b.dur-a.dur)}
function vPlaces(){const f=S.form;if(!f.pl)f.pl={kind:'client',radius:'200'};const pl=f.pl;const sp=unknownSpots();
 const ll=pl.ll!=null?pl.ll:'';
 let s=atop('Места','<span class="muted small">объекты клиентов, поставщики, склад</span>');
 s+='<div class="card tight"><p class="small" style="margin:0">Стоянки в этих местах не считаются подозрительными, а в маршруте дня подписываются названием. Сотрудники видят список и выбирают объект в приложении. Чтобы добавить место, нажмите на карту или вставьте координаты из Google Maps.</p></div>';
 s+='<div class="cols2"><section class="card tight"><div id="plmap" class="daymap" role="img" aria-label="Карта мест"></div></section>'+
  '<section class="card"><h2>'+(pl.id?'Изменить место':'Новое место')+'</h2>'+
  '<div class="field"><label for="p-name">Название (клиент, объект, магазин)</label><input id="p-name" class="inp" data-pl="name" value="'+h(pl.name||'')+'" placeholder="Ашот Петросян, Абовян"></div>'+
  '<div class="cols"><div class="field"><label for="p-kind">Тип</label><select id="p-kind" class="inp" data-pl="kind">'+Object.keys(PLK).map(k=>'<option value="'+k+'"'+(pl.kind===k?' selected':'')+'>'+PLK[k][0]+'</option>').join('')+'</select></div>'+
  '<div class="field"><label for="p-rad">Радиус, м</label><input id="p-rad" class="inp num" type="number" data-pl="radius" value="'+h(pl.radius||'200')+'"></div></div>'+
  '<div class="field"><label for="p-ll">Координаты</label><input id="p-ll" class="inp" data-pl="ll" value="'+h(ll)+'" placeholder="нажмите на карту или вставьте 40.18110, 44.51360"></div>'+
  '<div class="field"><label for="p-note">Заметка</label><input id="p-note" class="inp" data-pl="note" value="'+h(pl.note||'')+'"></div>'+
  '<div class="row wrapx"><button class="btn primary" data-act="plsave">'+(pl.id?'Сохранить':'Добавить место')+'</button>'+(pl.id||pl.ll?'<button class="btn ghost" data-act="plclear">Очистить</button>':'')+'</div></section></div>';
 if(sp.length)s+='<section class="card"><div class="row between"><h2>Неизвестные стоянки за 7 дней</h2><span class="muted small">если это объект клиента или магазин, добавьте его</span></div><div class="tblw flat"><table class="tbl"><thead><tr><th class="l">Где</th><th>Раз</th><th>Всего времени</th><th class="l">Кто</th><th>Последний раз</th><th></th></tr></thead><tbody>'+
  sp.slice(0,30).map(c=>'<tr><td class="l"><a href="'+mapUrl(c)+'" target="_blank" rel="noopener">'+c.lat.toFixed(5)+', '+c.lng.toFixed(5)+'</a></td><td>'+c.n+'</td><td>'+fDur(c.dur)+'</td><td class="l">'+[...c.who].map(id=>h((tech(id)||{}).name||'—')).join(', ')+'</td><td>'+fT(c.last)+'</td><td><button class="btn ghost sm" data-act="addplace" data-lat="'+c.lat+'" data-lng="'+c.lng+'">Добавить место</button></td></tr>').join('')+'</tbody></table></div></section>';
 s+='<section class="card"><h2>Все места ('+S.places.length+')</h2>'+(S.places.length?'<div class="tblw flat"><table class="tbl"><thead><tr><th class="l">Название</th><th class="l">Тип</th><th>Радиус</th><th class="l">Заметка</th><th>Карта</th><th></th></tr></thead><tbody>'+
  S.places.map(x=>'<tr><td class="l"><b>'+h(x.name)+'</b></td><td class="l">'+(PLK[x.kind]||PLK.other)[0]+'</td><td>'+x.radius+' м</td><td class="l">'+h(x.note||'')+'</td><td><a class="chip c-muted" href="'+mapUrl(x)+'" target="_blank" rel="noopener">на карте</a></td><td><div class="row" style="justify-content:flex-end;gap:6px"><button class="btn ghost sm" data-act="pltask" data-id="'+h(x.id)+'">Задача</button><button class="btn ghost sm" data-act="pledit" data-id="'+h(x.id)+'">Изменить</button><button class="btn danger sm" data-act="pldel" data-id="'+h(x.id)+'">Удалить</button></div></td></tr>').join('')+'</tbody></table></div>':'<p class="muted small">Пока ни одного места.</p>')+'</section>';
 return s}
function plLL(){const m=String((S.form.pl||{}).ll||'').match(/(-?\d+[.,]\d+)\s*[, ]\s*(-?\d+[.,]\d+)/);return m?{lat:+m[1].replace(',','.'),lng:+m[2].replace(',','.')}:null}
function initPlacesMap(){const el=document.getElementById('plmap');if(S.map){try{S.map.remove()}catch(e){}S.map=null}if(!el)return;
 if(typeof L==='undefined'){el.innerHTML='<div class="empty">Карта не загрузилась. Обновите страницу.</div>';return}
 const map=L.map(el);S.map=map;L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
 const col={client:'#2c8a57',supplier:'#2c67a6',warehouse:'#123a33',other:'#7c8a85'};const ll=[];
 S.places.forEach(x=>{L.circle([x.lat,x.lng],{radius:+x.radius||200,color:col[x.kind]||'#7c8a85',weight:2,fillOpacity:.15}).bindTooltip(x.name).addTo(map);ll.push([x.lat,x.lng])});
 const o=office();if(o){L.circle([o.lat,o.lng],{radius:+S.cfg.office_radius||150,color:'#e9a11b',weight:2,fillOpacity:.15}).bindTooltip('Офис').addTo(map);ll.push([o.lat,o.lng])}
 const cur=plLL();if(cur){L.circle([cur.lat,cur.lng],{radius:+S.form.pl.radius||200,color:'#c23d2c',weight:2,dashArray:'5 5',fillOpacity:.1}).addTo(map);map.setView([cur.lat,cur.lng],16)}
 else if(ll.length)map.fitBounds(ll,{padding:[30,30],maxZoom:15});else map.setView([40.18,44.51],12);
 map.on('click',ev=>{S.form.pl=S.form.pl||{};S.form.pl.ll=ev.latlng.lat.toFixed(6)+', '+ev.latlng.lng.toFixed(6);render(true);const n=document.getElementById('p-name');if(n&&!n.value)n.focus()})}

/* ---------- задачи на день ---------- */
function vTasksDay(){const date=S.taskDate||ymd(Date.now());S.taskDate=date;const f=S.form;if(!f.tk)f.tk={emp:S.empF||'',place:''};const tk=f.tk;
 const list=S.tasks.filter(t=>t.day===date&&(!S.empF||t.masterId===S.empF)&&t.status!=='cancelled');
 const bar='<div class="daybar">'+empSel()+'<button class="btn ghost sm" data-act="tdshift" data-v="-1" aria-label="Предыдущий день">←</button><input type="date" class="inp" data-act="tdate" value="'+h(date)+'"><button class="btn ghost sm" data-act="tdshift" data-v="1" aria-label="Следующий день">→</button></div>';
 let s=atop('Задачи на день',bar);s+='<div class="filters"><button data-act="tmode" data-v="open">← Все задачи</button><button class="on">На день (GPS)</button></div>';
 s+='<div class="card tight"><p class="small" style="margin:0">Сотрудник видит задачи на главном экране: кнопка «Маршрут» ведёт в Google Maps, «Выполнено» — только с фото на месте. Расстояние до места проверяет сервер. Невыполненные задачи попадают в отклонения на следующий день.</p></div>';
 s+=taskForm(tk,date,true);
 const by={};list.forEach(t=>{(by[t.masterId]=by[t.masterId]||[]).push(t)});
 s+=Object.keys(by).length?Object.keys(by).map(id=>{const m=tech(id);const ts=by[id];const dn=ts.filter(t=>t.status==='done').length;
  return '<section class="card"><div class="row between"><h2>'+h(m?m.name:'—')+'</h2><div class="row"><span class="chip '+(dn===ts.length?'c-ok':'c-info')+'">'+dn+' из '+ts.length+'</span><button class="btn ghost sm" data-act="dayopen" data-id="'+h(id)+'" data-v="'+h(date)+'">Маршрут дня</button></div></div><div class="tblw flat"><table class="tbl"><thead><tr><th class="l">Задача</th><th class="l">Место</th><th class="l">Статус</th><th>Фото</th><th class="l">Отклонения</th><th></th></tr></thead><tbody>'+
   ts.map(t=>{const pl=S.places.find(p=>p.id===t.place_id);return '<tr><td class="l wrapc"><b>'+h(t.title)+'</b>'+(t.note?'<div class="tiny muted">'+h(t.note)+'</div>':'')+(t.done_note?'<div class="tiny">Сотрудник: '+h(t.done_note)+'</div>':'')+'</td><td class="l">'+(pl?'<a href="'+mapUrl(pl)+'" target="_blank" rel="noopener">'+h(pl.name)+'</a>':'—')+'</td><td class="l">'+(t.status==='done'?'<span class="chip c-ok">выполнено '+fHM(t.dAt)+'</span>'+(t.done_dist!=null?'<div class="tiny muted">'+fDist(t.done_dist)+' от места</div>':''):'<span class="chip c-warn">не выполнено</span>')+'</td><td>'+(t.done_photo?thumb(t.done_photo):'—')+'</td><td class="l wrapc">'+flagCell(taskFlags(t))+'</td><td>'+(t.status==='new'?'<button class="btn ghost sm" data-act="tdel" data-id="'+h(t.id)+'">Отменить</button>':'')+'</td></tr>'}).join('')+'</tbody></table></div></section>'}).join(''):'<div class="empty" style="padding:18px"><p>На этот день задач нет.</p></div>';
 return s}

function vSettings(){const f=S.form;if(!f.c){f.c=Object.assign({},S.cfg);f.c.work_start=String(f.c.work_start||'09:00').slice(0,5);f.c.work_end=String(f.c.work_end||'18:00').slice(0,5)}const c=f.c;
 const inp=(k,l,t,extra)=>'<div class="field"><label for="g-'+k+'">'+l+'</label><input id="g-'+k+'" class="inp num" type="'+(t||'number')+'" data-c="'+k+'" value="'+h(c[k]==null?'':c[k])+'"'+(extra||'')+'></div>';
 let s=atop('Настройки','<button class="btn primary" data-act="savecfg">Сохранить</button>');
 s+='<div class="cols2"><section class="card"><h2>Офис</h2><div class="field"><label for="g-ll">Координаты офиса (из Google Maps: правый клик по офису → скопировать цифры)</label><input id="g-ll" class="inp" data-c="ll" value="'+h(c.ll!=null?c.ll:(c.office_lat!=null?c.office_lat+', '+c.office_lng:''))+'" placeholder="40.17920, 44.49910"></div>'+
  '<button class="btn ghost sm" style="align-self:flex-start" data-act="here">'+I.pin+'Я сейчас в офисе, взять точку с этого устройства</button>'+
  '<div class="field"><label for="g-wifi">Офисный Wi-Fi: имя сети (можно несколько через запятую)</label><input id="g-wifi" class="inp" data-c="office_wifi" value="'+h(c.office_wifi||'')+'" placeholder="ArevOffice"><p class="tiny muted">Если заполнено, приход и уход проверяются ещё и по Wi-Fi: подделать его сложнее, чем GPS.</p></div>'+
  '<div class="cols">'+inp('office_radius','Радиус офиса, м')+inp('client_radius','Радиус у клиента, м')+'</div>'+
  '<div class="field"><label for="g-wll">Координаты склада (если склад не в офисе)</label><input id="g-wll" class="inp" data-c="wll" value="'+h(c.wll!=null?c.wll:(c.warehouse_lat!=null?c.warehouse_lat+', '+c.warehouse_lng:''))+'" placeholder="пусто — склад в офисе"></div></section>'+
  '<section class="card"><h2>Рабочий день и топливо</h2><div class="cols">'+inp('work_start','Начало дня','time')+inp('work_end','Конец дня','time')+inp('grace_min','Допуск опоздания, мин')+inp('max_idle_min','Пауза между заказами, мин')+inp('default_norm','Расход по умолчанию, л/100','number',' step="0.1"')+inp('route_k','Коэффициент дорог','number',' step="0.05"')+inp('photo_max_age_min','Фото действительно, мин')+inp('purchase_max_hours','Сдать закупку не позже, ч')+inp('stop_min','Стоянка считается от, мин')+inp('long_stop_min','Долгая стоянка от, мин')+'</div><div class="field"><label for="g-co">Название компании</label><input id="g-co" class="inp" data-c="company" value="'+h(c.company||'')+'"></div><div class="field"><label for="g-ph">Телефон офиса (кнопка «Позвонить» в приложении)</label><input id="g-ph" class="inp" data-c="office_phone" value="'+h(c.office_phone||'')+'" placeholder="+374 10 123456"></div></section></div>';
 return s}

/* ---------- задачи: в работе, на проверке, обсуждения, архив ---------- */
const TST={new:['В работе','c-info'],report:['Сообщили о готовности','c-warn'],done:['Выполнена','c-ok'],cancelled:['Отменена','c-muted']};
const PRI={important:['Важно','c-sun'],urgent:['Срочно','c-bad']};
const PRI_W={urgent:0,important:1,normal:2};
const tnames=t=>[t.staff_id,t.staff2_id].map(tech).filter(Boolean).map(m=>m.name).join(' + ')||'—';
const taskChips=t=>{const s=TST[t.status]||TST.new;return '<span class="chip '+s[1]+'">'+s[0]+'</span>'+(PRI[t.priority]?' <span class="chip '+PRI[t.priority][1]+'">'+PRI[t.priority][0]+'</span>':'')+(t.disc_status==='open'?' <span class="chip c-bad">💬 вопрос</span>':'')+(t.self_added?' <span class="chip c-muted">сам добавил</span>':'')};
const dueOver=t=>t.due&&t.status!=='done'&&t.status!=='cancelled'&&ymdTs(t.due)+864e5<=Date.now();
const dueText=t=>t.due?'<span'+(dueOver(t)?' class="over"':'')+'>'+h(fDay(ymdTs(t.due)))+(dueOver(t)?' · просрочено':'')+'</span>':'<span class="muted">без срока</span>';
function seenText(t){const late=t.status==='new'&&Date.now()-ms(t.created_at)>36e5;
 const one=(id,at)=>{const m=tech(id);if(!m)return '';const nm=h(m.name.split(' ')[0]);return '<div class="tiny">'+(at?'👀 '+nm+' · '+fT(ms(at)):'<span style="color:var(--'+(late?'bad':'muted')+')">не открыл(а): '+nm+'</span>')+'</div>'};
 return one(t.staff_id,t.seen_at)+(t.staff2_id?one(t.staff2_id,t.seen2_at):'')}
function taskRows(list){return list.length?'<div class="tblw"><table class="tbl"><thead><tr><th class="l">Задача</th><th class="l">Кто</th><th class="l">Срок</th><th class="l">Открыл</th><th class="l">Статус</th></tr></thead><tbody>'+
 list.map(t=>'<tr class="click" data-act="topen" data-id="'+h(t.id)+'"><td class="l wrapc"><b>'+h(t.title)+'</b>'+(t.note?'<div class="tiny muted">'+h(t.note)+'</div>':'')+(t.done_note&&t.status!=='new'?'<div class="tiny">Сотрудник: '+h(t.done_note)+'</div>':'')+'</td><td class="l wrapc">'+h(tnames(t))+'</td><td class="l">'+dueText(t)+'</td><td class="l">'+seenText(t)+'</td><td class="l wrapc" style="min-width:170px">'+taskChips(t)+'</td></tr>').join('')+'</tbody></table></div>'
 :'<div class="empty" style="padding:22px"><p>Здесь пока пусто.</p></div>'}
const ymdPlus=n=>ymd(Date.now()+n*864e5);
function taskForm(tk,date,dayMode){
 const opts=sel=>approved().map(m=>'<option value="'+h(m.id)+'"'+(sel===m.id?' selected':'')+'>'+h(m.name)+'</option>').join('');
 const dueBtn=(lbl,n)=>{const v=n==null?'':ymdPlus(n);return '<button class="'+((tk.due||'')===v?'on':'')+'" data-act="tdue" data-v="'+v+'">'+lbl+'</button>'};
 const priBtn=(lbl,v)=>'<button class="'+((tk.pri||'normal')===v?'on':'')+'" data-act="tpri" data-v="'+v+'">'+lbl+'</button>';
 return '<section class="card"><h2>'+(dayMode?'Новая задача на '+h(fDay(ymdTs(date))):'Новая задача')+'</h2><div class="cols">'+
  '<div class="field"><label for="t-emp">Исполнитель</label><select id="t-emp" class="inp" data-tk="emp"><option value="">— выберите —</option>'+opts(tk.emp)+'</select></div>'+
  '<div class="field"><label for="t-emp2">Второй исполнитель (не обязательно)</label><select id="t-emp2" class="inp" data-tk="emp2"><option value="">— нет —</option>'+opts(tk.emp2)+'</select></div></div>'+
  '<div class="field"><label for="t-ti">Что сделать</label><input id="t-ti" class="inp" data-tk="title" value="'+h(tk.title||'')+'" placeholder="Подготовить акт, заказать кабель"></div>'+
  '<div class="field"><label for="t-no">Заметка (не обязательно)</label><input id="t-no" class="inp" data-tk="note" value="'+h(tk.note||'')+'" placeholder="Подробности для исполнителя"></div>'+
  '<div class="cols"><div class="field"><label>Срок</label><div class="seg">'+dueBtn('Сегодня',0)+dueBtn('1 день',1)+dueBtn('3 дня',3)+dueBtn('Без срока',null)+'</div></div>'+
  '<div class="field"><label for="t-due">или выбрать дату</label><input id="t-due" type="date" class="inp" data-tk="due" value="'+h(tk.due||'')+'"></div></div>'+
  '<div class="cols"><div class="field"><label>Важность</label><div class="seg">'+priBtn('Обычная','normal')+priBtn('Важно','important')+priBtn('Срочно','urgent')+'</div></div>'+
  '<div class="field"><label for="t-pl">Место (для выезда с проверкой GPS)</label><select id="t-pl" class="inp" data-tk="place"><option value="">— без места —</option>'+S.places.map(p=>'<option value="'+h(p.id)+'"'+(tk.place===p.id?' selected':'')+'>'+h(p.name)+'</option>').join('')+'</select></div></div>'+
  '<button class="btn primary" style="align-self:flex-start" data-act="tadd">Добавить задачу</button></section>'}

function vTasks(){const mode=S.tmode||'open';const today=ymd(Date.now());S.taskDate=S.taskDate||today;
 if(mode==='day')return vTasksDay();
 if(!S.form.tk)S.form.tk={emp:S.empF||'',place:''};
 const mine=t=>!S.empF||t.staff_id===S.empF||t.staff2_id===S.empF;
 const live=S.tasks.filter(t=>!t.archived_at&&t.status!=='cancelled'&&t.status!=='done'&&mine(t));
 const sorter=(a,b)=>(PRI_W[a.priority]??2)-(PRI_W[b.priority]??2)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.created_at).localeCompare(String(b.created_at));
 const lists={open:live.filter(t=>t.status==='new').sort(sorter),review:live.filter(t=>t.status==='report').sort(sorter),
  disc:live.filter(t=>t.disc_status==='open').sort(sorter),
  arch:S.tasks.filter(t=>t.status==='done'&&mine(t)).sort((a,b)=>(ms(b.archived_at||b.done_at)||0)-(ms(a.archived_at||a.done_at)||0))};
 const tabs=[['open','В работе'],['review','На проверке'],['disc','Обсуждения'],['arch','Архив'],['day','На день (GPS)']];
 let s=atop('Задачи','<div class="row wrapx">'+empSel()+'<button class="btn primary sm" data-act="tnew">'+I.plus+(S.tnew?'Скрыть форму':'Новая задача')+'</button></div>');
 s+='<div class="filters">'+tabs.map(x=>'<button class="'+(mode===x[0]?'on':'')+'" data-act="tmode" data-v="'+x[0]+'">'+x[1]+(lists[x[0]]&&lists[x[0]].length&&x[0]!=='arch'?' · '+lists[x[0]].length:'')+'</button>').join('')+'</div>';
 if(S.tnew)s+=taskForm(S.form.tk,today,false);
 s+='<section class="card tight">'+(mode==='review'?'<p class="small muted" style="margin:0">Сотрудник нажал «Готово». Откройте задачу и нажмите «Принять»: она уйдёт в архив вместе с перепиской и файлами.</p>':mode==='disc'?'<p class="small muted" style="margin:0">Сотрудник задал вопрос. Ответьте текстом, голосом или фото. Закрыть вопрос может только менеджер.</p>':mode==='arch'?'<p class="small muted" style="margin:0">Завершённые задачи. Откройте любую, чтобы увидеть хронологию: кто, что и когда сказал, с фото и голосовыми.</p>':'')+taskRows(lists[mode])+'</section>';
 return s}

const EVT={created:()=>'Задача создана',self_added:()=>'Сотрудник добавил задачу себе',assigned:b=>'Назначено: '+b,seen:()=>'👀 открыл(а) задачу',reported:()=>'✅ Сообщили о готовности',confirmed:()=>'✔ Принято менеджером',reopened:()=>'↩ Возвращена в работу',reminder:()=>'⏰ Отправлено напоминание: задачу не открыли',disc_open:()=>'💬 Открыто обсуждение',disc_closed:()=>'✔ Вопрос решён',due_changed:b=>'Срок или важность изменены: '+b,done_field:()=>'✅ Выполнено на месте (проверка GPS)',status:b=>'Статус: '+b};
function logHtml(t,log){if(!log.length)return '<p class="small muted">Записей пока нет.</p>';let day='',s='';
 log.forEach(l=>{const d=fDay(ms(l.at));if(d!==day){day=d;s+='<div class="label" style="margin-top:8px">'+h(d)+'</div>'}
  const who=h(l.actor_name)+(l.actor_role==='admin'?' <span class="tiny muted">менеджер</span>':l.actor_role==='staff'?' <span class="tiny muted">сотрудник</span>':'');
  let body;
  if(l.kind==='event'){const f=EVT[l.code];body='<span class="muted">'+h(f?f(l.body||''):(l.code||'событие'))+'</span>'+(l.actor_role!=='system'&&l.code!=='created'&&l.code!=='seen'?' · '+who:l.code==='seen'?' · '+who:'')}
  else{const to=l.actor_role==='staff'?'менеджеру':'→ '+h(tnames(t));
   body='<div><b>'+who+'</b> <span class="tiny muted">'+(l.actor_role==='staff'?'→ менеджеру':to)+'</span></div>'+
    (l.kind==='voice'&&l.path?'<audio controls preload="none" style="width:100%;max-width:340px" src="'+h(S.urls[l.path]||'')+'"></audio>':l.kind==='photo'&&l.path?thumb(l.path,'thumb lg'):'')+
    (l.body?'<div style="white-space:pre-wrap;overflow-wrap:anywhere">'+h(l.body)+'</div>':'')}
  s+='<div class="tl-i"><time>'+fHM(ms(l.at))+'</time><div>'+body+'</div></div>'});
 return '<div class="tl">'+s+'</div>'}
function taskSheet(t,log){const live=!t.archived_at&&t.status!=='cancelled';
 const fin=t.status==='done';
 return '<h2>'+h(t.title)+'</h2><div class="row wrapx" style="gap:6px">'+taskChips(t)+'</div>'+
  '<dl class="kv"><dt>Кто</dt><dd>'+h(tnames(t))+'</dd><dt>Срок</dt><dd>'+dueText(t)+'</dd><dt>Создана</dt><dd>'+fT(ms(t.created_at))+'</dd><dt>Открыл</dt><dd>'+(seenText(t)||'—')+'</dd>'+(t.report_at?'<dt>Сообщили о готовности</dt><dd>'+fT(ms(t.report_at))+'</dd>':'')+(t.place_id||t.lat!=null?'<dt>Место</dt><dd>'+h((S.places.find(p=>p.id===t.place_id)||{}).name||'')+(t.lat!=null?' <a class="chip c-muted" href="'+mapUrl({lat:t.lat,lng:t.lng})+'" target="_blank" rel="noopener">на карте</a>':'')+'</dd>':'')+(t.done_lat!=null?'<dt>Фото сделано</dt><dd>'+dChip(t.done_lat,t.done_lng,t.done_dist,((S.places.find(p=>p.id===t.place_id)||{}).radius)||+S.cfg.client_radius||200,'места')+'</dd>':'')+'</dl>'+
  (t.note?'<div class="flag note">'+h(t.note)+'</div>':'')+(t.done_note?'<div class="flag note">Сотрудник: '+h(t.done_note)+'</div>':'')+
  '<hr class="sep"><div class="label">Хронология</div>'+logHtml(t,log)+
  (live||fin?'<hr class="sep"><div class="field"><label for="tr-text">Ответ или комментарий</label><textarea id="tr-text" class="inp" placeholder="Напишите ответ, можно добавить фото или голосовое"></textarea></div>'+
   '<div class="row wrapx" style="gap:8px"><button class="btn primary sm" data-act="treply">Отправить</button><button class="btn ghost sm" data-act="tphoto">'+I.camera+'Фото</button><button class="btn ghost sm" id="tr-rec" data-act="trec">🎤 Голосовое</button></div>':'')+
  '<div class="row wrapx" style="gap:8px">'+
   (t.disc_status==='open'?'<button class="btn ghost sm" data-act="tdisc">✔ Вопрос решён</button>':'')+
   (live&&(t.status==='new'||t.status==='report')?'<button class="btn dark sm" data-act="tconfirm">✔ Принять и в архив</button>':'')+
   ((t.status==='report'||fin)?'<button class="btn ghost sm" data-act="treopen">↩ Вернуть в работу</button>':'')+
   (live&&t.status==='new'?'<button class="btn danger sm" data-act="tcancel">Отменить задачу</button>':'')+'</div>'+
  '<button class="btn ghost block" data-act="sheet" data-v="">Закрыть</button>'}
async function openTask(id,keep){const t=S.tasks.find(x=>x.id===id);if(!t)return;
 const r=await sb.from('task_log').select('*').eq('task_id',id).order('at').order('id');if(r.error)return toast('Ошибка: '+r.error.message);const log=r.data||[];
 const need=log.map(l=>l.path).filter(Boolean).filter(p=>!S.urls[p]);
 if(need.length){const u=await sb.storage.from('photos').createSignedUrls(need,3600);(u.data||[]).forEach(x=>{if(x.signedUrl)S.urls[x.path]=x.signedUrl})}
 const prev=document.querySelector('.sheet');const sc=prev?prev.scrollTop:0;const keepTxt=(document.getElementById('tr-text')||{}).value||'';
 sheet(taskSheet(t,log));S.tcur=id;const el=document.querySelector('.sheet');if(el){el.style.maxWidth='680px';if(keep)el.scrollTop=sc}
 const tx=document.getElementById('tr-text');if(tx&&keep&&keepTxt)tx.value=keepTxt}
async function rpcA(name,args){const r=await sb.rpc(name,args);if(r.error)throw r.error;if(r.data&&r.data.error)throw new Error(r.data.error);return r.data}
const A_ERR={EMPTY:'Напишите текст ответа',TASK_CLOSED:'Задача уже в архиве',WRONG_STATUS:'Статус уже изменился, обновите экран',NOT_ADMIN:'Только для администратора',NO_OPEN_DISCUSSION:'Обсуждение уже закрыто'};
const aErr=e=>{const m=String((e&&(e.message||e.error))||e);for(const k in A_ERR)if(m.includes(k))return A_ERR[k];return 'Ошибка: '+m};
async function afterTask(msg){if(msg)toast(msg);await load();if(S.tcur)await openTask(S.tcur,true)}
let recSt=null;
function recUi(on){const b=document.getElementById('tr-rec');if(b){b.textContent=on?'⏹ Остановить и отправить':'🎤 Голосовое';b.classList.toggle('danger',on)}}
async function shrinkImg(file){try{const bmp=await createImageBitmap(file);const k=Math.min(1,1600/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
 return await new Promise(r=>c.toBlob(b=>r(b||file),'image/jpeg',0.8))}catch(e){return file}}
async function sendTaskMedia(kind,blob){const id=S.tcur;if(!id)return;const uid=S.session.user.id;const ty=blob.type||'';const ext=ty.includes('mp4')?'m4a':ty.includes('webm')?'webm':ty.includes('ogg')?'ogg':ty.includes('jpeg')?'jpg':ty.includes('png')?'png':'bin';
 const path=uid+'/task-'+kind+'-'+Date.now()+'.'+ext;const up=await sb.storage.from('photos').upload(path,blob,{contentType:ty||undefined,upsert:false});
 if(up.error)return toast('Не загрузилось: '+up.error.message);const tx=document.getElementById('tr-text');const cap=tx?tx.value.trim():'';if(tx)tx.value='';
 try{await rpcA('task_reply',{p_id:id,p_kind:kind,p_body:cap||null,p_path:path});await afterTask('Отправлено')}catch(e){toast(aErr(e))}}

/* ---------- рендер ---------- */
const VIEWS={'a-dash':vDash,'a-staff':vStaff,'a-emp':vEmp,'a-shifts':vShifts,'a-fuel':vFuel,'a-orders':vOrders,'a-new':vNew,'a-order':vOrder,'a-buys':vBuys,'a-day':vDay,'a-tasks':vTasks,'a-places':vPlaces,'a-issues':vIssues,'a-photos':vPhotos,'a-settings':vSettings};
function render(keep){const y=window.scrollY;const root=document.getElementById('root');
 if(!CFG.SUPABASE_URL||/ВАШ_ПРОЕКТ/.test(CFG.SUPABASE_URL)){root.innerHTML='<div class="loginwrap"><div class="card"><h2>Админка не настроена</h2><p class="small">Откройте файл config.js и вставьте адрес проекта Supabase и ключ anon public.</p></div></div>';return}
 if(!S.session)root.innerHTML=vLogin();else if(!S.isAdmin)root.innerHTML=vClaim();else if(!S.loaded)root.innerHTML=shell('<div class="empty">Загрузка…</div>');else root.innerHTML=shell((VIEWS[S.view.name]||vDash)());
 if(keep)window.scrollTo(0,y);signPending();if(S.view.name==='a-day'&&S.loaded&&S.isAdmin)initDayMap();else if(S.view.name==='a-places'&&S.loaded&&S.isAdmin)initPlacesMap();else if(S.map){try{S.map.remove()}catch(e){}S.map=null}}
function go(name,p){S.view={name,p:p||{}};S.form={};render();window.scrollTo(0,0)}
let toastT;function toast(m){let el=document.getElementById('toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el)}el.textContent=m;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true},3500)}
let sheetRes=null;function sheet(html){closeSheet(null);return new Promise(r=>{sheetRes=r;const s=document.createElement('div');s.className='scrim';s.id='scrim';s.innerHTML='<div class="sheet" role="dialog" aria-modal="true">'+html+'</div>';s.addEventListener('click',e=>{if(e.target===s)closeSheet(null)});document.body.appendChild(s);const i=s.querySelector('input,button');if(i)i.focus()})}
function closeSheet(v){S.tcur=null;const s=document.getElementById('scrim');if(s)s.remove();if(sheetRes){const r=sheetRes;sheetRes=null;r(v)}}
const confirmBox=(title,text,ok)=>sheet('<h2>'+title+'</h2><p class="small">'+text+'</p><button class="btn danger block" data-act="sheet" data-v="y">'+ok+'</button><button class="btn ghost block" data-act="sheet" data-v="">Отмена</button>');
async function upd(table,id,patch,msg){const r=await sb.from(table).update(patch).eq('id',id);if(r.error){toast('Ошибка: '+r.error.message);return false}if(msg)toast(msg);await load();return true}

/* ---------- действия ---------- */
const ACT={
 sheet(d){closeSheet(d.v)},
 nav(d){go(d.v)},
 ago(d){go(d.v,d.id?{id:d.id}:{})},
 per(d){S.per=d.v;LS.set('per',d.v);render(true)},
 filter(d){S.filter=d.v;render(true)},
 bfilter(d){S.bf=d.v;render(true)},
 async more(){const MNk=['a-dash','a-day','a-buys','a-photos'];const v=await sheet('<h2>Разделы</h2><div class="mmore">'+ANAV.filter(x=>!MNk.includes(x[0])).map(x=>'<button class="btn ghost block" data-act="sheet" data-v="'+x[0]+'">'+I[x[2]]+x[1]+'</button>').join('')+'</div>'+(installable()?'<button class="btn primary block" data-act="sheet" data-v="install">Установить на телефон</button>':'')+'<button class="btn ghost block" data-act="sheet" data-v="logout">Выйти</button><button class="btn ghost block" data-act="sheet" data-v="">Закрыть</button>');
  if(!v)return;if(v==='logout')return ACT.logout();if(v==='install')return ACT.install();go(v)},
 async install(){if(installEvt){installEvt.prompt();try{await installEvt.userChoice}catch(e){}installEvt=null;render(true);return}
  if(isIOS())await sheet('<h2>Установка на iPhone</h2><p class="small">1. Нажмите кнопку «Поделиться» внизу Safari (квадрат со стрелкой).<br>2. Выберите «На экран «Домой»».<br>3. Нажмите «Добавить». Иконка Arev Admin появится на главном экране.</p><button class="btn primary block" data-act="sheet" data-v="">Понятно</button>')},
 ilv(d){S.ilv=d.v;render(true)},
 tdshift(d){S.taskDate=ymd(ymdTs(S.taskDate||ymd(Date.now()))+(+d.v)*864e5+36e5);render(true)},
 pltask(d){S.taskDate=S.taskDate||ymd(Date.now());go('a-tasks');S.form.tk={emp:S.empF||'',place:d.id};render()},
 async tadd(){const tk=S.form.tk||{};if(!tk.emp)return toast('Выберите сотрудника');const pl=S.places.find(p=>p.id===tk.place);const title=(tk.title||'').trim()||(pl?pl.name:'');if(!title)return toast('Напишите, что сделать');
  const n=S.tasks.filter(t=>t.masterId===tk.emp&&t.day===S.taskDate).length;
  if(tk.emp2&&tk.emp2===tk.emp)return toast('Второй исполнитель должен отличаться от первого');
  const r=await sb.from('tasks').insert({staff_id:tk.emp,staff2_id:tk.emp2||null,day:S.taskDate,due:tk.due||null,priority:tk.pri||'normal',created_by:S.session.user.id,place_id:pl?pl.id:null,title,note:(tk.note||'').trim()||null,lat:pl?pl.lat:null,lng:pl?pl.lng:null,ord:n});
  if(r.error)return toast('Ошибка: '+r.error.message);toast('Задача добавлена: '+(tech(tk.emp)||{}).name+(tk.emp2?' и '+(tech(tk.emp2)||{}).name:'')+'. Уведомление отправлено');S.form.tk={emp:tk.emp,place:''};S.tnew=false;await load()},
 async tdel(d){if(await confirmBox('Отменить задачу?','Сотрудник перестанет её видеть.','Отменить задачу')!=='y')return;await upd('tasks',d.id,{status:'cancelled'},'Задача отменена')},
 tnew(){S.tnew=!S.tnew;render(true)},
 tmode(d){S.tmode=d.v;S.form={};render(true)},
 tdue(d){S.form.tk=S.form.tk||{};S.form.tk.due=d.v||'';render(true)},
 tpri(d){S.form.tk=S.form.tk||{};S.form.tk.pri=d.v;render(true)},
 topen(d){openTask(d.id)},
 async treply(){const id=S.tcur;const tx=document.getElementById('tr-text');const body=tx?tx.value.trim():'';if(!body)return toast('Напишите текст ответа');
  try{await rpcA('task_reply',{p_id:id,p_kind:'text',p_body:body,p_path:null});if(tx)tx.value='';await afterTask('Ответ отправлен')}catch(e){toast(aErr(e))}},
 tphoto(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files&&i.files[0];if(!f)return;toast('Загружаю фото…');await sendTaskMedia('photo',await shrinkImg(f))};i.click()},
 async trec(){if(recSt){recSt.stop();return}
  if(!navigator.mediaDevices||!window.MediaRecorder)return toast('Этот браузер не умеет записывать голос');
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){return toast('Нет доступа к микрофону')}
  const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(x))||'';
  const mr=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks=[];
  mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());recSt=null;recUi(false);await sendTaskMedia('voice',new Blob(chunks,{type:mr.mimeType||mime||'audio/webm'}))};
  recSt=mr;mr.start();recUi(true)},
 async tdisc(){try{await rpcA('task_close_discussion',{p_id:S.tcur});await afterTask('Вопрос закрыт, сотрудники получили уведомление')}catch(e){toast(aErr(e))}},
 async tconfirm(){try{await rpcA('task_confirm',{p_id:S.tcur});toast('Принято, задача в архиве');S.tcur=null;closeSheet(null);await load()}catch(e){toast(aErr(e))}},
 async treopen(){const tx=document.getElementById('tr-text');try{await rpcA('task_reopen',{p_id:S.tcur,p_note:tx?tx.value.trim()||null:null});if(tx)tx.value='';await afterTask('Возвращено в работу')}catch(e){toast(aErr(e))}},
 async tcancel(){const id=S.tcur;if(await confirmBox('Отменить задачу?','Сотрудник перестанет её видеть.','Отменить задачу')!=='y')return;S.tcur=null;await upd('tasks',id,{status:'cancelled'},'Задача отменена')},
 addplace(d){go('a-places');S.form.pl={kind:'client',radius:'200',ll:(+d.lat).toFixed(6)+', '+(+d.lng).toFixed(6)};render();const n=document.getElementById('p-name');if(n)n.focus()},
 pledit(d){const x=S.places.find(p=>p.id===d.id);if(!x)return;S.form.pl={id:x.id,name:x.name,kind:x.kind,radius:String(x.radius),ll:x.lat+', '+x.lng,note:x.note||''};render();window.scrollTo(0,0)},
 plclear(){S.form.pl={kind:'client',radius:'200'};render(true)},
 async plsave(){const pl=S.form.pl||{};const c=plLL();if(!(pl.name||'').trim())return toast('Укажите название');if(!c)return toast('Нажмите на карту или вставьте координаты');
  const row={name:pl.name.trim(),kind:pl.kind||'client',radius:Math.max(30,Math.min(3000,+pl.radius||200)),lat:c.lat,lng:c.lng,note:(pl.note||'').trim()||null};
  const r=pl.id?await sb.from('places').update(row).eq('id',pl.id):await sb.from('places').insert(row);if(r.error)return toast('Ошибка: '+r.error.message);
  toast(pl.id?'Место сохранено':'Место добавлено: '+row.name);S.form.pl={kind:'client',radius:'200'};await load()},
 async pldel(d){const x=S.places.find(p=>p.id===d.id);if(await confirmBox('Удалить место?',h(x?x.name:'')+'. Стоянки здесь снова будут считаться неизвестными.','Удалить')!=='y')return;const r=await sb.from('places').delete().eq('id',d.id);if(r.error)return toast('Ошибка: '+r.error.message);toast('Удалено');await load()},
 kgo(d){const [v,x]=String(d.v).split('|');if(v==='a-shifts'||v==='a-fuel'){if(x){S.per=x;LS.set('per',x)}S.empF=null}if(v==='a-orders'&&x)S.filter=x;if(v==='a-buys'&&x){S.bf=x;S.empF=null}if(v==='a-issues'){S.ilv='bad';S.empF=null}go(v)},
 day(d){S.dayEmp=d.id;S.dayDate=ymd(Date.now());go('a-day')},
 dayopen(d){S.dayEmp=d.id;S.dayDate=d.v;go('a-day')},
 dayshift(d){const t=ymdTs(S.dayDate||ymd(Date.now()))+(+d.v)*864e5+36e5;if(t>Date.now()+864e5)return;S.dayDate=ymd(t);render(true)},
 dayfly(d){if(S.map){S.map.setView([+d.lat,+d.lng],17);document.getElementById('daymap').scrollIntoView({behavior:'smooth',block:'center'})}},
 async buyacc(d){const b=S.buys.find(x=>x.id===d.id);if(!b)return;const L=acceptLines(b);
  const v=await sheet('<h2>'+(L.length?'Приёмка на складе':'Подтвердить материал на объекте')+'</h2><p class="small">'+h(b.supplier)+' · '+money(b.amount)+' · '+h((tech(b.masterId)||{}).name||'')+'</p>'+
   (L.length?'<p class="small">Пересчитайте товар и впишите, сколько фактически пришло.</p>'+L.map((l,i)=>'<div class="field"><label for="ba'+i+'">'+h(l.name)+': ожидается '+n1(l.qty)+(l.unit?' '+h(l.unit):'')+'</label><input id="ba'+i+'" class="inp num" inputmode="decimal" value="'+h(l.qty)+'"></div>').join(''):'<p class="small">Проверьте фото материала на объекте и спросите клиента при звонке, что материал установлен.</p>')+
   '<div class="field"><label for="ban">Комментарий</label><input id="ban" class="inp"></div><button class="btn primary block" data-act="baok" data-n="'+L.length+'">'+(L.length?'Принять':'Подтвердить')+'</button><button class="btn ghost block" data-act="sheet" data-v="">Отмена</button>');
  if(!v||typeof v!=='object')return;const short=L.some((l,i)=>v.got[i]<+l.qty-1e-9);
  await upd('purchases',b.id,{status:'accepted',accepted_at:new Date().toISOString(),accepted_lines:L.map((l,i)=>({name:l.name,unit:l.unit,qty:v.got[i]})),shortage:short,accept_note:v.note||null},short?'Принято с недостачей':'Принято')},
 baok(d){const n=+d.n;const got=[];for(let i=0;i<n;i++){const x=parseFloat(String(document.getElementById('ba'+i).value).replace(',','.'));got.push(isFinite(x)&&x>=0?x:0)}const nt=document.getElementById('ban');closeSheet({got,note:nt?nt.value.trim():''})},
 async buycancel(d){if(await confirmBox('Отменить закупку?','Например, сотрудник внёс её по ошибке или дважды. Отмена видна в истории.','Отменить закупку')!=='y')return;await upd('purchases',d.id,{status:'cancelled',accept_note:'Отменено администратором'},'Закупка отменена')},
 reload(){load().then(()=>toast('Данные обновлены'))},
 view(d,el){const src=el.currentSrc||el.src;if(!src)return;const v=document.createElement('div');v.className='viewer';v.innerHTML='<img src="'+h(src)+'" alt="Фото"><button aria-label="Закрыть">×</button>';v.addEventListener('click',()=>v.remove());document.body.appendChild(v)},
 async login(){const f=S.form;const r=await sb.auth.signInWithPassword({email:(f.email||'').trim(),password:f.pw||''});if(r.error)toast(r.error.message==='Invalid login credentials'?'Неверный e-mail или пароль':r.error.message)},
 async signup(){const f=S.form;if(!(f.email||'').includes('@')||(f.pw||'').length<8)return toast('Укажите e-mail и пароль не короче 8 символов');const r=await sb.auth.signUp({email:f.email.trim(),password:f.pw});if(r.error)return toast(r.error.message);if(!r.data.session)toast('Аккаунт создан. Если в Supabase включено подтверждение почты, подтвердите e-mail и войдите.')},
 async claim(){const r=await sb.rpc('claim_first_admin');if(r.error||(r.data&&r.data.error))return toast(r.data&&r.data.error==='ADMIN_EXISTS'?'Администратор уже есть. Попросите его добавить вас.':'Ошибка: '+((r.error&&r.error.message)||r.data.error));S.isAdmin=true;render();load()},
 async logout(){await sb.auth.signOut()},
 async approve(d){const m=tech(d.id);await upd('staff',d.id,{status:'approved',approved_at:new Date().toISOString(),norm_approved:m.norm_approved||m.norm_claimed||null},m.name+' принят')},
 async reject(d){const v=await sheet('<h2>Отклонить анкету?</h2><div class="field"><label for="rj">Причина (её увидит сотрудник)</label><input id="rj" class="inp"></div><button class="btn danger block" data-act="rjok">Отклонить</button><button class="btn ghost block" data-act="sheet" data-v="">Отмена</button>');if(v==null)return;await upd('staff',d.id,{status:'rejected',note:v},'Отклонено')},
 rjok(){const i=document.getElementById('rj');closeSheet((i&&i.value.trim())||'')},
 async block(d){if(S.tickets.some(t=>t.techId===d.id&&['assigned','enroute','onsite'].includes(t.status)))return toast('У сотрудника есть активный заказ. Сначала переназначьте его');if(await confirmBox('Приостановить доступ?','Сотрудник не сможет начинать смены и брать заказы.','Приостановить')!=='y')return;await upd('staff',d.id,{status:'blocked'},'Доступ приостановлен')},
 async restore(d){await upd('staff',d.id,{status:'approved',note:null},'Доступ возвращён')},
 async setcard(d){const v=String(S.form.card!=null?S.form.card:'').replace(/\D/g,'');if(v&&v.length<4)return toast('Нужно минимум 4 цифры');await upd('staff',d.id,{card_last4:v||null},'Карта сохранена')},
 async setnorm(d){const v=+String(S.form.norm!=null?S.form.norm:'').replace(',','.');if(!v||v>40)return toast('Укажите расход, например 7,5');await upd('staff',d.id,{norm_approved:v,norm_claimed:v},'Расход утверждён')},
 async resetdev(d){if(await confirmBox('Разрешить вход с нового телефона?','Сотрудник будет привязан к телефону, с которого сделает следующее действие.','Разрешить')!=='y')return;await upd('staff',d.id,{device_id:null},'Привязка сброшена')},
 async resetpin(d){const pin=String(S.form.pin||'');if(!/^\d{6,12}$/.test(pin))return toast('PIN-код — от 6 до 12 цифр');const r=await sb.functions.invoke('admin-tools',{body:{action:'reset_pin',staff_id:d.id,pin}});if(r.error||(r.data&&r.data.error))return toast('Не получилось: '+((r.data&&r.data.error)||r.error.message));S.form.pin='';toast('Новый PIN-код задан. Сообщите его сотруднику');render(true)},
 async ai(){S.busy='ai';render(true);try{let total=0;for(let i=0;i<5;i++){const r=await sb.functions.invoke('admin-tools',{body:{action:'ai',limit:15}});if(r.error||(r.data&&r.data.error)){toast('Проверка ИИ: '+((r.data&&r.data.error)||r.error.message));break}total+=r.data.checked||0;if(!r.data.left)break}toast('Проверено фото: '+total);await load()}finally{S.busy=false;render(true)}},
 imppick(){if(typeof XLSX==='undefined')return toast('Не загрузился модуль чтения Excel. Обновите страницу');const i=document.getElementById('fileSheet');i.value='';i.click()},
 impcancel(){S.imp=null;render(true)},
 async impsave(){const im=S.imp;if(!im)return;const rows=im.rows.map(r=>parseTxRow(r,im.map)).filter(Boolean).map(t=>({id:'tx'+strHash(t.card+'|'+t.at+'|'+t.liters+'|'+t.amount),at:new Date(t.at).toISOString(),card:t.card,liters:t.liters,amount:t.amount,station:t.station,product:t.product,file:im.name.slice(0,80)}));
  S.busy='imp';render(true);let n=0;for(let i=0;i<rows.length;i+=200){const r=await sb.from('card_tx').upsert(rows.slice(i,i+200));if(r.error){toast('Ошибка: '+r.error.message);break}n+=Math.min(200,rows.length-i)}
  S.busy=false;S.imp=null;toast('Загружено операций: '+n);await load()},
 async createorder(){const f=S.form;if(!(f.cname||'').trim()||!(f.cphone||'').trim()||!(f.addr||'').trim())return toast('Укажите клиента, телефон и адрес');
  const m=String(f.ll||'').match(/(-?\d+[.,]\d+)\s*[, ]\s*(-?\d+[.,]\d+)/);S.busy=true;
  const r=await sb.from('tickets').insert({client_name:f.cname.trim(),client_phone:f.cphone.trim(),address:f.addr.trim(),lat:m?+m[1].replace(',','.'):null,lng:m?+m[2].replace(',','.'):null,category:f.cat||'other',descr:f.desc||null,err_code:f.err||null,urgent:!!f.urgent,est_min:+f.emin||null,est_max:+f.emax||+f.emin||null}).select().single();
  S.busy=false;if(r.error)return toast('Ошибка: '+r.error.message);toast('Заявка '+r.data.num+' создана, её видят сотрудники на смене');await load();go('a-order',{id:r.data.id})},
 async assign(d,el){const t=T(S.view.p.id);const v=el.value||null;const patch={staff_id:v};if(v&&t.status==='new'){patch.status='assigned';patch.assigned_at=new Date().toISOString()}if(!v&&t.status==='assigned'){patch.status='new';patch.assigned_at=null}await upd('tickets',t.id,patch,v?'Назначен: '+tech(v).name:'Сотрудник снят')},
 async confirm(){const t=T(S.view.p.id);await upd('tickets',t.id,{status:'closed',closed_at:new Date().toISOString(),confirmed_by:'admin',rating:+S.form.rate||5},'Визит подтверждён')},
 async dispute(){const t=T(S.view.p.id);if(await confirmBox('Клиент говорит, что мастера не было?','Заказ будет отмечен с оценкой 1 и отзывом клиента. Разберитесь с сотрудником.','Отметить')!=='y')return;await upd('tickets',t.id,{rating:1,review:'Клиент сообщил, что мастера не было'},'Отмечено')},
 async cancel(){if(await confirmBox('Отменить заявку?','Сотрудники перестанут её видеть.','Отменить заявку')!=='y')return;await upd('tickets',S.view.p.id,{status:'cancelled'},'Заявка отменена')},
 here(){if(!navigator.geolocation)return toast('Это устройство не определяет местоположение');navigator.geolocation.getCurrentPosition(p=>{S.form.c.ll=p.coords.latitude.toFixed(6)+', '+p.coords.longitude.toFixed(6);render(true);toast('Точка взята (точность ±'+Math.round(p.coords.accuracy)+' м). Нажмите «Сохранить»')},()=>toast('Не удалось определить местоположение'),{enableHighAccuracy:true,timeout:10000})},
 async savecfg(){const c=S.form.c;const m=String(c.ll!=null?c.ll:(c.office_lat!=null?c.office_lat+','+c.office_lng:'')).match(/(-?\d+[.,]\d+)\s*[, ]\s*(-?\d+[.,]\d+)/);
  const num=k=>{const v=parseFloat(String(c[k]).replace(',','.'));return isFinite(v)?v:null};
  const wm=String(c.wll!=null?c.wll:(c.warehouse_lat!=null?c.warehouse_lat+','+c.warehouse_lng:'')).match(/(-?\d+[.,]\d+)\s*[, ]\s*(-?\d+[.,]\d+)/);
  const patch={company:c.company||'Arev Service',office_lat:m?+m[1].replace(',','.'):null,office_lng:m?+m[2].replace(',','.'):null,office_wifi:(c.office_wifi||'').trim()||null,office_radius:num('office_radius')||150,client_radius:num('client_radius')||200,
   work_start:c.work_start||'09:00',work_end:c.work_end||'18:00',grace_min:num('grace_min')??10,max_idle_min:num('max_idle_min')||120,default_norm:num('default_norm')||9,route_k:Math.min(3,Math.max(1,num('route_k')||1.3)),photo_max_age_min:num('photo_max_age_min')||10,
   warehouse_lat:wm?+wm[1].replace(',','.'):null,warehouse_lng:wm?+wm[2].replace(',','.'):null,purchase_max_hours:num('purchase_max_hours')||24,stop_min:num('stop_min')||20,long_stop_min:num('long_stop_min')||30,office_phone:(c.office_phone||'').trim()||null,updated_at:new Date().toISOString()};
  const r=await sb.from('config').update(patch).eq('id',1);if(r.error)return toast('Ошибка: '+r.error.message);toast('Настройки сохранены');S.form={};await load()}
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;if(['assign','emp','impmap','urg','dayemp','daydate','tdate'].includes(a))return;if(el.tagName==='A')return;const fn=ACT[a];if(fn){e.preventDefault();fn(el.dataset,el)}});
document.addEventListener('change',e=>{const el=e.target;const a=el.dataset.act;if(a==='assign')ACT.assign(el.dataset,el);if(a==='emp'){S.empF=el.value||null;render(true)}if(a==='impmap'&&S.imp){S.imp.map[el.dataset.k]=+el.value;render(true)}if(a==='urg')S.form.urgent=el.checked;if(a==='dayemp'){S.dayEmp=el.value;render(true)}if(a==='tdate'&&el.value){S.taskDate=el.value;render(true)}if(el.dataset.tk){S.form.tk=S.form.tk||{};S.form.tk[el.dataset.tk]=el.value}if(a==='daydate'&&el.value){S.dayDate=el.value;render(true)}if(el.dataset.f&&el.tagName==='SELECT')S.form[el.dataset.f]=el.value;if(el.dataset.pl&&el.tagName==='SELECT'){S.form.pl=S.form.pl||{};S.form.pl[el.dataset.pl]=el.value}if(el.dataset.pl==='ll'||el.dataset.pl==='radius')render(true)});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.f)S.form[el.dataset.f]=el.value;if(el.dataset.pl){S.form.pl=S.form.pl||{};S.form.pl[el.dataset.pl]=el.value}if(el.dataset.tk&&el.tagName!=='SELECT'){S.form.tk=S.form.tk||{};S.form.tk[el.dataset.tk]=el.value}if(el.dataset.c!=null)S.form.c[el.dataset.c]=el.value});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!S.session&&e.target.matches('#l-pw'))ACT.login()});
document.getElementById('fileSheet').addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{S.imp=await readSheet(file);render(true)}catch(err){toast('Не удалось прочитать файл. Нужен Excel (.xlsx) или CSV')}});

/* ---------- запуск ---------- */
async function onSession(s){S.session=s;S.isAdmin=false;S.loaded=false;if(s){const r=await sb.rpc('is_admin');S.isAdmin=!!r.data;if(S.isAdmin)await load()}render()}
sb.auth.getSession().then(({data})=>onSession(data.session||null));
sb.auth.onAuthStateChange((ev,s)=>{if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')onSession(s||null)});
setInterval(()=>{if(S.isAdmin&&!document.hidden&&!S.busy&&S.view.name!=='a-day'&&S.view.name!=='a-places'&&!document.querySelector('#root input:focus,#root textarea:focus,#root select:focus'))load()},60000);
render();
})();
