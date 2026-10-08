#!/bin/sh
set -eu
backup=$(cd "$(dirname "$0")" && pwd)
case "$backup" in /root/f50-dashboard-backups/*) :;; *) echo '请从实际备份目录运行本脚本'; exit 1;; esac
[ -f "$backup/paths" ] || exit 1
/etc/init.d/vnstat stop
[ ! -x /etc/init.d/f50power ] || /etc/init.d/f50power disable
while IFS= read -r path; do
 if [ -e "$backup$path" ]; then mkdir -p "$(dirname "$path")"; cp -p "$backup$path" "$path";
 else rm -f "$path"; fi
done < "$backup/paths"
if [ "$(cat "$backup/vnstat.enabled")" = 1 ]; then /etc/init.d/vnstat enable; else /etc/init.d/vnstat disable; fi
if [ "$(cat "$backup/vnstat.running")" = 1 ]; then /etc/init.d/vnstat start; fi
if [ -x /etc/init.d/f50power ]; then
 if [ "$(cat "$backup/f50power.enabled" 2>/dev/null || echo 0)" = 1 ]; then /etc/init.d/f50power enable; fi
 mode=$(uci -q get f50dashboard.power.mode || echo performance)
 mkdir /tmp/f50power.lock 2>/dev/null && /usr/libexec/f50power-worker "$mode" || true
else
 for n in 0 1 2 3 4 5 6 7; do [ ! -e /sys/devices/system/cpu/cpu$n/online ] || echo 1 > /sys/devices/system/cpu/cpu$n/online; done
 /opt/mu300/bin/mu300-toolkit profile balanced >/dev/null
fi
/etc/init.d/rpcd restart
echo '页面与配置已恢复；流量数据库保留在原目录或 /opt/vnstat，不删除历史记录。重新登录并强制刷新首页。'
