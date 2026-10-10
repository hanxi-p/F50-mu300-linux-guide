#!/bin/sh
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/bin:/opt/mu300/busybox-bin
umask 077
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || exit 1
[ "$(cat /etc/mu300/image-version)" = v2026.10.11 ] || { echo 'This payload targets the v2026.10.11 OpenWrt base; adapt other versions first.'; exit 1; }
case "$(uname -r)" in 5.4.*) ;; *) echo 'This payload targets the vendor 5.4 kernel'; exit 1;; esac
for cmd in flock bash setsid sha256sum uci ubus; do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd"; exit 1; }; done
sha256sum -c SHA256SUMS >/dev/null
while read -r src target; do
 [ -f "$src" ] && [ -f "$target" ] || { echo "Missing source or target: $src $target"; exit 1; }
 case "$src" in mu300-next-boot) bash -n "$src";; *) sh -n "$src";; esac
done < files.txt
[ -f /etc/init.d/mu300-smsd ] && [ -f /etc/init.d/mu300-ndp ] || exit 1
if [ "${1:-}" = --check ]; then echo 'Compatibility, dependencies, syntax and payload hashes: PASS'; exit 0; fi
[ "$#" = 0 ] || exit 2
# Do not race a boot image write or a requested system switch.
exec 8>/run/f50-boot-control.flock
flock -n 8 || { echo 'Boot update/control is busy; retry after it finishes'; exit 1; }
B=/root/f50-system-reliability-backups/$(date +%Y%m%d-%H%M%S)-$$
mkdir -p "$B"
cp files.txt "$B/paths"
cp restore.sh "$B/restore.sh"
while read -r src target; do mkdir -p "$B$(dirname "$target")"; cp -p "$target" "$B$target"; done < files.txt
cp -p /etc/config/firewall "$B/firewall"
for service in mu300-smsd mu300-ndp; do
 if /etc/init.d/$service running; then echo 1 > "$B/$service.running"; else echo 0 > "$B/$service.running"; fi
done
ok=0
finish() {
 trap '' TERM INT
 if [ "$ok" != 1 ]; then
  while read -r src target; do cp -p "$B$target" "$target"; done < "$B/paths"
  cp -p "$B/firewall" /etc/config/firewall
 fi
 for service in mu300-smsd mu300-ndp; do
  [ "$(cat "$B/$service.running")" != 1 ] || /etc/init.d/$service start
 done
}
trap finish EXIT
trap 'exit 143' TERM INT
for service in mu300-smsd mu300-ndp; do /etc/init.d/$service stop; done
while read -r src target; do
 cp "$src" "$target.new"; chmod 755 "$target.new"; mv "$target.new" "$target"
done < files.txt
# 5.4 manual reloads also need offloading disabled; do not reload a live
# firewall here. The saved settings apply on its next normal reload/boot.
uci set firewall.@defaults[0].flow_offloading=0
uci set firewall.@defaults[0].flow_offloading_hw=0
uci commit firewall
sync
ok=1
echo "Installed selected components. Restore: sh $B/restore.sh"
