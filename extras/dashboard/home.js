'use strict';
'require view';
'require rpc';
'require f50adguard as F50AdGuard';
'require uci';
'require mu300.common as M';
'require f50quota5 as F50Quota';
'require f50channelstate as F50Channel';
'require f50openclash2 as F50OpenClash';
'require f50powerradio25 as F50Power';

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

var DEFAULT_POLL_S = 3;
var RATE_WIN = 200;
var liveStatus=rpc.declare({object:"f50history",method:"status",nobatch:true,expect:{"":{}}});
function dashboardResult(r){var s=r.snapshot || {};s.history=r.history || [];s.previousCpu=r.previous && r.previous.info && r.previous.info.cpu;return s;}
function dashboardStatus(){return liveStatus().then(dashboardResult);}

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
		var self = this;
		var seed = document.getElementById('f50-dashboard-seed');
		if (seed) {
			try {
				var initial = dashboardResult(JSON.parse(seed.textContent));
				requestAnimationFrame(function(){ if(document.documentElement.contains(root)) self.update(initial); });
			} catch(e) {}
			seed.remove();
		}
		var intervalMs = DEFAULT_POLL_S * 1000;
		var config = L.resolveDefault(uci.load('unisoc_modem')).then(function() {
			intervalMs = pollSeconds(uci.get('unisoc_modem', 'main', 'home_refresh_interval')) * 1000;
		});
		/* Read the full status once now; never run the sysinfo and status collections twice at the same time. */
		var first = L.resolveDefault(dashboardStatus()).then(function(st) {
			self.update(st || {});
		});
		/* Keep control RPCs out of the first status response batch. */
		first.finally(function(){
			if(!document.documentElement.contains(root)) return;
			self._channelDispose = F50Channel.mount(root);
			self._quotaDispose = F50Quota.mount(root);
			self._openclashDispose = F50OpenClash.mount(root);
			self._powerDispose = F50Power.mount(root);
			self._adguardDispose = F50AdGuard.mount(root);
		});
		/* LuCI poll.add() truncates intervals to whole seconds. Use a one-shot
		 * timer so 1.5 s remains 1.5 s and slow requests never overlap. */
		function refresh() {
			if (!document.documentElement.contains(root)) return;
			L.resolveDefault(dashboardStatus()).then(function(st) { self.update(st || {}); }).finally(function() {
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
        if(this._adguardDispose)this._adguardDispose();
        if(this._actionsObserver)this._actionsObserver.disconnect();
		if (this._channelDispose) this._channelDispose();
		if (this._quotaDispose) this._quotaDispose();
		if (this._openclashDispose) this._openclashDispose();
		if (this._powerDispose) this._powerDispose();
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
  <h3>流量</h3>
  <div class="f50-combined-chart" style="width:100%">
    <div class="f50-rate-head">
      <div class="f50-rate-download"><span>下载</span><b id="mud-dl">--</b></div>
      <div class="f50-rate-upload"><span>上传</span><b id="mud-ul">--</b></div>
    </div>
    <div id="mud-rate-chart" style="width:100%;margin:6px 0;touch-action:pan-y"></div>
    <div id="mud-rate-detail" style="display:none;font-size:.75em;margin:4px 0"></div>

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
        <div class="mud-r"><span class="mud-k">手机号</span><span class="mud-v" id="mud-phone">读取中…</span></div>
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
    <div class="mud-kpi"><b id="mud-ram">--</b><span>${_('Memory')}<span class="mud-sub" id="mud-ram-sub">--</span></span><div class="mud-meter"><i id="mud-ram-bar" style="background:var(--info,#0ea5e9)"></i></div></div>
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
  <div class="mud-ctl f50-primary-controls">
    <button class="mud-btn" id="mud-btn-data">流量开关</button>
    <button class="mud-btn" id="mud-btn-power">温控模式</button>
    <button class="mud-btn" id="mud-btn-5g">自动 5G</button>
    <button class="mud-btn" id="mud-btn-openclash" aria-pressed="false">OpenClash · 读取状态…</button>
    <button class="mud-btn warn" id="mud-btn-reboot">${_('Restart device')}</button>
    <button class="mud-btn" id="mud-btn-other" aria-expanded="false">更多设置</button>
    <button class="mud-btn" id="mud-btn-wifi">Wi-Fi 开关</button>
    <button class="mud-btn" id="mud-btn-adguard" aria-pressed="false">AdGuard Home</button>
    <button class="mud-btn" id="mud-btn-channel">信道设置</button>
    <button class="mud-btn warn" id="mud-btn-modem">${_('Restart modem')}</button>

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
  requestAnimationFrame(function(){var title=root.querySelector('.mud-sec h3');if(title){var style=getComputedStyle(title);root.style.setProperty('--f50-rate-label-size',style.fontSize);root.style.setProperty('--f50-rate-label-weight',style.fontWeight);}});
  root.prepend(E('style', {}, `
   .f50-home{--f50-dl:#249ad1;--f50-ul:#159b85}
   .f50-home .f50-rate-head{display:flex;flex-direction:column;gap:3px;margin:5px 0 7px}
   .f50-home .f50-rate-head>div{display:flex;align-items:baseline;gap:9px;min-width:0}
   .f50-home .f50-rate-head b{font-variant-numeric:tabular-nums;line-height:1.2}
   .f50-home .f50-rate-download{color:var(--f50-dl)}
   .f50-home .f50-rate-download{font-size:1.7rem;font-weight:750}
   .f50-home .f50-rate-upload{color:var(--f50-ul)}
   .f50-home .f50-rate-upload{font-size:1.4rem;font-weight:650}
   .f50-home .f50-rate-head span,.f50-home .f50-rate-head b{font-size:inherit;font-weight:inherit;white-space:nowrap;color:inherit}
   .f50-home .f50-rate-head span{font-size:var(--f50-rate-label-size,1rem);font-weight:var(--f50-rate-label-weight,600)}
   html[data-darkmode=true] .f50-home{--f50-dl:#249ad1;--f50-ul:#159b85}
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
  var secs=root.querySelectorAll('.mud-body > .mud-sec'),link=secs[0],device=secs[1],quick=secs[2],locks=secs[3];
  var heroRight=root.querySelector('.mud-hero-r');
  heroRight.prepend(E('div',{class:'f50-signal-title'},'信号详情'));
  var qci=root.querySelector('#mud-qci').parentNode;
  qci.classList.add('f50-qci');root.querySelector('.mud-hero-l').appendChild(qci);qci.appendChild(E('div',{id:'mud-hero-ambr',class:'mud-tag f50-hero-ambr',title:'网络下发的下行 / 上行会话速率上限'},'--'));
  var cols=link.querySelector('.mud-cols');var cellLine=root.querySelector('#mud-cellline');cellLine.replaceWith(E('div',{class:'f50-hero-band',id:'mud-hero-band'},'--'));cols.prepend(E('div',{class:'f50-cell-detail'},[E('b',{},'基站与小区'),cellLine]));wrap([cols],'蜂窝网络详情',cols);
  device.querySelector('h3').textContent='设备负载与温度';
  var kpis=device.querySelector('.mud-kpis'),extra=E('div',{class:'mud-kpis'});
  ['disk','batt'].forEach(function(id){extra.appendChild(root.querySelector('#mud-'+id).parentNode);});
  var temp=E('div',{class:'mud-kpi f50-average-temp'},[E('b',{id:'mud-temp-average'},'--'),E('span',{},'')]);
  kpis.appendChild(temp);
  var temps=root.querySelector('#mud-temps');temp.appendChild(temps);
  var cores=E('div',{id:'mud-cpu-cores',class:'f50-core-grid','aria-label':'各 CPU 核心占用'});
  var freq=root.querySelector('#mud-freqs');
  var cpuDetails=E('div',{id:'f50-cpu-details',hidden:true,class:'f50-cpu-details'},[cores,freq]);
  kpis.insertAdjacentElement('afterend',cpuDetails);
  var cpuCard=root.querySelector('#mud-cpu').parentNode;
  cpuCard.setAttribute('role','button');cpuCard.setAttribute('tabindex','0');cpuCard.setAttribute('aria-expanded','false');cpuCard.setAttribute('aria-controls','f50-cpu-details');cpuCard.classList.add('f50-cpu-toggle');
  cpuCard.onclick=function(){cpuDetails.hidden=!cpuDetails.hidden;cpuCard.setAttribute('aria-expanded',String(!cpuDetails.hidden));};
  cpuCard.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();cpuCard.click();}};
  var dcols=device.querySelector('.mud-cols'),leases=root.querySelector('#mud-leases'),android=root.querySelector('#mud-btn-android').parentNode;
  wrap([extra,dcols,leases,android],'无线、局域网与设备详情',dcols);
  var other=E('div',{id:'f50-other-controls',class:'mud-ctl f50-other-controls',hidden:true});quick.appendChild(other);
  ['wifi','adguard','channel','modem','android'].forEach(function(id){other.appendChild(root.querySelector('#mud-btn-'+id));});android.remove();
  var otherBtn=root.querySelector('#mud-btn-other');otherBtn.setAttribute('aria-controls','f50-other-controls');
  otherBtn.onclick=function(){other.hidden=!other.hidden;otherBtn.setAttribute('aria-expanded',String(!other.hidden));otherBtn.textContent=other.hidden?'更多设置':'收起设置';};
  var lockTable=locks.querySelector('.mud-scroll');locks.querySelector('h3').remove();
  other.appendChild(E('a',{class:'mud-btn',id:'mud-btn-rat-settings',href:L.url('admin','modem','locks')},'设置制式与频段'));
  var lockContent=E('div',{id:'f50-lock-details',hidden:true},[lockTable]);
  var lockBtn=E('button',{class:'mud-btn',id:'mud-btn-locks','aria-expanded':'false','aria-controls':'f50-lock-details'},'锁制式与频段');
  lockContent.hidden=false;other.appendChild(lockContent);lockContent.style.gridColumn='1 / -1';locks.remove();
  lockBtn.onclick=function(){lockContent.hidden=!lockContent.hidden;lockBtn.setAttribute('aria-expanded',String(!lockContent.hidden));};
  var self=this;
  function moveActions(){if(!document.documentElement.contains(root))return;var actions=document.querySelector('.cbi-page-actions');if(actions && !lockContent.contains(actions)){lockContent.appendChild(actions);actions.style.marginTop='8px';if(self._actionsObserver)self._actionsObserver.disconnect();}}
  this._actionsObserver=new MutationObserver(moveActions);this._actionsObserver.observe(document.body,{childList:true,subtree:true});moveActions();

  root.appendChild(E('style',{},`
   .f50-home [hidden]{display:none!important}
   .f50-home .mud-hero{align-items:flex-start;display:flex;flex-wrap:nowrap}
   .f50-home .mud-hero-l{flex:1 1 52%;min-width:0}
   .f50-home .mud-hero-r{flex:1 1 48%;min-width:0;text-align:right;flex-direction:column;align-items:flex-end;gap:5px;padding-top:0}
   .f50-home .f50-signal-title{font-size:.78rem;font-weight:750;line-height:1.2;margin-bottom:5px;white-space:nowrap}
   .f50-home .f50-hero-band{font-size:.8rem;color:var(--text-muted,#666);margin-top:4px}
   .f50-home .f50-cell-detail{padding:4px 0;grid-column:1/-1}
   .f50-home .f50-cell-detail .mud-cellline{font-size:.8rem;margin-top:4px;overflow-wrap:anywhere}
   .f50-home .f50-hero-ambr{white-space:nowrap;flex-shrink:0}
   .f50-home #mud-hero-band{display:none}
   .f50-home #mud-op{font-size:.78rem;white-space:normal;line-height:1.4}
   .f50-home .f50-qci{display:flex;align-items:center;font-size:.8rem;justify-content:flex-start;gap:5px;margin-top:5px;border:0;padding:0}
   .f50-home .mud-hero-r .mud-rsrp{font-size:1.7rem;line-height:1.2}
   .f50-home .mud-hero-r .mud-chips{justify-content:flex-end;gap:4px;flex-wrap:wrap}
   .f50-home .mud-hero-r .mud-chip{font-size:.7rem;padding:3px 5px}
   .f50-home .mud-hero-l .mud-cellline{overflow-wrap:anywhere;font-size:.72rem}
   .f50-home .mud-sec:nth-child(2)>.mud-kpis{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:0!important}
   .f50-home .mud-sec:nth-child(2)>.mud-kpis b{font-size:1.4rem}
   .f50-home .f50-average-temp{border:1px solid var(--border-color,rgba(127,127,127,.28));border-radius:8px}
   .f50-home .f50-cpu-toggle{cursor:pointer}
   .f50-home .f50-cpu-toggle>span:after{content:' ▾'}
   .f50-home .f50-cpu-toggle[aria-expanded=true]>span:after{content:' ▴'}
   .f50-home #mud-ram-sub{display:block}
   .f50-home #mud-temps{display:grid;grid-template-columns:1fr;gap:2px;margin:4px 0 0}
   .f50-home #mud-temps span{display:block;font-size:.65rem;padding:0;border:0;text-align:left;white-space:nowrap}
   .f50-home .f50-other-controls{margin-top:6px;grid-template-columns:repeat(6,minmax(0,1fr))!important}
   .f50-home .f50-primary-controls{grid-template-columns:repeat(6,minmax(0,1fr))}
   .f50-home .mud-ctl .mud-btn{background:#fff;color:#263238;border-color:#dce1e5}
   .f50-home .mud-ctl .mud-btn.on,.f50-home .mud-ctl .mud-btn[aria-pressed=true],.f50-home .mud-ctl .mud-btn[aria-expanded=true]{background:#008cba;border-color:#008cba;color:#fff}
   .f50-home .f50-primary-controls>.mud-btn,.f50-home .f50-other-controls>.mud-btn{height:46px;min-height:46px;max-height:46px;width:100%;min-width:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.25;margin:0;padding:6px;text-decoration:none}
   .f50-home .f50-other-controls>.mud-btn{background:#fff3e5;color:#9a4800;border:1px solid #f3a34c;font-size:.78rem}
   .f50-home .f50-other-controls>.mud-btn.on,.f50-home .f50-other-controls>.mud-btn[aria-pressed=true],.f50-home .f50-other-controls>.mud-btn[aria-expanded=true]{background:#ed861b;border-color:#ed861b;color:#fff}
   .f50-home #mud-neigh .mud-lockbtn{display:inline-block;min-width:3em;padding:1px 8px;border-radius:99px;font-size:.74rem;font-weight:600;text-align:center;white-space:nowrap;line-height:1.5;height:auto;min-height:0;border:0;background:color-mix(in oklab,#238b45 16%,transparent);color:#238b45}
   .f50-home #mud-neigh .mud-lockbtn.locked{background:#238b45;color:#fff}
   .f50-home #mud-btn-other,.f50-home #mud-btn-other[aria-expanded=true],.f50-home #f50-other-controls>.mud-btn,.f50-home #f50-other-controls .mud-lockbtn{background:#ed861b!important;border-color:#ed861b!important;color:#fff!important}
   .f50-home #f50-other-controls>.mud-btn.on,.f50-home #f50-other-controls>.mud-btn[aria-pressed=true],.f50-home #f50-other-controls .mud-lockbtn.locked{box-shadow:none}
   .f50-home #mud-btn-other,.f50-home #f50-other-controls>.mud-btn,.f50-home #f50-other-controls .mud-lockbtn{font-size:.78rem!important}
   .f50-home .f50-primary-controls>.mud-btn{font-size:.78rem!important;font-weight:500!important}
   .f50-home #mud-btn-other,.f50-home #mud-btn-other[aria-expanded=false],.f50-home #mud-btn-other[aria-expanded=true],.f50-home #f50-other-controls>.mud-btn,.f50-home #f50-other-controls .mud-lockbtn{background:#238b45!important;border-color:#238b45!important;color:#fff!important;font-weight:500!important}
   .f50-home #mud-btn-reboot{background:#fff;color:#b52c38;border-color:#e2a5ab}
   .f50-home #mud-btn-reboot:hover{background:#fff1f2}
   .f50-home #mud-rate-chart{height:230px!important;background:#fff;border:1px solid #c8dfe7;border-radius:8px;overflow:hidden;color:#385666;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
   .f50-home .f50-rate-svg{left:0;top:22px;width:100%;height:calc(100% - 46px)}
   .f50-home .f50-btop-label{position:absolute;left:9px;right:9px;display:flex;justify-content:space-between;font-size:11px;line-height:20px;white-space:nowrap;font-variant-numeric:tabular-nums}
   .f50-home .f50-btop-dl{top:2px;right:50%;color:#249ad1}.f50-home .f50-btop-ul{top:2px;bottom:auto;left:52%;color:#159b85}
   @media(max-width:600px){.f50-home #mud-rate-chart{height:200px!important}.f50-home .f50-btop-label{font-size:10px}}
   .f50-home #mud-btn-other,.f50-home #mud-btn-other[aria-expanded=false],.f50-home #f50-other-controls>.mud-btn,.f50-home #f50-other-controls .mud-lockbtn{background:#fff!important;border-color:#238b45!important;color:#238b45!important;box-shadow:none}
   .f50-home #mud-btn-other[aria-expanded=true],.f50-home #f50-other-controls>.mud-btn.on,.f50-home #f50-other-controls>.mud-btn[aria-pressed=true],.f50-home #f50-other-controls>.mud-btn[aria-expanded=true],.f50-home #f50-other-controls .mud-lockbtn.locked{background:#238b45!important;border-color:#238b45!important;color:#fff!important}
   .f50-home .f50-rate-time-axis{position:absolute;left:9px;right:9px;bottom:2px;height:19px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #c8dfe7;color:#607985;font-size:10px;font-variant-numeric:tabular-nums}
   .f50-home .f50-rate-time-axis span{position:relative;padding-top:3px}.f50-home .f50-rate-time-axis span:before{content:'';position:absolute;top:0;height:3px;border-left:1px solid #94b2bf}.f50-home .f50-rate-time-axis span:last-child:before{right:0}
   .f50-home .f50-rate-svg{left:46px;width:calc(100% - 54px)}
   .f50-home .f50-rate-value-axis{position:absolute;left:5px;top:22px;bottom:24px;width:37px;display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-size:9px;line-height:1;color:#607985;font-variant-numeric:tabular-nums}
   .f50-home .f50-rate-value-axis small{font-size:8px}.f50-home .f50-rate-value-axis .f50-axis-dl{color:#249ad1}.f50-home .f50-rate-value-axis .f50-axis-ul{color:#159b85}
   .f50-home .f50-rate-value-axis{display:block}
   .f50-home .f50-rate-value-axis>span{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap}
   .f50-home .f50-rate-axis-unit{position:absolute;left:4px;top:6px;width:38px;text-align:right;color:#607985;font-size:8px;line-height:14px}
   .f50-home .f50-btop-label{left:46px;right:8px}
   .f50-home .f50-rate-time-axis{left:46px;right:8px}
   .f50-home .f50-rate-svg{left:0;width:100%}
   .f50-home .f50-rate-value-axis{left:5px;width:25px;text-align:left;pointer-events:none;z-index:1}
   .f50-home .f50-rate-value-axis>span{left:0;right:auto;background:rgba(255,255,255,.8);padding-right:2px}
   .f50-home .f50-rate-axis-unit{left:5px;width:auto;text-align:left}
   .f50-home .f50-rate-time-axis{left:0;right:0;padding:0 5px;box-sizing:border-box}
   .f50-home .f50-btop-dl{left:42px;right:50%}.f50-home .f50-btop-ul{left:52%;right:5px}
   .f50-home .f50-btop-dl{top:2px;bottom:auto;left:42px;right:5px}
   .f50-home .f50-btop-ul{top:auto;bottom:25px;left:42px;right:5px;pointer-events:none}
   .f50-home .f50-rate-axis-unit{display:none}
   .f50-home .f50-btop-dl{left:5px;right:auto;top:2px;justify-content:flex-start;gap:0}
   .f50-home .f50-btop-ul{left:5px;right:auto;bottom:25px;justify-content:flex-start;gap:0}
   .f50-home .f50-btop-label>span:empty{display:none}
   .f50-home .f50-btop-dl,.f50-home .f50-btop-ul{left:50%;right:auto;transform:translateX(-50%);justify-content:center;white-space:nowrap}
   .f50-home .f50-btop-dl{top:2px;bottom:auto}.f50-home .f50-btop-ul{top:auto;bottom:2px;z-index:2}
   .f50-home .f50-btop-label,.f50-home .f50-rate-time-axis{font-size:10px;line-height:16px;height:20px;box-sizing:border-box}
   .f50-home .f50-btop-dl{top:2px;bottom:auto;align-items:center}
   .f50-home .f50-btop-ul{top:auto;bottom:2px;align-items:center}
   .f50-home .f50-rate-time-axis{bottom:2px;border:0;align-items:center}
   .f50-home .f50-rate-time-axis span{padding-top:0;line-height:16px}
   .f50-home .f50-rate-time-axis span:before{display:none}
   .f50-home #mud-btn-power[data-switching=true],.f50-home #mud-btn-5g[data-switching=true]{opacity:1!important;cursor:wait}
   .f50-home #mud-btn-power[data-switching=true][data-target-mode=eco],.f50-home #mud-btn-5g[data-switching=true][data-target-mode="4g"]{background:#d3eadb!important;border-color:#9fcbb0!important;color:#417c55!important}
   .f50-home #mud-btn-power[data-switching=true][data-target-mode=performance]{background:#f2d5d5!important;border-color:#dca6a6!important;color:#a85454!important}
   .f50-home #mud-btn-5g[data-switching=true][data-target-mode=auto]{background:#d2eaf2!important;border-color:#9fc9d9!important;color:#397c94!important}
   .f50-home #mud-btn-other,.f50-home #mud-btn-other[aria-expanded=false],.f50-home #f50-other-controls>.mud-btn,.f50-home #f50-other-controls .mud-lockbtn{background:#fff!important;border-color:#008cba!important;color:#008cba!important}
   .f50-home #mud-btn-other[aria-expanded=true],.f50-home #f50-other-controls>.mud-btn.on,.f50-home #f50-other-controls>.mud-btn[aria-pressed=true],.f50-home #f50-other-controls>.mud-btn[aria-expanded=true],.f50-home #f50-other-controls .mud-lockbtn.locked{background:#008cba!important;border-color:#008cba!important;color:#fff!important}
   .f50-home #mud-btn-other{font-weight:650!important;position:relative;box-shadow:none!important}
   .f50-home .f50-primary-controls>.mud-btn{font-size:.82rem!important;font-weight:600!important}
   .f50-home .mud-ctl.f50-primary-controls{padding:0 8px;border-left:1px solid transparent;border-right:1px solid transparent;box-sizing:border-box}
   .f50-home #f50-other-controls>.mud-btn{font-size:var(--f50-rate-label-size,.7rem)!important;font-weight:600!important}
   .f50-home #mud-btn-other{font-size:.82rem!important}
   .f50-home #mud-btn-other[aria-expanded=true]{background:#e8f4fa!important;border-color:#abd3e3!important;color:#00799f!important}
   .f50-home #f50-lock-details table td{font-size:calc(.8rem - 1px)!important}
   .f50-home #f50-lock-details table th{font-size:calc(.72rem - 1px)!important}
   .f50-home #f50-lock-details table th:nth-child(3),.f50-home #mud-neigh tr>td:nth-child(3){display:none}
   .f50-home #f50-lock-details .cbi-page-actions,.f50-home #f50-lock-details .cbi-page-actions *{font-size:var(--f50-rate-label-size,.7rem)!important}
   .f50-home #f50-other-controls #mud-neigh .mud-lockbtn{font-size:calc(.78rem - 1px)!important}
   .f50-home #mud-btn-other:after,.f50-home #f50-other-controls:before,.f50-home #f50-other-controls:after{display:none!important;content:none!important}
   .f50-home #f50-other-controls{padding:8px;border:1px solid #e0e6eb;border-radius:10px;margin-top:8px;background:#e8f4fa;overflow:visible;box-sizing:border-box}
   .f50-home #f50-lock-details{border-top:1px solid #e8edf1;margin-top:2px;padding-top:8px;min-width:0}
   @media(max-width:600px){.f50-home .mud-ctl.f50-primary-controls{grid-template-columns:repeat(3,minmax(0,1fr))!important}.f50-home #f50-other-controls{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
   .f50-home #mud-btn-other:hover,.f50-home #f50-other-controls .mud-btn:hover{filter:brightness(.95)}
   .f50-home #mud-btn-power{white-space:normal;overflow-wrap:anywhere;line-height:1.25}
   .f50-home #mud-btn-power[data-mode=performance]{background:#d63b3b;border-color:#d63b3b;color:#fff}
   .f50-home #mud-btn-power[data-mode=eco]{background:#238b45;border-color:#238b45;color:#fff}
   .f50-home #mud-btn-5g[data-mode="4g"]{background:#238b45;border-color:#238b45;color:#fff}
   @media(max-width:600px){
    .f50-home .f50-other-controls{grid-template-columns:repeat(3,minmax(0,1fr))!important}

    .f50-home .f50-primary-controls{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    .f50-home .f50-primary-controls>.mud-btn{grid-column:auto;padding-left:2px;padding-right:2px;font-size:.7rem;min-width:0}
    .f50-home .mud-hero-l{flex-basis:52%}
    .f50-home .mud-hero-r{flex-basis:48%}
    .f50-home .f50-signal-title{font-size:.78rem}
    .f50-home .mud-hero-r .mud-rsrp{font-size:1.7rem}
    .f50-home .mud-hero-r .mud-chips{gap:3px}
    .f50-home .mud-sec:nth-child(2)>.mud-kpis .mud-kpi{padding:7px 6px}
    .f50-home .mud-sec:nth-child(2)>.mud-kpis span{font-size:.68rem}
    .f50-home #mud-ram-sub{display:block;overflow-wrap:anywhere}
    .f50-home #mud-temps{grid-template-columns:1fr}
    .f50-home #mud-temps span{font-size:.62rem}
   }
  `));
 },
 drawRates: function() {
  var el=this._root.querySelector('#mud-rate-chart'),self=this;
  if(!el || this.dlHist.length<1)return;
  var historySize=Math.max(1,this.dlHist.length-1);
  var peak=Math.max(1,Math.max.apply(null,this.dlHist.concat(this.ulHist))),left=0,right=900,top=12,bottom=186;
  var divisor=peak>=1048576?1048576:peak>=1024?1024:1,unit=divisor===1048576?'MB/s':divisor===1024?'KB/s':'B/s';
  var normalized=peak/divisor,power=Math.pow(10,Math.floor(Math.log10(normalized))),fraction=normalized/power;
  peak=(fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power*divisor;
  function tick(value){return Number((value/divisor).toPrecision(2)).toString();}
  var mid=100,amplitude=88;
  function pts(arr,up){var result=[];arr.forEach(function(v,i){var x=left+i/historySize*(right-left),y=mid+(up?-1:1)*Math.min(1,Math.max(0,v)/peak)*amplitude;y=Math.round(y/3)*3;if(i)result.push(x.toFixed(1)+','+result[result.length-1].split(',')[1]);result.push(x.toFixed(1)+','+y);});return result.join(' ');}
  function area(arr,up){return '0,100 '+pts(arr,up)+' 900,100';}
  var grid='';[12,56,100,144,188].forEach(function(y){grid+='<line x1="0" y1="'+y+'" x2="900" y2="'+y+'" stroke="#557786" opacity=".12"/>';});
  var latestDl=this.dlHist[this.dlHist.length-1]||0,latestUl=this.ulHist[this.ulHist.length-1]||0;
  el.innerHTML='<div class="f50-rate-axis-unit">'+unit+'</div><div class="f50-rate-value-axis" aria-label="动态速率纵轴"><span class="f50-axis-dl" style="top:6%">'+tick(peak)+'</span><span class="f50-axis-dl" style="top:28%">'+tick(peak/2)+'</span><span style="top:50%">0</span><span class="f50-axis-ul" style="top:72%">'+tick(peak/2)+'</span><span class="f50-axis-ul" style="top:94%">'+tick(peak)+'</span></div><div class="f50-btop-label f50-btop-dl"><span></span><span>峰值 '+M.fmtRate(Math.max.apply(null,this.dlHist))+'</span></div><svg class="f50-rate-svg" role="img" aria-label="btop 风格上下行速率历史曲线" viewBox="0 0 900 200" preserveAspectRatio="none"><defs><pattern id="f50-net-pixels" width="9" height="6" patternUnits="userSpaceOnUse"><rect width="7" height="4" fill="white"/></pattern><mask id="f50-net-mask"><rect width="900" height="200" fill="url(#f50-net-pixels)"/></mask></defs>'+grid+'<g mask="url(#f50-net-mask)"><polygon data-series="download" points="'+area(this.dlHist,true)+'" fill="#70c8ef"/><polygon data-series="upload" points="'+area(this.ulHist,false)+'" fill="#4dcbb6"/></g><polyline points="'+pts(this.dlHist,true)+'" stroke="#249ad1" fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke"/><polyline points="'+pts(this.ulHist,false)+'" stroke="#159b85" fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke"/><line x1="0" y1="100" x2="900" y2="100" stroke="#adcbd6" stroke-width="1"/><line id="mud-rate-cursor" y1="12" y2="186" stroke="#385666" opacity=".6" style="display:none"/></svg><div class="f50-btop-label f50-btop-ul"><span></span><span>峰值 '+M.fmtRate(Math.max.apply(null,this.ulHist))+'</span></div><div class="f50-rate-time-axis" aria-label="时间坐标轴"><span id="mud-rate-start"></span><span id="mud-rate-end"></span></div>';
  function time(t){return new Date(t).toLocaleTimeString('zh-CN',{hour12:false});}
  M.set('rate-start',time(this.rateTimes[0]));M.set('rate-end',time(this.rateTimes[this.rateTimes.length-1]));
  var seconds=this.rateTimes.length>1?(this.rateTimes[this.rateTimes.length-1]-this.rateTimes[0])/1000:0;
  el.onpointermove=el.onpointerdown=function(e){
   var r=el.querySelector('svg').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*900;
   var n=Math.max(0,Math.min(self.dlHist.length-1,Math.round((x-left)/(right-left)*historySize)));
   var cursor=el.querySelector('#mud-rate-cursor'),cx=left+n/historySize*(right-left);
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
			var btn = this;
			if (!on) { act('wifi', 'on', null, btn); return; }
			M.confirmBox('关闭 Wi-Fi？', '关闭后，通过 Wi-Fi 连接的设备将断开，无法继续通过 Wi-Fi 管理 F50。', { danger: true, okText: '确认关闭' })
				.then(function(go) { if (go) act('wifi', 'off', null, btn); });
		};
		q('btn-modem').onclick = function() {
			var btn = this;
			M.confirmBox(_('Restart modem'), _('Cellular connectivity may stop for 1–2 minutes.'), { danger: true })
				.then(function(go) { if (go) act('modem-reset', null, null, btn); });
		};
		q('btn-reboot').onclick = function() {
			var btn = this;
			M.confirmBox('重启设备？', '所有连接将暂时断开，设备启动后可重新连接。', { danger: true, okText: '确认重启' })
				.then(function(go) { if (go) act('reboot', null, null, btn); });
		};
		q('btn-android').onclick = function() {
			var btn = this;
			M.confirmBox('切换到 Android？',
				'设备将立即重启进入 Android，当前 OpenWrt 管理页面和连接将断开。',
				{ danger: true, okText: '确认切换并重启' })
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
        if(st.previousCpu)this.lastCpu=st.previousCpu;
        if(st.history && st.history.length){this.dlHist=st.history.map(function(p){return p[1];});this.ulHist=st.history.map(function(p){return p[2];});this.rateTimes=st.history.map(function(p){return p[0]*1000;});var latest=st.history[st.history.length-1];M.set("dl",M.fmtRate(latest[1]));M.set("ul",M.fmtRate(latest[2]));this.drawRates();}
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
		M.set('op', oper.replace(/中国(电信|移动|联通|广电)/g,'$1'));var shortBands=[];if(c && c.nr && c.nr.band)shortBands.push('n'+c.nr.band+(c.nr.bw_mhz?' · '+c.nr.bw_mhz+' MHz':''));if(c && c.lte && c.lte.band)shortBands.push('B'+c.lte.band);M.set('op',oper.replace(/中国(电信|移动|联通|广电)/g,'$1')+' · '+(shortBands.join(' / ') || '等待网络'));M.set('hero-band','');

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
		M.set('qci', qos && qos.qci != null ? qos.qci : '--');var qciValue=M.v('qci');qciValue.className='mud-q';qciValue.style.background='color-mix(in oklab,'+col+' 16%,transparent)';qciValue.style.color=col;
		M.set('ambr', qos && qos.dl != null ? qos.dl + ' / ' + qos.ul + ' Mbps' : '--');M.set('hero-ambr',qos && qos.dl != null ? qos.dl+' / '+(qos.ul != null?qos.ul:'--')+' Mbps':'--');

		var net = (i.net && (i.net.mobile || i.net.sipa_eth0)) || null;
		if (!st.history && net && this.lastNet && i.ts && this.lastNet.ts) {
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
		var tempValues=[t.soc,t.cpu,t.modem,t.board];
		M.set('temp-average',tempValues.every(function(v){return v!=null && Number.isFinite(Number(v));})?(tempValues.reduce(function(a,v){return a+Number(v);},0)/4).toFixed(1)+'°C':'--');
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
			var value = corePercent[core.id], offline = core.online === false || core.online === 0;
			return E('div', {class:'f50-core'}, [
				E('div',{class:'f50-core-head'},[E('span',{},core.id.toUpperCase()),E('b',{},offline ? '已关闭' : value == null ? '—' : value+'%')]),
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
			var ramSub=this._root.querySelector('#mud-ram-sub'); ramSub.replaceChildren(E('span',{style:'display:block'},'余'+(i.mem.avail_kb/1048576).toFixed(1)+'G'),E('span',{style:'display:block'},'共'+(i.mem.total_kb/1048576).toFixed(1)+'G'));
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
		b = M.v('btn-data'); b.className = 'mud-btn' + (w.up ? ' on' : ''); b.textContent = '流量'; b.setAttribute('aria-pressed', w.up ? 'true' : 'false');
		b = M.v('btn-wifi'); b.className = 'mud-btn' + (wf.up ? ' on' : ''); b.textContent = 'Wi-Fi'; b.setAttribute('aria-pressed', wf.up ? 'true' : 'false');
	}
});
