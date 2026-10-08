#!/bin/sh
set -eu
backup=$(cd "$(dirname "$0")" && pwd)
case "$backup" in /root/f50-dashboard-backups/*) :;; *) echo '请从实际备份目录运行本脚本'; exit 1;; esac
[ -f "$backup/paths" ] || exit 1
/etc/init.d/vnstat stop
while IFS= read -r path; do
 if [ -e "$backup$path" ]; then mkdir -p "$(dirname "$path")"; cp -p "$backup$path" "$path";
 else rm -f "$path"; fi
done < "$backup/paths"
if [ "$(cat "$backup/vnstat.enabled")" = 1 ]; then /etc/init.d/vnstat enable; else /etc/init.d/vnstat disable; fi
if [ "$(cat "$backup/vnstat.running")" = 1 ]; then /etc/init.d/vnstat start; fi
/etc/init.d/rpcd restart
echo '页面与配置已恢复；流量数据库保留在原目录或 /opt/vnstat，不删除历史记录。重新登录并强制刷新首页。'
