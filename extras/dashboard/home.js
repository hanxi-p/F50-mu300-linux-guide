'use strict';
'require view';
'require uci';
'require mu300.common as M';
'require f50quota5 as F50Quota';
'require f50channel as F50Channel';
'require f50openclash as F50OpenClash';

/* MU300 status dashboard -- the LuCI landing page (menu.d hangs it at admin/home).
 *
 * Layout: the serving-cell card at the top is the only card; the rest are full-width sections (link & traffic /
 * neighbor cells / Wi-Fi, LAN, device, SIM / quick controls). Locks, SMS and the AT terminal are in the Cellular
 * submenu.
 *
 * One data source: ubus mu300dash status (the info snapshot + the fast-tier cellular cache sig + the slow-tier
 * cache cell). The page polls every 1.5 s by default: signal, rates and CPU refresh every round; neighbors, QoS
 * and identity are redrawn only when the slow tier's timestamp changes.
 * A neighbor row's Lock goes through lock_set cell (SFUN restarts the radio stack, about half a minute without
 * service); the lock state comes from lock_get (read once when the page loads, again after a lock). */

var DEFAULT_POLL_S = 1.5;
var RATE_WIN = 80;

function pollSeconds(value) {
	var seconds = Number(value);
	return Number.isFinite(seconds) && seconds >= 0.5 && seconds <= 60 ? seconds : DEFAULT_POLL_S;
}

/* The engineering port gives only MCS/BLER; the modulation is derived here from the common 3GPP MCS table 1,
 * without an extra AT request for a display item. LTE uplink has other MCS boundaries than downlink/NR. */
function modulation(mcs, rat, uplink) {
	if (mcs == null || isNaN(Number(mcs))) return '--';
	mcs = Number(mcs);
	if (rat === 'lte' && uplink) {
		if (mcs >= 0 && mcs <= 10) return 'QPSK';
		if (mcs <= 20) return '16QAM';
		if (mcs <= 28) return '64QAM';
	} else {
		if (mcs >= 0 && mcs <= 9) return 'QPSK';
		if (mcs <= 16) return '16QAM';
		if (mcs <= 28) return '64QAM';
	}
	return '--';
}

function radioMetricRows(label, rat, cell) {
	var dlMcs = cell && cell.dl_mcs != null ? cell.dl_mcs : null;
	var ulMcs = cell && cell.ul_mcs != null ? cell.ul_mcs : null;
	var dlBler = cell && cell.dl_bler != null ? cell.dl_bler : null;
	var ulBler = cell && cell.ul_bler != null ? cell.ul_bler : null;
	var prefix = label ? label + ' ' : '';
	var pair = function(a, b, suffix) {
		return (a != null ? a + suffix : '--') + ' / ' + (b != null ? b + suffix : '--');
	};
	return '<div class="mud-r"><span class="mud-k">' + prefix + _('Modulation DL/UL') + '</span>' +
		'<span class="mud-v" title="' + _('Estimated from current MCS') + '">' + modulation(dlMcs, rat, false) + ' / ' + modulation(ulMcs, rat, true) + '</span></div>' +
		'<div class="mud-r"><span class="mud-k">' + prefix + _('MCS DL/UL') + '</span><span class="mud-v">' + pair(dlMcs, ulMcs, '') + '</span></div>' +
		'<div class="mud-r"><span class="mud-k">' + prefix + _('BLER DL/UL') + '</span><span class="mud-v">' + pair(dlBler, ulBler, '%') + '</span></div>';
}

return view.extend({
	load: function() { return Promise.resolve(); },

	render: function() {
		M.injectCss();
		M.watchSms();
		var root = document.createElement('div');
		this._root = root;
		this._bootEl = root;
		root.className = 'mud mud-booting';
		root.innerHTML = this.html();
		this.organize(root);
		this.wire(root);
		this._channelDispose = F50Channel.mount(root);
		this._quotaDispose = F50Quota.mount(root);
		this._openclashDispose = F50OpenClash.mount(root);
		var self = this;
		var intervalMs = DEFAULT_POLL_S * 1000;
		var config = L.resolveDefault(uci.load('unisoc_modem')).then(function() {
			intervalMs = pollSeconds(uci.get('unisoc_modem', 'main', 'home_refresh_interval')) * 1000;
		});
		/* Read the full status once now; never run the sysinfo and status collections twice at the same time. */
		var first = L.resolveDefault(M.callStatus()).then(function(st) {
			self.update(st || {});
		});
		/* LuCI poll.add() truncates intervals to whole seconds. Use a one-shot
		 * timer so 1.5 s remains 1.5 s and slow requests never overlap. */
		function refresh() {
			if (!document.documentElement.contains(root)) return;
			L.resolveDefault(M.callStatus()).then(function(st) { self.update(st || {}); }).finally(function() {
				if (document.documentElement.contains(root))
					self._refreshTimer = setTimeout(refresh, intervalMs);
			});
		}
		Promise.all([first, config]).then(function() {
			self._refreshTimer = setTimeout(refresh, intervalMs);
		});
		return root;
	},

	unload: function() {
		clearTimeout(this._refreshTimer);
		if (this._channelDispose) this._channelDispose();
		if (this._quotaDispose) this._quotaDispose();
		if (this._openclashDispose) this._openclashDispose();
	},

	html: function() {
		return `
<div class="mud-card mud-hero">
  <div class="mud-hero-l">
    <div style="font-size:.78rem;color:var(--text-muted,var(--text-light,#777))">
      <span class="mud-dot" id="mud-dot"></span><b id="mud-host" style="color:var(--text,#222)">--</b>
      <span id="mud-uptime"></span></div>
    <div class="mud-rat" id="mud-rat">--<span class="mud-bars" id="mud-bars"><i style="height:25%"></i><i style="height:45%"></i><i style="height:65%"></i><i style="height:85%"></i><i style="height:100%"></i></span></div>
    <div class="mud-op" id="mud-op">--</div>
    <div class="mud-cellline" id="mud-cellline"></div>
  </div>
  <div class="mud-hero-r">
    <div class="mud-rsrp" id="mud-rsrp">--</div>
    <div class="mud-chips" id="mud-metric-chips"></div>
  </div>
</div>

<div class="mud-card mud-body">

<div class="mud-sec">
  <h3>${_('Link & traffic')}</h3>
  <div class="f50-combined-chart" style="width:100%">
    <div class="f50-rate-head">
      <div class="f50-rate-download"><b id="mud-dl">--</b><span>下行速率</span></div>
      <div class="f50-rate-upload"><b id="mud-ul">--</b><span>上行速率</span></div>
    </div>
    <div id="mud-rate-chart" style="width:100%;margin:6px 0;touch-action:pan-y"></div>
    <div id="mud-rate-detail" style="display:none;font-size:.75em;margin:4px 0"></div>
    <div style="display:flex;justify-content:space-between;font-size:.8em;color:var(--text-muted,#777)"><span id="mud-rate-start"></span><span id="mud-rate-window">最近 80 个采样点</span><span id="mud-rate-end"></span></div>
  </div>
  <div class="mud-kpis">
    <div class="mud-kpi"><b id="mud-session-rx">--</b><span>本次累计接收</span></div>
    <div class="mud-kpi"><b id="mud-session-tx">--</b><span>本次累计发送</span></div>
  </div>
  <div class="mud-kpis">
    <div class="mud-kpi"><b id="mud-rx">--</b><span>本月累计接收</span></div>
    <div class="mud-kpi"><b id="mud-tx">--</b><span>本月累计发送</span></div>
  </div>
  <div id="f50-quota-slot" style="margin:0 0 16px">
    <div class="mud-kpis">
      <div class="mud-kpi"><b>读取中…</b><span>本月累计</span></div>
      <div class="mud-kpi"><b>读取中…</b><span>本月总流量</span></div>
    </div>
  </div>
  <div class="mud-cols">
    <div>
      <div class="mud-rows">
        <div class="mud-r"><span class="mud-k">IPv4 / IPv6</span><span class="mud-v" id="mud-ip">--</span></div>
        <div class="mud-r"><span class="mud-k">APN</span><span class="mud-v" id="mud-apn">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Session duration')}</span><span class="mud-v" id="mud-sess">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Registration')}</span><span class="mud-v" id="mud-reg">--</span></div>
        <div class="mud-r"><span class="mud-k">DNS</span><span class="mud-v" id="mud-dns">--</span></div>
      </div>
    </div>
    <div>
      <div class="mud-rows" id="mud-lteanchor"></div>
      <div class="mud-rows" id="mud-radio-metrics">
        <div class="mud-r"><span class="mud-k">${_('Modulation DL/UL')}</span><span class="mud-v">-- / --</span></div>
        <div class="mud-r"><span class="mud-k">${_('MCS DL/UL')}</span><span class="mud-v">-- / --</span></div>
        <div class="mud-r"><span class="mud-k">${_('BLER DL/UL')}</span><span class="mud-v">-- / --</span></div>
      </div>
      <div class="mud-rows">
        <div class="mud-r"><span class="mud-k">${_('Bandwidth')}</span><span class="mud-v" id="mud-bw">--</span></div>
        <div class="mud-r"><span class="mud-k">QCI</span><span class="mud-v" id="mud-qci">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('AMBR DL/UL')}</span><span class="mud-v" id="mud-ambr">--</span></div>
      </div>
    </div>
  </div>
</div>


<div class="mud-sec">
  <h3>${_('Wi-Fi · LAN · Device · SIM')}</h3>
  <div class="mud-temp" id="mud-temps"></div>
  <div class="mud-kpis" style="margin-top:8px">
    <div class="mud-kpi"><b id="mud-cpu">--</b><span>${_('CPU usage')}</span><div class="mud-meter"><i id="mud-cpu-bar" style="background:var(--brand,var(--primary,#3b82f6))"></i></div></div>
    <div class="mud-kpi"><b id="mud-ram">--</b><span>${_('Memory')} · <span class="mud-sub" id="mud-ram-sub">--</span></span><div class="mud-meter"><i id="mud-ram-bar" style="background:var(--info,#0ea5e9)"></i></div></div>
    <div class="mud-kpi"><b id="mud-disk">--</b><span>${_('Storage')}</span><div class="mud-meter"><i id="mud-disk-bar" style="background:var(--warning,#f59e0b)"></i></div></div>
    <div class="mud-kpi" id="mud-batt-kpi" style="display:none"><b id="mud-batt">--</b><span id="mud-batt-l">${_('Battery')}</span></div>
  </div>
  <div id="mud-freqs" class="mud-freqs"></div>
  <div class="mud-cols">
    <div>
      <div class="mud-rows">
        <div class="mud-r"><span class="mud-k">SSID</span><span class="mud-v" id="mud-ssid">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Channel')}</span><span class="mud-v" id="mud-chan">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Encryption')}</span><span class="mud-v" id="mud-wenc">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Hidden SSID')}</span><span class="mud-v" id="mud-whid">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Country')}</span><span class="mud-v" id="mud-wcountry">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('AP status')}</span><span class="mud-v" id="mud-whostapd">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('USB network')}</span><span class="mud-v" id="mud-wusb">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Connection tracking')}</span><span class="mud-v" id="mud-conntrack">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('LAN address')}</span><span class="mud-v" id="mud-lanip">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Wi-Fi clients')}</span><span class="mud-v" id="mud-wcl">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('DHCP leases')}</span><span class="mud-v" id="mud-wleases">--</span></div>
      </div>
      <div id="mud-clist" style="margin-top:8px"></div>
    </div>
    <div>
      <div class="mud-rows">
        <div class="mud-r"><span class="mud-k">${_('Device model')}</span><span class="mud-v" id="mud-model">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('System')}</span><span class="mud-v" id="mud-fwos">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Modem')}</span><span class="mud-v" id="mud-modem">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Carrier')}</span><span class="mud-v" id="mud-carr">--</span></div>
        <div class="mud-r"><span class="mud-k">PLMN</span><span class="mud-v" id="mud-plmn">--</span></div>
        <div class="mud-r"><span class="mud-k">IMEI</span><span class="mud-v" id="mud-imei">--</span></div>
        <div class="mud-r"><span class="mud-k">IMSI</span><span class="mud-v" id="mud-imsi">--</span></div>
        <div class="mud-r"><span class="mud-k">ICCID</span><span class="mud-v" id="mud-iccid">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Module')}</span><span class="mud-v" id="mud-fwmodel">--</span></div>
        <div class="mud-r"><span class="mud-k">${_('Firmware')}</span><span class="mud-v" id="mud-fw">--</span></div>
      </div>
      <div class="mud-chiprow"><span class="mud-chip" id="mud-reveal">${_('Show SIM identifiers')}</span></div>
    </div>
  </div>
  <div id="mud-leases" style="margin-top:10px"></div>
  <div style="margin-top:12px"><button class="mud-btn warn" id="mud-btn-android">${_('Switch to Android')}</button></div>
</div>


<div class="mud-sec">
  <h3>${_('Quick controls')}</h3>
  <div class="mud-ctl" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <button class="mud-btn" id="mud-btn-data">流量开关</button>
    <button class="mud-btn" id="mud-btn-openclash" aria-pressed="false">OpenClash · 读取状态…</button>
    <button class="mud-btn" id="mud-btn-wifi">Wi-Fi 开关</button>
    <button class="mud-btn" id="mud-btn-channel">信道设置</button>
    <button class="mud-btn warn" id="mud-btn-modem">${_('Restart modem')}</button>
    <button class="mud-btn warn" id="mud-btn-reboot">${_('Restart device')}</button>

  </div>
</div>
<div class="mud-sec">
  <h3>${_('Neighbor cells')}</h3>
  <div class="mud-scroll">
  <table class="mud-table"><thead><tr><th>${_('RAT/Band')}</th><th>PCI</th><th>${_('Frequency')}</th><th>RSRP</th><th>RSRQ</th><th>SINR</th><th></th></tr></thead>
  <tbody id="mud-neigh"><tr><td colspan="7" style="color:var(--text-muted,var(--text-light,#777))">--</td></tr></tbody></table>
  </div>
</div>

</div><!-- /mud-body -->`;
	},


 organize: function(root) {
  root.classList.add('f50-home');
  root.prepend(E('style', {}, `
   .f50-home{--f50-dl:#0066cc;--f50-ul:#d45d00}
   .f50-home .f50-rate-head{display:flex;flex-direction:column;gap:3px;margin:5px 0 7px}
   .f50-home .f50-rate-head>div{display:flex;align-items:baseline;gap:9px;min-width:0}
   .f50-home .f50-rate-head b{font-variant-numeric:tabular-nums;line-height:1.2}
   .f50-home .f50-rate-download{color:var(--f50-dl)}
   .f50-home .f50-rate-download b{font-size:1.7rem;font-weight:750}
   .f50-home .f50-rate-upload{color:var(--f50-ul)}
   .f50-home .f50-rate-upload b{font-size:1.4rem;font-weight:650}
   .f50-home .f50-rate-head span{font-size:.72rem;white-space:nowrap;color:var(--text-muted,#777)}
   html[data-darkmode=true] .f50-home{--f50-dl:#58a6ff;--f50-ul:#ffb45c}
   .f50-home .f50-core-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:6px 0 8px}
   .f50-home .f50-core{padding:7px 9px;border-radius:var(--radius-base,.5rem);background:var(--surface-sunken,rgba(127,127,127,.06));font-size:.72rem}
   .f50-home .f50-core .f50-core-head{display:flex;justify-content:space-between;gap:6px}
   .f50-home .f50-core b{font-variant-numeric:tabular-nums}
   .f50-home .mud-card{padding:10px 12px}
   .f50-home .mud-hero{padding:12px 14px;gap:6px 16px;margin-bottom:8px}
   .f50-home .mud-hero-l{gap:3px}
   .f50-home .mud-sec{padding:0 0 4px}
   .f50-home .mud-sec>h3{margin:9px 0 7px}
   .f50-home .mud-body>.mud-sec+.mud-sec{margin-top:8px}
   .f50-home .f50-details{margin:4px 0 2px!important;font-size:.82rem;line-height:1.4}
   .f50-home .f50-details>summary{padding:2px 0}
   .f50-home .f50-details:not([open]){margin-bottom:0!important}
   .f50-home .mud-sec:has(>.f50-details:last-child){padding-bottom:0}
   .f50-home .mud-kpis{gap:6px;margin-bottom:6px}
   .f50-home .mud-kpi{padding:7px 9px}
   .f50-home .mud-kpis>.mud-kpi:only-child{grid-column:1/-1}
   .f50-home .mud-kpi b{font-size:1rem}
   .f50-home .mud-ctl{gap:6px}
   .f50-home .mud-btn{min-height:40px;padding:7px 9px}
   .f50-home #f50-quota-slot{margin-bottom:8px!important}
   .f50-home #f50-quota-card [data-q=bar]{margin:0!important}
   .f50-home #mud-rate-chart{height:185px;position:relative}
   .f50-home .f50-rate-axis{position:absolute;left:0;top:6px;bottom:14px;width:38px;display:flex;flex-direction:column;justify-content:space-between;color:var(--text-muted,#777);font-size:11px;line-height:1;font-variant-numeric:tabular-nums}
   .f50-home .f50-rate-axis small{font-size:9px;display:block;margin-top:4px;opacity:.8}
   .f50-home .f50-rate-svg{position:absolute;left:42px;top:0;width:calc(100% - 42px);height:100%}
   @media(max-width:600px){
    .f50-home .f50-core-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    .f50-home .mud-card{padding:9px 10px}
    .f50-home .mud-hero{padding:10px 12px}
    .f50-home #mud-rate-chart{height:145px}
    .f50-home .mud-ctl{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    .f50-home .mud-cols{grid-template-columns:minmax(0,1fr)}
    .f50-home .mud-hero-l{flex-basis:100%;min-width:0}
    .f50-home .mud-cellline{font-size:.72rem;overflow-wrap:anywhere}
    .f50-home .mud-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    .f50-home .mud-temp{gap:4px}
    .f50-home .mud-temp span{padding:3px 6px;font-size:.68rem}
   }
  `));
  function wrap(nodes,title,before) {
   var d=E('details',{class:'f50-details',style:'margin:16px 0'},[E('summary',{style:'cursor:pointer;font-weight:600'},title)]);
   before.parentNode.insertBefore(d,before); nodes.forEach(function(n){d.appendChild(n);}); return d;
  }
  var secs=root.querySelectorAll('.mud-body > .mud-sec'),link=secs[0],device=secs[1];
  var qci=root.querySelector('#mud-qci').parentNode;
  qci.style.cssText='margin:8px 0;font-size:1.05em';
  link.insertBefore(qci,link.querySelector('.f50-combined-chart'));
  var cols=link.querySelector('.mud-cols');wrap([cols],'蜂窝连接详情',cols);
  device.querySelector('h3').textContent='设备负载与温度';
  var kpis=device.querySelector('.mud-kpis'),extra=E('div',{class:'mud-kpis',style:'margin-top:12px'});
  ['disk','batt'].forEach(function(id){extra.appendChild(root.querySelector('#mud-'+id).parentNode);});
  kpis.insertAdjacentElement('afterend',E('div',{id:'mud-cpu-cores',class:'f50-core-grid','aria-label':'各 CPU 核心占用'}));
  var freq=root.querySelector('#mud-freqs'),dcols=device.querySelector('.mud-cols'),leases=root.querySelector('#mud-leases'),android=root.querySelector('#mud-btn-android').parentNode;
  var details=wrap([extra,freq,dcols,leases,android],'无线、局域网与设备详情',freq);
  var heroRight=root.querySelector('.mud-hero-r');wrap([heroRight],'信号详情',heroRight);
 },
 drawRates: function() {
  var el=this._root.querySelector('#mud-rate-chart'),self=this;
  if(!el || this.dlHist.length<1)return;
  var peak=Math.max(1,Math.max.apply(null,this.dlHist.concat(this.ulHist))),left=0,right=900,top=12,bottom=186;
  var divisor=peak>=1048576?1048576:peak>=1024?1024:1,unit=divisor===1048576?'MB/s':divisor===1024?'KB/s':'B/s';
  var normalized=peak/divisor,power=Math.pow(10,Math.floor(Math.log10(normalized))),fraction=normalized/power;
  peak=(fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power*divisor;
  function tick(value){return Number((value/divisor).toPrecision(2)).toString();}
  function pts(arr){return arr.map(function(v,i){return (left+i/(RATE_WIN-1)*(right-left)).toFixed(1)+','+(bottom-Math.max(0,v)/peak*(bottom-top)).toFixed(1);}).join(' ');}
  var grid='';for(var j=0;j<=2;j++){var y=top+j/2*(bottom-top);grid+='<line x1="0" y1="'+y+'" x2="900" y2="'+y+'" stroke="currentColor" opacity=".09"/>';}
  el.innerHTML='<div class="f50-rate-axis"><span>'+tick(peak)+'<small>'+unit+'</small></span><span>'+tick(peak/2)+'</span><span>0</span></div><svg class="f50-rate-svg" role="img" aria-label="上下行速率历史曲线" viewBox="0 0 900 200" preserveAspectRatio="none">'+grid+'<polyline data-series="download" points="'+pts(this.dlHist)+'" stroke="var(--f50-dl,#0066cc)" fill="none" stroke-width="3.5" vector-effect="non-scaling-stroke"/><polyline data-series="upload" points="'+pts(this.ulHist)+'" stroke="var(--f50-ul,#d45d00)" fill="none" stroke-width="3.5" vector-effect="non-scaling-stroke"/><line id="mud-rate-cursor" y1="12" y2="186" stroke="currentColor" opacity=".4" style="display:none"/></svg>';
  function time(t){return new Date(t).toLocaleTimeString('zh-CN',{hour12:false});}
  M.set('rate-start',time(this.rateTimes[0]));M.set('rate-end',time(this.rateTimes[this.rateTimes.length-1]));
  var seconds=this.rateTimes.length>1?(this.rateTimes[this.rateTimes.length-1]-this.rateTimes[0])/1000:0;
  M.set('rate-window','最近 '+Math.round(seconds)+' 秒 / '+this.rateTimes.length+' 点');
  el.onpointermove=el.onpointerdown=function(e){
   var r=el.querySelector('svg').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*900;
   var n=Math.max(0,Math.min(self.dlHist.length-1,Math.round((x-left)/(right-left)*(RATE_WIN-1))));
   var cursor=el.querySelector('#mud-rate-cursor'),cx=left+n/(RATE_WIN-1)*(right-left);
   cursor.style.display='';cursor.setAttribute('x1',cx);cursor.setAttribute('x2',cx);
   M.set('rate-detail',time(self.rateTimes[n])+' · 下行 '+M.fmtRate(self.dlHist[n])+' · 上行 '+M.fmtRate(self.ulHist[n]));
   self._root.querySelector('#mud-rate-detail').style.display='';
  };
 },

	wire: function(root) {
		var self = this;
		this.identShown = false;
		this.dlHist = []; this.ulHist = []; this.rateTimes = [];
		this.lastNet = null; this.lastCpu = null; this.lastFullTs = 0;
		this.lockedCell = '';
		/* render() runs before the node is in the document, so look up relative to root (update, once mounted, looks in the whole document) */
		var q = function(id) { return root.querySelector('#mud-' + id); };

		/* One kind of feedback: a spinning button (M.busy) + a toast at the top, the same as on the lock and SMS pages */
		var act = function(op, arg, note, btn) {
			M.busy(btn, true);
			M.toast(note || _('Running %s…').format(op), { type: 'busy' });
			return L.resolveDefault(M.callAct(op, arg)).then(function(r) {
				r = r || {};
				M.busy(btn, false);
				M.toast(r.ok ? (r.started ? _('Started in background: %s') : _('Done: %s')).format(r.op || op)
					: _('Failed: %s').format(M.errText(r)),
					{ type: r.ok ? 'success' : 'error' });
			}, function() { M.busy(btn, false); M.toast(_('Request failed'), { type: 'error' }); });
		};
		q('btn-data').onclick = function() {
			var up = self.lastInfo && self.lastInfo.wan && self.lastInfo.wan.up;
			act('data', up ? 'down' : 'up', up ? _('Disconnecting data…') : _('Connecting data…'), this);
		};
		q('btn-wifi').onclick = function() {
			var on = self.lastInfo && self.lastInfo.wifi && self.lastInfo.wifi.up;
			act('wifi', on ? 'off' : 'on', null, this);
		};
		q('btn-modem').onclick = function() {
			var btn = this;
			M.confirmBox(_('Restart modem'), _('Cellular connectivity may stop for 1–2 minutes.'), { danger: true })
				.then(function(go) { if (go) act('modem-reset', null, null, btn); });
		};
		q('btn-reboot').onclick = function() {
			var btn = this;
			M.confirmBox(_('Restart the entire device'), _('All connections will be interrupted.'), { danger: true })
				.then(function(go) { if (go) act('reboot', null, null, btn); });
		};
		q('btn-android').onclick = function() {
			var btn = this;
			M.confirmBox(_('Switch to Android'),
				[ _('The next boot will enter Android and reboot now. This management page and cellular sharing will disconnect.'),
				  _('To return to OpenWrt, run mu300-next-boot linux in Android and reboot.'),
				  _('Or do nothing: after five boots that do not finish, it falls back automatically.') ].join('\n'),
				{ danger: true, okText: _('Switch and reboot') })
				.then(function(go) { if (go) act('os', 'android', _('Preparing Android boot and rebooting…'), btn); });
		};
		q('reveal').onclick = function() {
			self.identShown = !self.identShown;
			M.v('reveal').textContent = self.identShown ? _('Hide SIM identifiers') : _('Show SIM identifiers');
			self.paintIdent(self.lastCell);
		};

		/* Lock from a neighbor row (event delegation) */
		q('neigh').addEventListener('click', function(ev) {
			var btn = ev.target;
			if (!btn.getAttribute || !btn.getAttribute('data-lock')) return;
			var key = btn.getAttribute('data-lock');
			M.confirmBox(_('Lock cell %s?').format(key.replace(':', ' ')),
				_('The radio stack will restart (SFUN); cellular service will stop for about 30 seconds.'), { danger: true })
				.then(function(go) {
				if (!go) return;
				M.busy(btn, true);
			M.toast(_('Locking %s in the background, about 30 seconds').format(key), { type: 'busy' });
			L.resolveDefault(M.callLockSet('cell', key)).then(function(r) {
				r = r || {};
				M.busy(btn, false);
					M.toast(r.ok ? _('Locked %s in the background; the status will refresh shortly').format(key)
						: _('Lock failed: %s').format(M.errText(r)),
						{ type: r.ok ? 'success' : 'error' });
					setTimeout(function() { self.refreshLock(); }, 35000);
				});
			});
		});
		this.refreshLock();
	},

	refreshLock: function() {
		var self = this;
		L.resolveDefault(M.callLockGet()).then(function(l) {
			self.lockedCell = (l || {}).cells || [];
			self.repaintNeigh();
		});
	},

	paintIdent: function(cell) {
		var id = cell && cell.ident;
		var mask = function(s) {
			if (!s) return '--';
			return this.identShown ? s : s.substring(0, 4) + '****' + s.substring(s.length - 3);
		}.bind(this);
		M.set('imei', mask(id && id.imei));
		M.set('imsi', mask(id && id.imsi));
		M.set('iccid', mask(id && id.iccid));
		M.set('fwmodel', id ? (id.model || '--') : '--');
		M.set('fw', id ? (id.fw || '--') : '--');
	},

	repaintNeigh: function() {
		var el = M.v('neigh');
		if (el && this.lastCell) el.innerHTML = M.neighborRows(this.lastCell, this.lockedCell);
	},

	update: function(st) {
		var i = st.info || {};
		this.lastInfo = i;
		if (i.ts && this._bootEl) {
			this._bootEl.classList.remove('mud-booting');
			this._bootEl = null;
		}
		/* Fast tier on top: sig (serving cell/registration, every 1.5 s) overrides the same fields of the slow-tier cache c */
		var c = st.cell || null;
		var s = st.sig || null;
		if (s && !s.error && (!c || !c.ts || (s.ts || 0) >= c.ts)) {
			if (c && s.partial) {
				/* The first core reply updates the registration, but a transient empty CESQ does not wipe the last engineering signal. */
				c = Object.assign({}, c, {
					ts: s.ts, cfun: s.cfun, reg: s.reg, reg5g: s.reg5g
				});
			} else c = c ? Object.assign({}, c, {
				ts: s.ts, cfun: s.cfun, reg: s.reg, reg5g: s.reg5g,
				sig_src: s.sig_src, sig: s.sig, lte: s.lte, nr: s.nr
			}) : s;
		}
		this.lastCell = c;
		/* Slow-tier data (neighbors/carrier/identity) is redrawn only when the whole cache's timestamp changes */
		var fullTs = (st.cell && st.cell.ts) || 0;
		var slowChanged = fullTs !== this.lastFullTs;
		this.lastFullTs = fullTs;

		M.set('host', i.host);
		M.set('uptime', i.uptime ? _('Uptime %s').format(M.fmtUptime(i.uptime)) : '');
		M.v('dot').className = 'mud-dot' + (i.modem && i.modem.alive ? ' on' : '');

		var sig = c && !c.error ? (c.sig || {}) : {};
		var rsrp = sig.rsrp, rsrq = sig.rsrq, sinr = sig.sinr;
		/* On 4G sig is the LTE block (the backend's sig_src prefers NR > LTE > CESQ); c.lte.sinr is the same source
		 * at another timestamp -- only a fallback when sinr is missing, never shown next to it */
		if (sinr == null && c && c.lte && !c.nr && c.lte.sinr != null) sinr = c.lte.sinr;
		var label = M.qLabel(rsrp, rsrq, sinr), score = M.qScore({ rsrp: rsrp, rsrq: rsrq, sinr: sinr });
		var col = M.qCol(M.qLevel(rsrp, rsrq, sinr));

		var rat = '--';
		if (c && !c.error) {
			var nr = c.nr && c.nr.band ? true : false;
			var lte = c.lte && c.lte.band ? true : false;
			if (nr && lte) rat = '5G NSA';
			else if (nr) rat = '5G SA';
			else if (lte) {
				var act = (c.operator && c.operator.act) || (c.reg && c.reg.act);
				rat = (act == 13) ? '5G NSA' : (act == 11 || act == 18 || act == 19) ? '5G' : (act == 7 || act == 10) ? '4G' : (act >= 2 && act <= 6) ? '3G' : '4G';
			} else if (c.cfun === 0) rat = _('Radio off');
		}
		if (c && c.error) { rat = _('No response'); col = M.qCol('poor'); }
		var ratEl = M.v('rat');
		ratEl.firstChild.nodeValue = rat;
		ratEl.style.color = col;
		var bars = M.v('bars');
		if (bars) {
			var n = score == null ? 0 : Math.max(1, Math.round(score / 2));
			Array.prototype.forEach.call(bars.children, function(b, idx) { b.className = idx < n ? 'on' : ''; });
		}

		var oper = M.carrierName(c && c.operator);
		/* With COPS empty (the transition after a restart), the PLMN comes from the first 5-6 digits of the IMSI */
		if (oper === '--' && c && c.ident && c.ident.imsi) {
			var imsi = c.ident.imsi;
			var plmn5 = imsi.substring(0, 5), plmn6 = imsi.substring(0, 6);
			oper = M.PLMN_CN[plmn5] || M.PLMN_CN[plmn6] || plmn5;
		}
		M.set('op', score != null ? _('%s · Signal %s %s/10').format(oper, label, score.toFixed(1)) : _('%s · Signal %s').format(oper, label));

		var cl = [];
		if (c && c.nr && c.nr.band) cl.push('n' + c.nr.band + (c.nr.bw_mhz ? ' · ' + c.nr.bw_mhz + ' MHz' : '') + ' · PCI ' + c.nr.pci + ' · ARFCN ' + c.nr.arfcn);
		if (c && c.lte && c.lte.band) cl.push(_('Anchor B%s').format(c.lte.band) + ' · PCI ' + c.lte.pci + ' · EARFCN ' + c.lte.earfcn +
			(c.lte.sinr != null ? ' · SINR ' + c.lte.sinr.toFixed(1) + ' dB' : ''));
		if (c && c.nr && (c.nr.gnb || c.nr.cid)) cl.push((c.nr.gnb ? '基站 gNB ' + c.nr.gnb : '') + (c.nr.cid ? ' · 小区 ' + c.nr.cid : ''));
		M.v('cellline').innerHTML = cl.map(M.esc).join('<br>') || '<span style="color:var(--text-muted,var(--text-light,#777))">' + _('No serving cell') + '</span>';

		M.set('rsrp', '--');
		if (rsrp != null) M.v('rsrp').innerHTML = rsrp.toFixed(1) + '<small> dBm</small>';
		M.v('rsrp').style.color = col;
		M.v('metric-chips').innerHTML =
			'<span class="mud-q" style="background:color-mix(in oklab,' + col + ' 16%,transparent);color:' + col + '">' + label + '</span>' +
			(rsrq != null ? '<span class="mud-tag">RSRQ ' + rsrq.toFixed(1) + '</span>' : '') +
			(sinr != null ? '<span class="mud-tag">SINR ' + sinr.toFixed(1) + '</span>' : '');

		/* -- link & traffic */
		var nrk = (c && c.nr) || null;
		var radioMetrics = '';
		if (c && c.nr && c.nr.band) radioMetrics += radioMetricRows('5G', 'nr', c.nr);
		if (c && c.lte && c.lte.band) radioMetrics += radioMetricRows('4G', 'lte', c.lte);
		M.v('radio-metrics').innerHTML = radioMetrics || radioMetricRows('', 'nr', null);
		M.set('bw', nrk && nrk.bw_mhz ? nrk.bw_mhz + ' MHz' : (c && c.lte && c.lte.bw) || '--');
		var qos = c && c.qos;
		M.set('qci', qos && qos.qci != null ? qos.qci : '--');
		M.set('ambr', qos && qos.dl != null ? qos.dl + ' / ' + qos.ul + ' Mbps' : '--');

		var net = (i.net && (i.net.mobile || i.net.sipa_eth0)) || null;
		if (net && this.lastNet && i.ts && this.lastNet.ts) {
			var dt = i.ts - this.lastNet.ts;
			if (dt > 0) {
				var dl = (net.rx - this.lastNet.rx) / dt, ul = (net.tx - this.lastNet.tx) / dt;
				M.set('dl', M.fmtRate(dl)); M.set('ul', M.fmtRate(ul));
				this.dlHist.push(Math.max(0,dl)); this.ulHist.push(Math.max(0,ul)); this.rateTimes.push(Date.now());
				if (this.dlHist.length > RATE_WIN) { this.dlHist.shift(); this.ulHist.shift(); this.rateTimes.shift(); }
				this.drawRates();
			}
		}
		if (net) {
			M.set('session-rx', M.fmtBytes(net.rx)); M.set('session-tx', M.fmtBytes(net.tx));
			this.lastNet = { ts: i.ts, rx: net.rx, tx: net.tx };
		}
		var w = i.wan || {};
		M.v('ip').innerHTML = M.esc(w.ip4 || '--') + (w.ip6 ? '<br>' + M.esc(w.ip6) : '');
		M.set('dns', w.dns || '--');
		M.set('apn', w.apn || '--');
		M.set('sess', w.uptime ? M.fmtUptime(w.uptime) : '--');
		var regmap = { 0: _('Not registered'), 1: _('Registered'), 2: _('Searching'), 3: _('Registration denied'), 4: _('Unknown'), 5: _('Registered (roaming)'), 7: _('Emergency only'), 8: _('Emergency only'), 10: _('Registered') };
		var reg = '--';
		if (c && c.reg) {
			reg = regmap[c.reg.stat] || _('Status %s').format(c.reg.stat);
			if (c.reg.tac) reg += ' · TAC ' + c.reg.tac;
			if (c.reg5g && c.reg5g.stat == 1) reg += ' · 5G ' + regmap[c.reg5g.stat];
		} else if (c && c.error) reg = M.errText(c);
		M.set('reg', reg);

		var anchor = (c && c.lte && c.lte.band) ? c.lte : null;
		M.v('lteanchor').innerHTML = anchor ?
			'<div class="mud-r"><span class="mud-k">' + (c.nr && c.nr.band ? _('LTE anchor') : _('LTE link')) + '</span><span class="mud-v">B' + M.esc(anchor.band) +
			' · RSRP ' + (anchor.rsrp != null ? anchor.rsrp.toFixed(1) : '--') +
			(anchor.sinr != null ? ' · SINR ' + anchor.sinr.toFixed(1) : '') +
			(anchor.ca ? ' · ' + M.esc(anchor.ca) : '') + '</span></div>' : '';

		/* -- slow-tier sections */
		if (slowChanged) {
			this.repaintNeigh();
			M.set('carr', oper);
			M.set('plmn', (c && c.operator && c.operator.plmn) ||
				(c && c.ident && c.ident.imsi ? c.ident.imsi.substring(0, 5) : '--'));
			this.paintIdent(c);
		}

		/* -- Wi-Fi, LAN, device, SIM */
		var wf = i.wifi || {};
		M.set('ssid', wf.ssid || '--');
		M.set('chan', (wf.channel || '--') + (wf.band ? ' (' + wf.band + (wf.width ? ' · ' + wf.width : '') + ')' : ''));
		M.set('wenc', wf.enc || '--');
		M.set('whid', wf.hidden == 1 ? _('Hidden') : _('No'));
		M.set('wcountry', wf.country || '--');
		M.set('whostapd', wf.hostapd ? _('Running') : _('Not running'));
		M.set('wusb', (i.net && i.net.usb0 && i.net.usb0.up) ? _('Connected') : _('Disconnected'));
		M.set('conntrack', i.conns != null ? _('%s entries').format(i.conns) : '--');
		M.set('lanip', (i.lan && i.lan.ip) || '--');
		M.set('wcl', _('%s clients').format(wf.clients_n != null ? wf.clients_n : '--'));
		M.set('wleases', _('%s entries').format(i.lan ? i.lan.leases : '--'));
		M.v('clist').innerHTML = (wf.clients || []).map(function(cl) {
			var l = cl.signal != null ? (cl.signal >= -55 ? 'excellent' : cl.signal >= -67 ? 'good' : cl.signal >= -80 ? 'fair' : 'poor') : 'unknown';
			return '<div class="mud-cli"><div class="t"><b>' + M.esc(cl.host || cl.ip || cl.mac) + '</b>' +
				(cl.signal != null ? '<span style="color:' + M.qCol(l) + ';font-variant-numeric:tabular-nums">' + cl.signal + ' dBm</span>' : '') +
				'</div><div class="s">' + (cl.ip ? M.esc(cl.ip) + ' · ' : '') + M.esc(cl.mac) +
				((cl.tx || cl.rx) ? ' · ↑' + M.esc(cl.tx || '--') + ' ↓' + M.esc(cl.rx || '--') : '') +
				(cl.conn ? ' · ' + M.esc(cl.conn) : '') + '</div></div>';
		}).join('') || '';
		/* Recent DHCP leases: shows who has been here even when nobody is connected */
		M.v('leases').innerHTML = (i.lan && i.lan.list && i.lan.list.length)
			? '<div class="mud-note" style="margin:0 0 4px">' + _('Recent DHCP leases') + '</div>' +
				'<table class="mud-table"><tbody>' +
				i.lan.list.slice(0, 8).map(function(l) {
					return '<tr><td>' + M.esc(l.host || l.ip || '?') + '</td><td>' + M.esc(l.ip || '') + '</td>' +
						'<td style="color:var(--text-subtle,var(--text-light,#999))">' + M.esc(l.mac) + '</td>' +
						'<td>' + (l.left >= 3600 ? _('%d h').format(Math.round(l.left / 3600)) : _('%d min').format(Math.max(0, Math.round(l.left / 60)))) + '</td></tr>';
				}).join('') + '</tbody></table>'
			: '';

		var t = i.temps || {};
		M.v('temps').innerHTML = [ [ 'SoC', t.soc ], [ 'CPU', t.cpu ], [ _('Modem'), t.modem ], [ _('Board'), t.board ] ]
			.filter(function(x) { return x[1] != null; })
			.map(function(x) {
				var lab = x[1] >= 75 ? 'poor' : x[1] >= 60 ? 'fair' : 'good';
				return '<span style="color:' + M.qCol(lab) + '">' + x[0] + ' ' + x[1] + '°C</span>';
			}).join('') || '<span style="color:var(--text-muted,var(--text-light,#777))">' + _('No temperature readings') + '</span>';

		if (i.cpu && this.lastCpu && i.cpu.total != null && this.lastCpu.total != null) {
			var dt2 = i.cpu.total - this.lastCpu.total, di = i.cpu.idle - this.lastCpu.idle;
			var pct = dt2 > 0 ? Math.max(0, Math.min(100, Math.round((dt2 - di) * 100 / dt2))) : null;
			if (pct != null) {
				M.set('cpu', pct + '%');
				M.v('cpu-bar').style.width = pct + '%';
			}
		}
		var previousCores = (this.lastCpu && this.lastCpu.cores) || [], cores = (i.cpu && i.cpu.cores) || [];
		var corePercent = this._corePercent || (this._corePercent = {});
		M.v('cpu-cores').replaceChildren.apply(M.v('cpu-cores'), cores.map(function(core) {
			var prev = previousCores.find(function(p) { return p.id === core.id; });
			var total = prev ? core.total - prev.total : 0, idle = prev ? core.idle - prev.idle : 0;
			if (total > 0 && idle >= 0) corePercent[core.id] = Math.max(0, Math.min(100, Math.round((total-idle)*100/total)));
			else if (!prev || total < 0 || idle < 0) corePercent[core.id] = null;
			var value = corePercent[core.id];
			return E('div', {class:'f50-core'}, [
				E('div',{class:'f50-core-head'},[E('span',{},core.id.toUpperCase()),E('b',{},value == null ? '—' : value+'%')]),
				E('div',{class:'mud-meter'},E('i',{style:'width:'+(value || 0)+'%;background:var(--f50-dl,#0066cc)'}))
			]);
		}));
		this.lastCpu = i.cpu || null;
		/* One cur/max frequency bar per cluster */
		M.v('freqs').innerHTML = ((i.cpu && i.cpu.freqs) || []).map(function(f, n) {
			if (f.cur == null || f.max == null || !f.max) return '';
			var w = Math.max(2, Math.round(f.cur * 100 / f.max));
			return '<div class="mud-freq"><span class="mud-k">' + _('Cluster %d').format(n) + '</span>' +
				'<div class="mud-meter" style="flex:1;margin:4px 8px 0"><i style="width:' + w + '%;background:var(--brand,var(--primary,#3b82f6))"></i></div>' +
				'<span class="mud-v" style="flex:0 0 auto">' + (f.cur / 1000).toFixed(0) + ' <span style="opacity:.55">/ ' + (f.max / 1000).toFixed(0) + ' MHz</span></span></div>';
		}).join('');

		if (i.mem && i.mem.total_kb) {
			var used = i.mem.total_kb - i.mem.avail_kb, pct = Math.round(used * 100 / i.mem.total_kb);
			M.set('ram', pct + '%'); M.v('ram-bar').style.width = pct + '%';
			M.set('ram-sub', _('Total %s · free %s').format(M.fmtBytes(i.mem.total_kb * 1024), M.fmtBytes(i.mem.avail_kb * 1024)));
		}
		if (i.storage && i.storage.total_kb) {
			var pct2 = Math.round(i.storage.used_kb * 100 / i.storage.total_kb);
			M.set('disk', pct2 + '%'); M.v('disk-bar').style.width = pct2 + '%';
		}
		/* Battery (U30 Air): capacity, then what it is doing and how many watts, the
		 * voltage, and the USB input where the charger reports it. No battery (F50):
		 * no tile. */
		var p = i.power || {}, bk = M.v('batt-kpi');
		if (bk) bk.style.display = p.present ? '' : 'none';
		if (p.present) {
			/* direction from status; for Unknown and the like from the sign of the current (positive into the
			 * battery), with the gauge's own 20 mA dead band. The 5.4 SQC charger says Unknown once full. */
			var pst = p.status, pcur = p.ua || 0, parts = [ _('Battery') ];
			var pdir = pst === 'Charging' ? 1 : pst === 'Discharging' ? -1 :
				(pst === 'Full' || pst === 'Not charging') ? 0 : (pcur >= 20000 ? 1 : pcur <= -20000 ? -1 : 0);
			var pw = p.w != null ? Number(p.w).toFixed(1) : null;
			if (pdir > 0) parts.push(pw != null ? _('charging %s W').format(pw) : _('charging'));
			else if (pdir < 0) parts.push(pw != null ? _('drawing %s W').format(pw) : p.usb ? _('not charging') : _('on battery'));
			else if (pst === 'Full' || (p.usb && p.capacity >= 100)) parts.push(_('full'));
			else if (pst === 'Not charging') parts.push(_('not charging'));
			if (p.volt != null && p.capacity != null) parts.push(p.volt + ' V');
			if (p.usb) parts.push(p.in_w != null ? _('USB in %s W').format(Number(p.in_w).toFixed(1)) +
				(p.in_volt != null ? ' (' + p.in_volt + ' V)' : '') : 'USB');
			M.set('batt', p.capacity != null ? p.capacity + '%' : (p.volt != null ? p.volt + ' V' : '--'));
			M.set('batt-l', parts.join(' · '));
		}
		M.set('model', i.model || '--');
		M.set('fwos', i.fw || '--');
		M.set('modem', (i.modem && i.modem.alive ? _('Online') : _('No response')) + (i.modem && i.modem.atd ? '' : ' · ' + _('AT adapter unavailable')));
		var androidBtn = M.v('btn-android');
		if (androidBtn) androidBtn.style.display = i.capabilities && i.capabilities.dualboot ? '' : 'none';

		var b;
		b = M.v('btn-data'); b.className = 'mud-btn' + (w.up ? ' on' : ''); b.textContent = '流量 · ' + (w.up ? '已开启' : '已关闭'); b.setAttribute('aria-pressed', w.up ? 'true' : 'false');
		b = M.v('btn-wifi'); b.className = 'mud-btn' + (wf.up ? ' on' : ''); b.textContent = 'Wi-Fi · ' + (wf.up ? '已开启' : '已关闭'); b.setAttribute('aria-pressed', wf.up ? 'true' : 'false');
	}
});
