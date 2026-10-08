'use strict';
'require rpc';
'require ui';
'require baseclass';
var status = rpc.declare({ object: 'f50openclash', method: 'status' });
var setEnabled = rpc.declare({ object: 'f50openclash', method: 'set_enabled', params: ['enabled'] });
return baseclass.extend({
    mount: function(root) {
        var button = root.querySelector('#mud-btn-openclash'), state, timer, disposed = false, pending = false, waiting = false, lastError = '';
        button.disabled = true;
        function refresh() {
            if (disposed || pending) return Promise.resolve();
            pending = true;
            return status().then(function(s) {
                state = s;
                button.className = 'mud-btn' + (s.running ? ' on' : '');
                button.disabled = waiting || s.busy || s.installed === false;
                button.textContent = s.busy ? ('OpenClash · ' + (s.target === '1' ? '开启中…' : '关闭中…')) : 'OpenClash · ' + (s.running ? '已开启' : '已关闭');
                if (s.installed === false) button.textContent = 'OpenClash · 未安装';
                button.title = s.running ? '点击关闭 OpenClash，改为直连上网' : '点击开启 OpenClash';
                button.setAttribute('aria-pressed', s.running ? 'true' : 'false');
                if (s.error && s.error !== lastError) ui.addNotification(null, E('p', {}, s.error));
                lastError = s.error || '';
            }).catch(function() { button.disabled = true; button.textContent = 'OpenClash · 状态不可用'; }).finally(function() { pending = false; });
        }
        function schedule() {
            timer = setTimeout(function() {
                if (disposed || !document.documentElement.contains(root)) return;
                refresh().finally(schedule);
            }, state && state.busy ? 1500 : 5000);
        }
        button.onclick = function() {
            if (!state || state.busy || waiting) return;
            waiting = true; button.disabled = true; button.textContent = 'OpenClash · 正在切换…';
            setEnabled(!state.running).then(function(r) {
                if (!r.ok) throw new Error(r.error || '操作失败');
            }).catch(function(e) { ui.addNotification(null, E('p', {}, e.message)); }).finally(function() {
                waiting = false; refresh();
            });
        };
        refresh().finally(schedule);
        return function() { disposed = true; clearTimeout(timer); };
    }
});
