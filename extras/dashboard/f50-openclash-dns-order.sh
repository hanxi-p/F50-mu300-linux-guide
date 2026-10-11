#!/bin/sh
set -eu
file=/etc/init.d/openclash
[ -f "$file" ] || exit 0
# Migrate older synchronous hooks: firewall4 may inherit a blocked SIGCHLD.
custom=/etc/openclash/custom/openclash_custom_firewall_rules.sh
if [ -f "$custom" ] && grep -q '/usr/libexec/f50-dns-route auto' "$custom"; then
 cp -p "$custom" "$custom.f50-before-deferred"
 sed -i 's@/usr/libexec/f50-dns-route auto@touch /tmp/f50-dns-recheck@' "$custom"
fi
if grep -q 'F50: choose AdGuard before committing' "$file"; then
 sed -i 's@\[ ! -x /usr/libexec/f50-dns-route \] || /usr/libexec/f50-dns-route 1@touch /tmp/f50-dns-recheck@' "$file"
 exit 0
fi
grep -Fq 'change_dnsmasq "$enable_redirect_dns"' "$file" || { echo 'OpenClash 启动结构不同，请先人工适配 DNS 顺序'; exit 1; }
backup="/root/openclash-init-before-f50-dns-$(date +%Y%m%d-%H%M%S)-$$"
cp -p "$file" "$backup"
reconcile=1
grep -q 'F50: reconcile after OpenClash writes DNS settings' "$backup" && reconcile=0
awk -v reconcile="$reconcile" '
 index($0,"uci -q add_list dhcp.@dnsmasq[0].server=127.0.0.1#\"$dns_port\"") {
  print "      # F50: choose AdGuard before committing, avoiding a bypass window."
  print "      if pidof AdGuardHome >/dev/null && [ -x /usr/libexec/f50-dns-route ]; then"
  print "         uci -q add_list dhcp.@dnsmasq[0].server=127.0.0.1#5353"
  print "      else"; print $0; print "      fi"; next
 }
 {print; if(reconcile && index($0,"change_dnsmasq \"$enable_redirect_dns\"")){print "      # F50: reconcile after OpenClash writes DNS settings.";print "      touch /tmp/f50-dns-recheck"}}
' "$backup" > "$file"
sh -n "$file" || { cp -p "$backup" "$file"; exit 1; }
echo "DNS 顺序补丁已安装；原启动脚本：$backup"
