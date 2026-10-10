#!/bin/sh
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/bin:/opt/mu300/busybox-bin
B=$(cd "$(dirname "$0")" && pwd)
case "$B" in /root/f50-system-reliability-backups/*) ;; *) exit 1;; esac
[ -f "$B/paths" ] && [ -f "$B/firewall" ] || exit 1
exec 8>/run/f50-boot-control.flock
flock -n 8 || { echo 'Boot update/control is busy'; exit 1; }
for service in mu300-smsd mu300-ndp; do /etc/init.d/$service stop; done
while read -r src target; do
 [ "$target" != /usr/libexec/f50-bounded ] || continue
 cp -p "$B$target" "$target"
done < "$B/paths"
cp -p "$B/firewall" /etc/config/firewall
sync
for service in mu300-smsd mu300-ndp; do
 [ "$(cat "$B/$service.running")" != 1 ] || /etc/init.d/$service start
done
echo 'Previous component files and firewall configuration restored. No boot partition was written.'
