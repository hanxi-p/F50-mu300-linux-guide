#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo '请使用 root SSH 执行'; exit 1; }
version=$(cat /etc/mu300/image-version 2>/dev/null || true)
[ "$version" = v2026.10.11 ] || { echo "此补丁匹配 v2026.10.11，当前为 $version；请先核对页面与 RPC 差异。"; exit 1; }
for cmd in vnstat ubus uci jsonfilter setsid sha256sum curl; do command -v "$cmd" >/dev/null || { echo "缺少 $cmd，请先安装对应依赖"; exit 1; }; done
[ -r /usr/libexec/unisoc-modem/dashboard-info ] && [ -r /www/luci-static/resources/view/mu300/home.js ] || { echo '缺少 MU300 面板'; exit 1; }
ip link show sipa_eth0 >/dev/null || { echo '当前蜂窝接口不是 sipa_eth0，请先适配统计接口'; exit 1; }
[ "$(uci -q get wireless.radio0.band)" = 5g ] && [ "$(uci -q get wireless.ap0.device)" = radio0 ] || { echo '此版本匹配 radio0 / ap0 和 5GHz 无线，请先适配'; exit 1; }
sha256sum -c SHA256SUMS >/dev/null
for path in /usr/share/ucode/luci/template/themes/aurora/header.ut /usr/share/ucode/luci/template/header.ut /etc/init.d/mu300-hw; do
 [ -r "$path" ] || { echo "缺少 $path；此版本首屏优化需要 Aurora UT 主题，请先适配。"; exit 1; }
done
backup="/root/f50-dashboard-backups/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$backup"
chmod 700 "$backup"
if /etc/init.d/vnstat enabled; then echo 1 > "$backup/vnstat.enabled"; else echo 0 > "$backup/vnstat.enabled"; fi
if /etc/init.d/vnstat running; then echo 1 > "$backup/vnstat.running"; else echo 0 > "$backup/vnstat.running"; fi
if [ -x /etc/init.d/f50power ] && /etc/init.d/f50power enabled; then echo 1 > "$backup/f50power.enabled"; else echo 0 > "$backup/f50power.enabled"; fi
if [ -x /etc/init.d/f50history ] && /etc/init.d/f50history enabled; then echo 1 > "$backup/f50history.enabled"; else echo 0 > "$backup/f50history.enabled"; fi
cat > "$backup/paths" <<'PATHS'
/www/luci-static/resources/view/mu300/home.js
/usr/libexec/unisoc-modem/dashboard-info
/www/luci-static/resources/f50quota5.js
/www/luci-static/resources/f50channel.js
/www/luci-static/resources/f50openclash.js
/usr/libexec/rpcd/f50quota
/usr/libexec/rpcd/f50channel
/usr/libexec/rpcd/f50openclash
/usr/libexec/f50openclash-worker
/usr/share/rpcd/acl.d/luci-app-f50quota.json
/usr/share/rpcd/acl.d/luci-app-f50channel.json
/usr/share/rpcd/acl.d/luci-app-f50openclash.json
/etc/config/f50quota
/etc/config/vnstat
/etc/vnstat.conf
/www/luci-static/resources/f50power.js
/usr/libexec/rpcd/f50power
/usr/libexec/f50power-worker
/etc/init.d/f50power
/usr/share/rpcd/acl.d/luci-app-f50power.json
/etc/config/f50dashboard
/etc/config/luci
/www/luci-static/resources/f50powerlittle.js
/www/luci-static/resources/f50openclash2.js
/usr/libexec/rpcd/f50history
/usr/libexec/f50history-worker
/etc/init.d/f50history
/usr/share/rpcd/acl.d/luci-app-f50history.json
/www/luci-static/resources/f50adguard.js
/usr/libexec/rpcd/f50adguard
/usr/libexec/f50adguard-worker
/usr/libexec/f50-dns-route
/usr/share/rpcd/acl.d/luci-app-f50adguard.json
/usr/libexec/f50-wifi-nondfs
/usr/libexec/f50-wifi-start-safe
/etc/init.d/mu300-hw
/etc/config/wireless
/etc/config/unisoc_modem
/usr/share/ucode/luci/template/themes/aurora/header.ut
/usr/share/ucode/luci/template/header.ut
PATHS
while IFS= read -r path; do
 if [ -e "$path" ]; then mkdir -p "$backup$(dirname "$path")"; cp -p "$path" "$backup$path"; fi
done < "$backup/paths"
cp restore.sh "$backup/restore.sh"
[ ! -x /etc/init.d/f50history ] || /etc/init.d/f50history stop
/etc/init.d/vnstat stop
old_dir=$(vnstat --showconfig | awk '/^[;]?DatabaseDir / {gsub(/"/,"",$2); print $2; exit}')
case "$old_dir" in /tmp*|/var*|'')
 mkdir -p /opt/vnstat
 if [ -n "$old_dir" ] && [ -f "$old_dir/vnstat.db" ] && [ "$old_dir" != /opt/vnstat ]; then
  [ ! -f /opt/vnstat/vnstat.db ] || { echo "新旧数据库都存在，请先合并；恢复命令：sh $backup/restore.sh"; exit 1; }
  cp -p "$old_dir/vnstat.db" /opt/vnstat/vnstat.db
 fi
 sed -i '/^[[:space:]]*DatabaseDir[[:space:]]/d' /etc/vnstat.conf
 printf '\nDatabaseDir "/opt/vnstat"\n' >> /etc/vnstat.conf
 ;;
esac
for setting in 'SaveInterval 5' 'MonthRotate 1' 'MonthlyMonths -1' 'DailyDays 365'; do
 key=${setting%% *}
 sed -i "/^[[:space:]]*$key[[:space:]]/d" /etc/vnstat.conf
 printf '%s\n' "$setting" >> /etc/vnstat.conf
done
uci -q show vnstat.@vnstat[0] >/dev/null || uci add vnstat vnstat >/dev/null
if ! uci -q get vnstat.@vnstat[0].interface | tr ' ' '\n' | grep -qx sipa_eth0; then uci add_list vnstat.@vnstat[0].interface=sipa_eth0; fi
uci commit vnstat
if [ ! -f /etc/config/f50quota ]; then printf "config plan 'plan'\n\toption quota_gb '0'\n" > /etc/config/f50quota; fi
while IFS=' ' read -r src target; do
 mkdir -p "$(dirname "$target")"
 cp "$src" "$target"
 chmod 644 "$target"
done <<'FILES'
home.js /www/luci-static/resources/view/mu300/home.js
dashboard-info /usr/libexec/unisoc-modem/dashboard-info
f50quota5.js /www/luci-static/resources/f50quota5.js
f50channel.js /www/luci-static/resources/f50channel.js
f50openclash.js /www/luci-static/resources/f50openclash.js
f50quota /usr/libexec/rpcd/f50quota
f50channel /usr/libexec/rpcd/f50channel
f50openclash /usr/libexec/rpcd/f50openclash
f50openclash-worker /usr/libexec/f50openclash-worker
luci-app-f50quota.json /usr/share/rpcd/acl.d/luci-app-f50quota.json
luci-app-f50channel.json /usr/share/rpcd/acl.d/luci-app-f50channel.json
luci-app-f50openclash.json /usr/share/rpcd/acl.d/luci-app-f50openclash.json
f50power.js /www/luci-static/resources/f50power.js
f50power /usr/libexec/rpcd/f50power
f50power-worker /usr/libexec/f50power-worker
f50power-init /etc/init.d/f50power
luci-app-f50power.json /usr/share/rpcd/acl.d/luci-app-f50power.json
f50power.js /www/luci-static/resources/f50powerlittle.js
f50openclash.js /www/luci-static/resources/f50openclash2.js
f50history /usr/libexec/rpcd/f50history
f50history-worker /usr/libexec/f50history-worker
f50history-init /etc/init.d/f50history
luci-app-f50history.json /usr/share/rpcd/acl.d/luci-app-f50history.json
f50adguard.js /www/luci-static/resources/f50adguard.js
f50adguard /usr/libexec/rpcd/f50adguard
f50adguard-worker /usr/libexec/f50adguard-worker
f50-dns-route /usr/libexec/f50-dns-route
luci-app-f50adguard.json /usr/share/rpcd/acl.d/luci-app-f50adguard.json
f50-wifi-nondfs /usr/libexec/f50-wifi-nondfs
f50-wifi-start-safe /usr/libexec/f50-wifi-start-safe
FILES
chmod 755 /usr/libexec/f50-wifi-nondfs /usr/libexec/f50-wifi-start-safe
sh apply-reliability.sh
chmod 755 /usr/libexec/unisoc-modem/dashboard-info /usr/libexec/rpcd/f50quota /usr/libexec/rpcd/f50channel /usr/libexec/rpcd/f50openclash /usr/libexec/f50openclash-worker
chmod 755 /usr/libexec/rpcd/f50power /usr/libexec/f50power-worker /etc/init.d/f50power
chmod 755 /usr/libexec/rpcd/f50adguard /usr/libexec/f50adguard-worker /usr/libexec/f50-dns-route
/etc/init.d/f50power enable
/etc/init.d/f50power start
/etc/init.d/vnstat enable
/etc/init.d/vnstat start
chmod 755 /usr/libexec/rpcd/f50history /usr/libexec/f50history-worker /etc/init.d/f50history
# Session lifetime is LuCI sauth.sessiontime, not rpcd executable timeout.
uci set luci.sauth.sessiontime=7200
uci commit luci
/etc/init.d/rpcd restart
/etc/init.d/f50history enable
/etc/init.d/f50history start
printf '安装完成；请重新登录并强制刷新首页。\n原页面和配置备份：%s\n恢复命令：sh %s/restore.sh\n' "$backup" "$backup"
ubus call f50power status >/dev/null
ubus call f50quota status >/dev/null
ubus call f50channel status >/dev/null
ubus call f50openclash status >/dev/null
