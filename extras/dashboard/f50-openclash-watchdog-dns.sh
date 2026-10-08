#!/bin/sh
set -eu
file=/usr/share/openclash/openclash_watchdog.sh
[ -f "$file" ] || exit 0
grep -q 'F50: respect the active AdGuard DNS chain' "$file" && exit 0
grep -q '^## DNS' "$file" && grep -q '^##Dler Cloud Checkin' "$file" || { echo '守护脚本结构不同，请先适配'; exit 1; }
backup="/root/openclash-watchdog-before-f50-dns-$(date +%Y%m%d-%H%M%S)-$$"
cp -p "$file" "$backup"
awk '
 /^## DNS/ {section=1}
 /^##Dler Cloud Checkin/ {section=0}
 section && index($0,"if [ \"$enable_redirect_dns\" = \"1\" ]; then") {
  print "   if [ \"$enable_redirect_dns\" = \"1\" ] && [ ! -d /tmp/f50dns-switch.lock ]; then"
  print "      # F50: respect the active AdGuard DNS chain."
  print "      f50_dns_port=$dns_port"
  print "      if pidof AdGuardHome >/dev/null && [ -x /usr/libexec/f50-dns-route ]; then f50_dns_port=5353; fi"
  next
 }
 section {gsub(/\$dns_port/,"$f50_dns_port")}
 {print}
' "$backup" > "$file"
sh -n "$file" || { cp -p "$backup" "$file"; exit 1; }
echo "DNS 守护补丁已安装；原脚本：$backup"
