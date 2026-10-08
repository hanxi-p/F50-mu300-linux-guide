#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo '请使用 root SSH 执行'; exit 1; }
version=$(cat /etc/mu300/image-version 2>/dev/null || true)
[ "$version" = v2026.10.11 ] || { echo "此补丁匹配 v2026.10.11，当前为 $version；请先核对页面与 RPC 差异。"; exit 1; }
for cmd in vnstat ubus uci jsonfilter setsid sha256sum; do command -v "$cmd" >/dev/null || { echo "缺少 $cmd，请先安装对应依赖"; exit 1; }; done
[ -r /usr/libexec/unisoc-modem/dashboard-info ] && [ -r /www/luci-static/resources/view/mu300/home.js ] || { echo '缺少 MU300 面板'; exit 1; }
ip link show sipa_eth0 >/dev/null || { echo '当前蜂窝接口不是 sipa_eth0，请先适配统计接口'; exit 1; }
[ "$(uci -q get wireless.radio0.band)" = 5g ] && [ "$(uci -q get wireless.ap0.device)" = radio0 ] || { echo '此版本匹配 radio0 / ap0 和 5GHz 无线，请先适配'; exit 1; }
sha256sum -c SHA256SUMS >/dev/null
backup="/root/f50-dashboard-backups/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$backup"
chmod 700 "$backup"
if /etc/init.d/vnstat enabled; then echo 1 > "$backup/vnstat.enabled"; else echo 0 > "$backup/vnstat.enabled"; fi
if /etc/init.d/vnstat running; then echo 1 > "$backup/vnstat.running"; else echo 0 > "$backup/vnstat.running"; fi
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
PATHS
while IFS= read -r path; do
 if [ -e "$path" ]; then mkdir -p "$backup$(dirname "$path")"; cp -p "$path" "$backup$path"; fi
done < "$backup/paths"
cp restore.sh "$backup/restore.sh"
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
FILES
chmod 755 /usr/libexec/unisoc-modem/dashboard-info /usr/libexec/rpcd/f50quota /usr/libexec/rpcd/f50channel /usr/libexec/rpcd/f50openclash /usr/libexec/f50openclash-worker
/etc/init.d/vnstat enable
/etc/init.d/vnstat start
/etc/init.d/rpcd restart
printf '安装完成；请重新登录并强制刷新首页。\n原页面和配置备份：%s\n恢复命令：sh %s/restore.sh\n' "$backup" "$backup"
ubus call f50quota status >/dev/null
ubus call f50channel status >/dev/null
ubus call f50openclash status >/dev/null
