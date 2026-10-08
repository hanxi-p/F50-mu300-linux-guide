'use strict';
'require rpc';
'require ui';
'require baseclass';
var status = rpc.declare({object:'f50quota',method:'status'});
var configure = rpc.declare({object:'f50quota',method:'configure',params:['quota_gb','used_gb','calibrate']});
var GB = 1000000000;
function amount(v) { return (Number(v || 0)/GB).toFixed(3)+' GB'; }
function key(d) { return d.year+'-'+String(d.month).padStart(2,'0'); }
function traffic(raw) { var d=JSON.parse(raw || '{}'); return d.interfaces && d.interfaces[0] || {traffic:{}}; }
return baseclass.extend({
 mount:function(root) {
  var section=E('div',{id:'f50-quota-card'}),latest,timer,disposed=false;
  section.innerHTML=`
<style>#f50-quota-card [data-edit]{cursor:pointer}#f50-quota-card [data-edit]:hover{box-shadow:inset 0 0 0 1px var(--primary,#2f7bf6)}#f50-quota-card [data-edit]:focus-visible{outline:2px solid var(--primary,#2f7bf6)}</style>
<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:.78em;margin:5px 0">
 <button type="button" data-q="month" aria-label="查看月度历史" style="border:0;background:none;color:inherit;padding:3px 0;cursor:pointer"></button>
 <button type="button" data-edit="quota" aria-label="设置流量套餐" style="border:0;background:none;color:var(--primary,#0066cc);padding:3px 0;font-size:inherit">设置流量套餐</button>
 <strong data-q="percent">—</strong>
</div>
<div class="f50-quota-meter" style="position:relative;height:50px;border-radius:8px;overflow:hidden;background:var(--surface-sunken,rgba(127,127,127,.08));margin:4px 0 6px">
 <div role="progressbar" data-q="bar" aria-label="本月流量使用比例" aria-valuemin="0" aria-valuemax="100" style="position:absolute;inset:0"><div data-q="fill" style="height:100%;width:0;background:var(--primary,#0066cc);opacity:.18"></div></div>
 <div style="position:relative;display:flex;height:100%">
  <button type="button" data-edit="used" aria-label="设置本月已使用" style="flex:1;min-width:0;border:0;background:none;color:inherit;text-align:left;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;line-height:1.3"><b data-q="used" style="display:block;font-size:.94rem">—</b><span style="font-size:.68rem;color:var(--text-muted,#777)">本月总消耗</span></button>
  <button type="button" data-edit="quota" aria-label="通过本月剩余设置总流量" style="flex:1;min-width:0;border:0;background:none;color:inherit;text-align:right;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;line-height:1.3"><b data-q="remaining" style="display:block;font-size:.94rem">—</b><span style="font-size:.68rem;color:var(--text-muted,#777)">本月剩余</span></button>
 </div>
</div>`;
  root.querySelector('#f50-quota-slot').replaceChildren(section);
  var q=function(n){return section.querySelector('[data-q="'+n+'"]');};
  function render(data) {
   if (!data.ok) throw new Error(data.error || '读取失败');
   latest=data;
   var months=traffic(data.monthly_json).traffic.month || [];
   var current=months.find(function(m){return key(m.date)===data.month;}) || {rx:0,tx:0};
   var adjustment=Number((data.adjustments || {})[data.month] || 0);
   var used=Math.max(0,Number(current.rx)+Number(current.tx)+adjustment);
   data.used_bytes=used;
   var quota=Number(data.quota_gb)*GB,percent=quota>0?used/quota*100:0;
   q('month').textContent=data.month;
   q('used').textContent=amount(used);
   section.querySelector('.f50-quota-meter').title=quota>0?'本月总流量 '+Number(data.quota_gb)+' GB':'本月总流量尚未设置';
   q('remaining').textContent=quota>0?(used>quota?'超出 '+amount(used-quota):amount(quota-used)):'—';
   q('percent').textContent=quota>0?percent.toFixed(2)+'%':'请设置额度';
   q('fill').style.width=Math.min(100,percent)+'%';
   q('fill').style.background=percent>=100?'#d64c4c':percent>=80?'#dc9a23':'var(--primary,#2f7bf6)';
   q('bar').setAttribute('aria-valuenow',Math.min(100,percent).toFixed(2));
   var rx=root.querySelector('#mud-rx'),tx=root.querySelector('#mud-tx');
   if(rx){rx.textContent=amount(current.rx);rx.title=Number(current.rx).toLocaleString('zh-CN')+' 字节';}
   if(tx){tx.textContent=amount(current.tx);tx.title=Number(current.tx).toLocaleString('zh-CN')+' 字节';}
   q('used').title=used.toLocaleString('zh-CN')+' 字节'+(adjustment?'（含手动校准）':'');
  }
  function refresh(){return status().then(function(d){if(!disposed)render(d);}).catch(function(e){if(!disposed)ui.addNotification(null,E('p',{},'流量读取失败：'+e.message));});}
  function schedule(){timer=setTimeout(function(){if(!disposed && document.documentElement.contains(root))refresh().finally(schedule);},30000);}
  function edit(kind) {
   if(!latest)return;
   var month=latest.month,usedEdited=false;
   var quota=E('input',{id:'f50-quota-total',type:'number',min:'0',max:'1000000',step:'0.001',value:latest.quota_gb || '',style:'width:100%'});
   var used=E('input',{id:'f50-quota-used',type:'number',min:'0',max:'1000000',step:'0.001',value:(latest.used_bytes/GB).toFixed(3),style:'width:100%'});
   used.addEventListener('input',function(){usedEdited=true;});
   var save=E('button',{type:'button',class:'cbi-button cbi-button-apply',click:function(){
    var a=Number(quota.value),b=Number(used.value);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0||a>1000000||b>1000000||used.value===''){ui.addNotification(null,E('p',{},'请输入有效流量。'));return;}
    save.disabled=true;
    status().then(function(s){if(s.month!==month)throw new Error('月份已变更，请重新设置。');return configure(a.toFixed(3),b.toFixed(3),usedEdited);}).then(function(r){if(!r.ok)throw new Error(r.error || '保存失败');ui.hideModal();return refresh();}).catch(function(e){ui.addNotification(null,E('p',{},e.message));}).finally(function(){save.disabled=false;});
   }},'保存');
   ui.showModal('本月流量',[
    E('label',{for:quota.id,style:'display:block;margin-bottom:16px'},['本月总流量（GB）',quota]),
    E('label',{for:used.id,style:'display:block;margin-bottom:16px'},['本月已使用（GB）',used]),
    E('div',{class:'right'},[E('button',{type:'button',class:'cbi-button',click:ui.hideModal},'取消'),' ',save])
   ]);
   (kind==='used'?used:quota).focus();(kind==='used'?used:quota).select();
  }
  section.querySelectorAll('[data-edit]').forEach(function(el){el.onclick=function(){edit(el.dataset.edit);};el.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();edit(el.dataset.edit);}};});
  q('month').onclick=function(){
   if(!latest)return;
   var rows=(traffic(latest.monthly_json).traffic.month || []).slice().sort(function(a,b){return key(b.date).localeCompare(key(a.date));});
   ui.showModal('月度历史',[
    E('table',{class:'mud-table'},[
     E('thead',{},E('tr',{},['月份','接收','发送','已用合计'].map(function(s){return E('th',{},s);}))),
     E('tbody',{},rows.map(function(m){return E('tr',{},[key(m.date),amount(m.rx),amount(m.tx),amount(Math.max(0,Number(m.rx)+Number(m.tx)+Number((latest.adjustments || {})[key(m.date)] || 0)))].map(function(s){return E('td',{},s);}));}))
    ]),E('div',{class:'right'},E('button',{type:'button',class:'cbi-button',click:ui.hideModal},'关闭'))
   ]);
  };
  refresh().finally(schedule);
  return function(){disposed=true;clearTimeout(timer);};
 }
});
