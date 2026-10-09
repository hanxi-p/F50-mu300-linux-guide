'use strict';
'require rpc';
'require ui';
'require baseclass';
var get=rpc.declare({object:'f50channel',method:'status'});
var set=rpc.declare({object:'f50channel',method:'set',params:['channel']});
return baseclass.extend({mount:function(root){
 var btn=root.querySelector('#mud-btn-channel'),timer,disposed=false;
 function refresh(){return get().then(function(s){btn.textContent='信道 · '+(s.channel==='auto'?'自动':'手动 '+s.channel);}).catch(function(){btn.textContent='信道设置';});}
 btn.onclick=function(){btn.disabled=true;get().then(function(s){
  if(!s.ok)throw new Error(s.error);
  var mode=E('select',{id:'f50-channel-mode',style:'width:100%'},[E('option',{value:'auto'},'自动'),E('option',{value:'manual'},'手动')]);
  mode.value=s.channel==='auto'?'auto':'manual';
  var channels=E('select',{id:'f50-channel-value',style:'width:100%'});
  var list=JSON.parse(s.frequencies || '{}').results || [];
  list.filter(function(c){return [52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144].indexOf(c.channel)<0 && !c.restricted && c.band===(s.band==='5g'?5:2) && !(s.band==='5g' && s.htmode==='VHT80' && [36,40,44,48,52,56,60,64,149,153,157,161].indexOf(c.channel)<0);}).forEach(function(c){channels.appendChild(E('option',{value:String(c.channel)},String(c.channel)));});
  channels.value=s.channel==='auto'?'36':s.channel;
  channels.disabled=mode.value==='auto';mode.onchange=function(){channels.disabled=mode.value==='auto';};
  var save=E('button',{class:'cbi-button cbi-button-apply',click:function(){save.disabled=true;set(mode.value==='auto'?'auto':channels.value).then(function(r){if(!r.ok)throw new Error(r.error);ui.hideModal();return refresh();}).catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(function(){save.disabled=false;});}},'保存');
  ui.showModal('Wi-Fi 信道',[
   E('label',{for:mode.id,style:'display:block;margin-bottom:16px'},['选择模式',mode]),
   E('label',{for:channels.id,style:'display:block;margin-bottom:16px'},['手动信道',channels]),
   E('div',{class:'right'},[E('button',{class:'cbi-button',click:ui.hideModal},'取消'),' ',save])]);
 }).catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(function(){btn.disabled=false;});};
 function schedule(){timer=setTimeout(function(){if(!disposed && document.documentElement.contains(root))refresh().finally(schedule);},15000);}
 refresh().finally(schedule);return function(){disposed=true;clearTimeout(timer);};
}});
