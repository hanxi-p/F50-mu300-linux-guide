'use strict';
'require rpc';
'require ui';
'require baseclass';
'require mu300.common as M';
var get=rpc.declare({object:'f50power',method:'status'});
var set=rpc.declare({object:'f50power',method:'set',params:['mode']});
var radioGet=rpc.declare({object:'mu300dash',method:'lock_get',nobatch:true,expect:{'':{}}});
var radioSet=rpc.declare({object:'mu300dash',method:'lock_set',params:['kind','val'],nobatch:true,expect:{'':{}}});
var SWITCH_ESTIMATE_S={ '4g':20, auto:20 };
return baseclass.extend({mount:function(root){
 var btn=root.querySelector('#mud-btn-power'),nr=root.querySelector('#mud-btn-5g'),timer,radioTimer,disposed=false,waiting=false,deadline=0,targetMode='auto',lastError='',startedAt=0,startedCellTs=0,lastCellTs=0,accepted=false,checking=false,applied=false;
 function paint(){if(disposed)return;nr.disabled=waiting;if(waiting){var left=Math.max(0,Math.ceil((deadline-Date.now())/1000));nr.textContent=left?(applied?'联网 ':'切换 ')+left+'s':applied?'等待网络恢复…':'切换确认中…';}else {nr.textContent=nr.dataset.mode==='4g'?'4G 模式':'自动 5G';nr.appendChild(E('small',{style:'display:block;font-size:10px;line-height:1.3;opacity:.85'},'预计切换需 20 秒'));}nr.title='点击立即切换，预计需 20 秒；联网恢复后自动结束';}
 function stop(){waiting=false;clearTimeout(radioTimer);radioTimer=null;paint();}
 function checkRadio(){if(disposed||checking)return Promise.resolve();checking=true;return radioGet().then(function(s){
  if(disposed)return;if(s.error)throw new Error(s.error);
  var label=s.mode && s.mode.label;lastCellTs=Number(s.cell_ts)||0;
  nr.dataset.mode=label || 'auto';nr.setAttribute('aria-pressed',label==='4g'?'false':'true');
  if(waiting && accepted){
   applied=!s.applying && label===targetMode && Number(s.ts)>0;
   var registered=Number(s.registration)===1 || Number(s.registration)===5;
   var correctRat=targetMode==='auto' || Number(s.access)===7 || Number(s.access)===10;
   if(applied && registered && correctRat && s.data_up && lastCellTs>startedCellTs)stop();
  }
  paint();
 }).finally(function(){checking=false;});}
 function radioLoop(){if(disposed||!waiting)return;paint();if(Date.now()-startedAt>=150000){stop();ui.addNotification(null,E('p',{},'网络尚未恢复，请查看蜂窝网络状态；已解除按钮锁定，可重新选择制式。'));return;}
  checkRadio().catch(function(){}).finally(function(){if(!disposed&&waiting)radioTimer=setTimeout(radioLoop,1000);});}
 function refresh(){return get().then(function(s){if(disposed)return;
  btn.textContent=s.busy?'温控模式 · 切换中…':s.mode==='eco'?'能效模式（全小核）':'性能模式（8核）';
  btn.title=s.mode==='eco'?'4 个小核，最高 '+(Number(s.max_khz)/1000000).toFixed(3)+' GHz':'8 核，按负载动态调频';
  btn.dataset.mode=s.mode==='eco'?'eco':'performance';btn.disabled=!!s.busy;btn.setAttribute('aria-pressed',s.mode==='eco'?'true':'false');
  root.querySelector('#mud-phone').textContent=s.phone || 'SIM 未提供';
  if(s.error && s.error!==lastError)ui.addNotification(null,E('p',{},s.error));lastError=s.error;
  if(!waiting)return checkRadio();
 });}
 btn.onclick=function(){btn.disabled=true;get().then(function(s){return set(s.mode==='eco'?'performance':'eco');}).then(function(r){if(!r.ok)throw new Error(r.error);return refresh();}).catch(function(e){ui.addNotification(null,E('p',{},e.message));btn.disabled=false;});};
 nr.onclick=function(){if(waiting||disposed)return;targetMode=nr.dataset.mode==='4g'?'auto':'4g';waiting=true;accepted=false;applied=false;startedAt=Date.now();startedCellTs=lastCellTs;deadline=startedAt+SWITCH_ESTIMATE_S[targetMode]*1000;paint();
  // Send now: the countdown estimates work already in progress, never delays it.
  radioSet('mode',targetMode).then(function(r){if(disposed)return;if(!r.ok)throw new Error(M.errText(r));accepted=true;}).catch(function(e){if(disposed)return;stop();ui.addNotification(null,E('p',{},e.message));checkRadio().catch(function(){});});
  radioTimer=setTimeout(radioLoop,1000);
 };
 function schedule(){if(disposed)return;timer=setTimeout(function(){if(!disposed && document.documentElement.contains(root))refresh().catch(function(){}).finally(schedule);},5000);}
 refresh().catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(schedule);
 return function(){disposed=true;clearTimeout(timer);clearTimeout(radioTimer);};
}});
