'use strict';
'require rpc';
'require ui';
'require baseclass';
'require mu300.common as M';
var get=rpc.declare({object:'f50power',method:'status',nobatch:true});
var set=rpc.declare({object:'f50power',method:'set',params:['mode'],nobatch:true});
var radioGet=rpc.declare({object:'mu300dash',method:'lock_get',nobatch:true,expect:{'':{}}});
var radioSet=rpc.declare({object:'mu300dash',method:'lock_set',params:['kind','val'],nobatch:true,expect:{'':{}}});
var SWITCH_ESTIMATE_S={ '4g':30, auto:30 };
function boundedRequest(p){return new Promise(function(resolve,reject){var t=setTimeout(function(){reject(new Error('设备未响应，正在重试'));},8000);p.then(function(v){clearTimeout(t);resolve(v);},function(e){clearTimeout(t);reject(e);});});}
return baseclass.extend({mount:function(root){
 var btn=root.querySelector('#mud-btn-power'),nr=root.querySelector('#mud-btn-5g'),timer,radioTimer,disposed=false,waiting=false,deadline=0,targetMode='auto',lastError='',startedAt=0,startedCellTs=0,lastCellTs=0,accepted=false,checking=false,applied=false,powerTarget=null;
 nr.style.display='flex';nr.style.flexDirection='column';nr.style.alignItems='center';nr.style.justifyContent='center';nr.style.gap='2px';
 var externalBusy=false,radioOnline=false;
 function remember(){try{sessionStorage.setItem('f50-radio-switch',JSON.stringify({target:targetMode,start:startedAt,cell:startedCellTs}));}catch(e){}}
 try{var saved=JSON.parse(sessionStorage.getItem('f50-radio-switch'));if(saved && ['auto','4g'].indexOf(saved.target)>=0 && Date.now()-saved.start>=0 && Date.now()-saved.start<150000){waiting=true;accepted=true;targetMode=saved.target;startedAt=saved.start;startedCellTs=saved.cell;deadline=startedAt+SWITCH_ESTIMATE_S[targetMode]*1000;}}catch(e){}
 nr.disabled=true;nr.textContent='制式 · 读取中…';
 function paint(){if(disposed)return;nr.disabled=!radioOnline||waiting||externalBusy;nr.dataset.switching=radioOnline&&waiting?'true':'false';nr.dataset.targetMode=radioOnline&&waiting?targetMode:'';
  if(!radioOnline){nr.textContent='制式 · 设备未响应';nr.title='无法确认当前状态，正在自动重试';return;}
  var label=waiting?targetMode:nr.dataset.mode;
  nr.textContent=waiting?('切换为'+(targetMode==='4g'?'4G':'5G')):externalBusy?'制式切换中…':(label==='4g'?'4G 模式':'自动 5G');
  var hint='';
  if(waiting){var left=Math.max(0,Math.ceil((deadline-Date.now())/1000));hint=left?'还需'+left+'秒':applied?'正在恢复网络…':'正在确认切换…';}
  if(waiting)nr.appendChild(E('small',{style:'display:block;font-size:10px;line-height:1.3;opacity:.85'},hint));
  nr.title='点击立即切换，预计需 30 秒；联网恢复后自动结束';
 }

 function stop(){waiting=false;try{sessionStorage.removeItem('f50-radio-switch');}catch(e){}clearTimeout(radioTimer);radioTimer=null;paint();}
 function checkRadio(){if(disposed||checking)return Promise.resolve();checking=true;return boundedRequest(radioGet()).then(function(s){
  if(disposed)return;if(s.error)throw new Error(s.error);
  var label=s.mode && s.mode.label;lastCellTs=Number(s.cell_ts)||0;
  if(label!=='auto' && label!=='4g')throw new Error('制式状态尚未就绪');
  radioOnline=true;externalBusy=!!s.applying;nr.dataset.mode=label;nr.classList.toggle('on',label==='auto');nr.setAttribute('aria-pressed',label==='4g'?'false':'true');
  if(waiting && accepted){
   if(!s.applying && s.apply_error){stop();ui.addNotification(null,E('p',{},s.apply_error));return;}
   applied=!s.applying && label===targetMode && Number(s.ts)>0;
   var registered=Number(s.registration)===1 || Number(s.registration)===5;
   var correctRat=targetMode==='auto' || Number(s.access)===7 || Number(s.access)===10;
   if(applied && registered && correctRat && s.data_up && lastCellTs>startedCellTs)stop();
  }
  paint();
 }).catch(function(e){if(!disposed){radioOnline=false;paint();}throw e;}).finally(function(){checking=false;});}
 function radioLoop(){if(disposed||!waiting)return;paint();if(Date.now()-startedAt>=150000){stop();ui.addNotification(null,E('p',{},'网络尚未恢复，请查看蜂窝网络状态；已解除按钮锁定，可重新选择制式。'));return;}
  checkRadio().catch(function(){});if(!disposed&&waiting)radioTimer=setTimeout(radioLoop,1000);}
 function refresh(){var radio=checkRadio().catch(function(){});return boundedRequest(get()).then(function(s){if(disposed)return;
  btn.dataset.switching=s.busy?'true':'false';btn.dataset.targetMode=s.busy?(powerTarget||(s.mode==='eco'?'performance':'eco')):'';
  btn.textContent=s.busy?((powerTarget|| (s.mode==='eco'?'performance':'eco'))==='performance'?'大核开启中':'大核关闭中'):s.mode==='eco'?'能效模式':'性能模式';
  if(!s.busy)powerTarget=null;
  btn.title=s.mode==='eco'?'4 个小核，最高 '+(Number(s.max_khz)/1000000).toFixed(3)+' GHz':'8 核，按负载动态调频';
  btn.dataset.mode=s.mode==='eco'?'eco':'performance';btn.disabled=!!s.busy;btn.setAttribute('aria-pressed',s.mode==='eco'?'true':'false');
  root.querySelector('#mud-phone').textContent=s.phone || 'SIM 未提供';
  if(s.error && s.error!==lastError)ui.addNotification(null,E('p',{},s.error));lastError=s.error;
 }).catch(function(e){if(!disposed){btn.disabled=true;btn.dataset.switching='false';btn.textContent='性能 · 设备未响应';}throw e;}).then(function(){return radio;});}
 btn.onclick=function(){if(btn.disabled||disposed)return;btn.disabled=true;powerTarget=btn.dataset.mode==='eco'?'performance':'eco';btn.dataset.switching='true';btn.dataset.targetMode=powerTarget;btn.textContent=powerTarget==='performance'?'大核开启中':'大核关闭中';boundedRequest(get()).then(function(s){if(disposed)return;powerTarget=s.mode==='eco'?'performance':'eco';btn.dataset.targetMode=powerTarget;btn.textContent=powerTarget==='performance'?'大核开启中':'大核关闭中';return boundedRequest(set(powerTarget));}).then(function(r){if(disposed)return;if(!r.ok)throw new Error(r.error);return refresh();}).catch(function(e){if(disposed)return;ui.addNotification(null,E('p',{},e.message));btn.disabled=false;btn.dataset.switching='false';btn.dataset.targetMode='';refresh().catch(function(){});});};
 nr.onclick=function(){if(!radioOnline||waiting||externalBusy||disposed)return;targetMode=nr.dataset.mode==='4g'?'auto':'4g';waiting=true;accepted=false;applied=false;startedAt=Date.now();startedCellTs=lastCellTs;deadline=startedAt+SWITCH_ESTIMATE_S[targetMode]*1000;paint();
  // Send now: the countdown estimates work already in progress, never delays it.
  boundedRequest(radioSet('mode',targetMode)).then(function(r){if(disposed||!waiting)return;if(!r.ok)throw new Error(M.errText(r));accepted=true;remember();}).catch(function(e){if(disposed)return;radioOnline=false;stop();ui.addNotification(null,E('p',{},'切换请求未确认：'+e.message));checkRadio().catch(function(){});});
  radioTimer=setTimeout(radioLoop,1000);
 };
 function schedule(){if(disposed)return;timer=setTimeout(function(){if(!disposed && document.documentElement.contains(root))refresh().catch(function(){}).finally(schedule);},5000);}
 refresh().catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(schedule);
 if(waiting)radioTimer=setTimeout(radioLoop,1000);
 return function(){disposed=true;clearTimeout(timer);clearTimeout(radioTimer);};
}});
