#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
header=/usr/share/ucode/luci/template/themes/aurora/header.ut
loader=/usr/share/ucode/luci/template/header.ut
boot=/etc/init.d/mu300-hw
[ -r "$header" ] && [ -r "$loader" ] && [ -r "$boot" ] || { echo '此首屏补丁需要 Aurora UT 主题与 mu300-hw；请先适配当前主题。'; exit 1; }
# Preserve user theme changes; only insert the authenticated homepage snapshot.
if ! grep -q 'id="f50-dashboard-seed"' "$header"; then
 grep -q '<title>' "$header" || exit 1
 grep -q 'readfile.*from.*fs' "$header" || { echo '主题缺少 readfile，请先适配'; exit 1; }
 awk -v snippet="$PWD/firstpaint.ut" '{print} /<title>/ {while ((getline s < snippet)>0) print s; close(snippet)}' "$header" > "$header.f50-new"
 mv "$header.f50-new" "$header"
fi
# The LuCI resource version also versions its dynamically loaded dependencies.
if ! grep -q 'f50fast1' "$loader"; then
 grep -q 'pkgs_update_time }}' "$loader" || { echo 'LuCI loader 格式不同，请先适配'; exit 1; }
 sed -i 's/pkgs_update_time }}/pkgs_update_time }}-f50fast1/' "$loader"
fi
if ! grep -q '/usr/libexec/f50-wifi-start-safe' "$boot"; then
 grep -q '/opt/mu300/bin/openwrt-wifi-config' "$boot" || { echo '启动流程不同，请先适配'; exit 1; }
 awk '{print} /\/opt\/mu300\/bin\/openwrt-wifi-config/ {print "\t/usr/libexec/f50-wifi-start-safe >>/tmp/mu300-wifi-start.log 2>&1"}' "$boot" > "$boot.f50-new"
 sh -n "$boot.f50-new"
 cat "$boot.f50-new" > "$boot"
 rm -f "$boot.f50-new"
fi
uci set unisoc_modem.main.home_refresh_interval=3
uci commit unisoc_modem
/usr/libexec/f50-wifi-nondfs apply >/dev/null || { echo '当前地区没有合法非 DFS 80 MHz 信道组；请先核对国家码和无线能力。'; exit 1; }
echo '首屏快照与非 DFS 开机保护已配置；当前连接不重启。'
