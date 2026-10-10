#!/bin/sh
set -eu
backup=$(cd "$(dirname "$0")" && pwd)
case "$backup" in /root/f50-dashboard-backups/*) :;; *) echo '请从实际备份目录运行本脚本'; exit 1;; esac
[ -f "$backup/paths" ] || exit 1
for service in f50-wifi-guard f50-dns-guard; do
 [ ! -x /etc/init.d/$service ] || { /etc/init.d/$service stop; /etc/init.d/$service disable; }
done
[ ! -x /etc/init.d/f50history ] || { /etc/init.d/f50history stop; /etc/init.d/f50history disable; }
/etc/init.d/vnstat stop
[ ! -x /etc/init.d/f50power ] || /etc/init.d/f50power disable
while IFS= read -r path; do
 [ "$path" != /usr/libexec/f50-bounded ] || continue
 if [ -e "$backup$path" ]; then mkdir -p "$(dirname "$path")"; cp -p "$backup$path" "$path";
 else rm -f "$path"; fi
done < "$backup/paths"
if [ "$(cat "$backup/vnstat.enabled")" = 1 ]; then /etc/init.d/vnstat enable; else /etc/init.d/vnstat disable; fi
if [ "$(cat "$backup/vnstat.running")" = 1 ]; then /etc/init.d/vnstat start; fi
if [ -x /etc/init.d/f50power ]; then
 if [ "$(cat "$backup/f50power.enabled" 2>/dev/null || echo 0)" = 1 ]; then /etc/init.d/f50power enable; fi
 mode=$(uci -q get f50dashboard.power.mode || echo performance)
 /usr/libexec/f50-run-worker power "$mode" || true
else
 for n in 0 1 2 3 4 5 6 7; do [ ! -e /sys/devices/system/cpu/cpu$n/online ] || echo 1 > /sys/devices/system/cpu/cpu$n/online; done
 /opt/mu300/bin/mu300-toolkit profile balanced >/dev/null
fi
/etc/init.d/rpcd restart
if [ -x /etc/init.d/f50history ] && [ "$(cat "$backup/f50history.enabled" 2>/dev/null || echo 0)" = 1 ]; then /etc/init.d/f50history enable; /etc/init.d/f50history start; fi
for service in f50-wifi-guard f50-dns-guard; do
 if [ -x /etc/init.d/$service ]; then
  [ "$(cat "$backup/$service.enabled" 2>/dev/null || echo 0)" != 1 ] || /etc/init.d/$service enable
  [ "$(cat "$backup/$service.running" 2>/dev/null || echo 0)" != 1 ] || /etc/init.d/$service start
 fi
done
echo '页面与配置已恢复；流量数据库保留在原目录或 /opt/vnstat，不删除历史记录。重新登录并强制刷新首页。'
