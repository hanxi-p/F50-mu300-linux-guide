'use strict';
'require rpc';
'require ui';
'require baseclass';
var get=rpc.declare({object:'f50highrail',method:'status',nobatch:true});
var set=rpc.declare({object:'f50highrail',method:'set_enabled',params:['enabled'],nobatch:true});
return baseclass.extend({mount:function(root){
 var b=root.querySelector('#mud-btn-highspeed'),state,timer,disposed=false,pending=false,waiting=false,accepted=false,target=false,started=0,lastError='';
 function refresh(){if(disposed||pending)return Promise.resolve();pending=true;return get().then(function(s){
  if(disposed)return;state=s;
  if(waiting&&accepted&&!s.busy){
   if(s.error || !!s.enabled!==target){waiting=false;ui.addNotification(null,E('p',{},s.error||'基带读回值不一致，请重新检查'));}
   else {waiting=false;ui.addNotification(null,E('p',{},'高铁模式参数已写入并读回确认。UFI-TOOLS 提示重启生效，但未明确重启范围；协议栈重启是否足够尚未确认。'));}
  }
  if(waiting && Date.now()-started>45000){waiting=false;ui.addNotification(null,E('p',{},'操作超时，请检查基带状态'));}
  b.className='mud-btn'+(s.enabled?' on':'');b.disabled=waiting||s.busy||!s.supported;
  b.classList.toggle('f50-highrail-switching',waiting);
  b.textContent=waiting?(target?'高铁模式开启中':'高铁模式关闭中'):s.busy?'高铁模式 · 读取中…':s.supported?'高铁模式':'高铁模式 · 状态待确认';
  b.title='F50 基带高铁参数；不执行每3秒强制锁小区';b.setAttribute('aria-pressed',s.enabled?'true':'false');
  if(s.error && s.error!==lastError && !waiting)ui.addNotification(null,E('p',{},s.error));lastError=s.error||'';
 }).catch(function(){b.disabled=true;b.textContent='高铁模式 · 状态不可用';}).finally(function(){pending=false;});}
 function schedule(){if(disposed)return;timer=setTimeout(function(){if(disposed||!document.documentElement.contains(root))return;refresh().finally(schedule);},waiting||(state&&state.busy)?1000:5000);}
 b.onclick=function(){if(!state||state.busy||waiting||!state.supported)return;target=!state.enabled;waiting=true;accepted=false;started=Date.now();b.disabled=true;b.classList.add('f50-highrail-switching');b.textContent=target?'高铁模式开启中':'高铁模式关闭中';
  set(target).then(function(r){if(disposed)return;if(!r.ok)throw new Error(r.error||'设置失败');accepted=true;return refresh();}).catch(function(e){if(disposed)return;waiting=false;ui.addNotification(null,E('p',{},e.message));refresh();});};
 refresh().finally(schedule);return function(){disposed=true;clearTimeout(timer);};
}});
