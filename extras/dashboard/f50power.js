'use strict';
'require rpc';
'require ui';
'require baseclass';
'require mu300.common as M';
var get=rpc.declare({object:'f50power',method:'status'});
var set=rpc.declare({object:'f50power',method:'set',params:['mode']});
return baseclass.extend({mount:function(root){
 var btn=root.querySelector('#mud-btn-power'),nr=root.querySelector('#mud-btn-5g'),timer,disposed=false,waiting=false,countdown=null,deadline=0,targetMode='auto',lastError='';
 function refresh(){return get().then(function(s){
  btn.textContent=s.busy?'温控模式 · 切换中…':s.mode==='eco'?'能效模式（全小核）':'性能模式（8核）';
  btn.title=s.mode==='eco'?'4 个小核，最高 '+(Number(s.max_khz)/1000000).toFixed(3)+' GHz':'8 核，按负载动态调频';
  btn.dataset.mode=s.mode==='eco'?'eco':'performance'; btn.disabled=!!s.busy; btn.setAttribute('aria-pressed',s.mode==='eco'?'true':'false');
  root.querySelector('#mud-phone').textContent=s.phone || 'SIM 未提供';
  if(s.error && s.error!==lastError)ui.addNotification(null,E('p',{},s.error));lastError=s.error;
  return M.callLockGet();
 }).then(function(s){var label=s.mode && s.mode.label;if(waiting && Date.now()>=deadline && label===targetMode){waiting=false;clearInterval(countdown);countdown=null;}nr.textContent=waiting?(Date.now()<deadline?'切换 '+Math.max(0,Math.ceil((deadline-Date.now())/1000))+'s':'确认中…'):label==='4g'?'4G 模式':'自动 5G';nr.dataset.mode=label || 'auto';nr.disabled=waiting;nr.setAttribute('aria-pressed',label==='4g'?'false':'true');});}
 btn.onclick=function(){btn.disabled=true;get().then(function(s){return set(s.mode==='eco'?'performance':'eco');}).then(function(r){if(!r.ok)throw new Error(r.error);return refresh();}).catch(function(e){ui.addNotification(null,E('p',{},e.message));btn.disabled=false;});};
 nr.onclick=function(){targetMode=nr.dataset.mode==='4g'?'auto':'4g';nr.disabled=true;waiting=true;deadline=Date.now()+10000;nr.textContent='切换 10s';
  countdown=setInterval(function(){var left=Math.max(0,Math.ceil((deadline-Date.now())/1000));nr.textContent='切换 '+left+'s';if(!left){clearInterval(countdown);countdown=null;nr.textContent='确认中…';}},1000);
  M.callLockSet('mode',targetMode).then(function(r){if(!r.ok)throw new Error(M.errText(r));setTimeout(function(){clearInterval(countdown);countdown=null;if(!disposed)refresh();},Math.max(0,deadline-Date.now()));}).catch(function(e){waiting=false;clearInterval(countdown);countdown=null;nr.disabled=false;refresh();ui.addNotification(null,E('p',{},e.message));});
 };
 function schedule(){timer=setTimeout(function(){if(!disposed && document.documentElement.contains(root))refresh().catch(function(){}).finally(schedule);},5000);}
 refresh().catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(schedule);
 return function(){disposed=true;clearTimeout(timer);clearInterval(countdown);};
}});
