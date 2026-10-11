'use strict';
'require rpc';
'require ui';
'require baseclass';
var status = rpc.declare({ object: 'f50adguard', method: 'status', nobatch: true });
var setEnabled = rpc.declare({ object: 'f50adguard', method: 'set_enabled', params: ['enabled'], nobatch: true });
function boundedRequest(p) {
    return new Promise(function(resolve, reject) {
        var timer=setTimeout(function(){reject(new Error('状态请求超时，正在重试'));},8000);
        p.then(function(v){clearTimeout(timer);resolve(v);},function(e){clearTimeout(timer);reject(e);});
    });
}
return baseclass.extend({
    mount: function(root) {
        var button = root.querySelector('#mud-btn-adguard'), state, timer, disposed = false, pending = false, waiting = false, lastError = '';
        button.disabled = true;
        button.textContent = 'AdGuard Home · 读取中…';
        function refresh() {
            if (disposed || pending) return Promise.resolve();
            pending = true;
            return boundedRequest(status()).then(function(s) {
                if (disposed) return;
                state = s;
                button.className = 'mud-btn' + (s.running ? ' on' : '');
                button.disabled = waiting || s.busy;
                button.textContent = s.busy ? ('AdGuard Home · ' + (s.target === '1' ? '开启中…' : s.target === '0' ? '关闭中…' : '等待 DNS 切换…')) : 'AdGuard Home';
                button.title = s.running ? '点击关闭 AdGuard Home' : '点击开启 AdGuard Home';
                button.setAttribute('aria-pressed', s.running ? 'true' : 'false');
                if (s.error && s.error !== lastError) ui.addNotification(null, E('p', {}, s.error));
                lastError = s.error || '';
            }).catch(function() { if(disposed)return; button.disabled = true; button.textContent = 'AdGuard Home · 状态重试中…'; }).finally(function() { pending = false; });
        }
        function schedule() {
            if(disposed)return;
            timer = setTimeout(function() {
                if (disposed || !document.documentElement.contains(root)) return;
                refresh().finally(schedule);
            }, state && state.busy ? 1500 : 5000);
        }
        button.onclick = function() {
            if (!state || state.busy || waiting) return;
            waiting = true; button.disabled = true; button.textContent = 'AdGuard Home · 正在切换…';
            boundedRequest(setEnabled(!state.running)).then(function(r) {
                if (!r.ok) throw new Error(r.error || '操作失败');
            }).catch(function(e) { ui.addNotification(null, E('p', {}, e.message)); }).finally(function() {
                waiting = false; if(!disposed)refresh();
            });
        };
        refresh().finally(schedule);
        return function() { disposed = true; clearTimeout(timer); };
    }
});
