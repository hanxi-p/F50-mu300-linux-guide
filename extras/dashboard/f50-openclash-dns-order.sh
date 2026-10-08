#!/bin/sh
set -eu
file=/etc/init.d/openclash
[ -f "$file" ] || exit 0
grep -q 'F50: reconcile after OpenClash writes DNS settings' "$file" && exit 0
grep -Fq 'change_dnsmasq "$enable_redirect_dns"' "$file" || { echo 'OpenClash 启动结构不同，请先人工适配 DNS 顺序'; exit 1; }
backup="/root/openclash-init-before-f50-dns-$(date +%Y%m%d-%H%M%S)-$$"
cp -p "$file" "$backup"
awk '{print; if(index($0,"change_dnsmasq \"$enable_redirect_dns\"")){print "      # F50: reconcile after OpenClash writes DNS settings.";print "      [ ! -x /usr/libexec/f50-dns-route ] || /usr/libexec/f50-dns-route 1"}}' "$backup" > "$file"
sh -n "$file" || { cp -p "$backup" "$file"; exit 1; }
echo "DNS 顺序补丁已安装；原启动脚本：$backup"
