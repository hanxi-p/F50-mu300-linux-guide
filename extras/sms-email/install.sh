#!/bin/sh
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
umask 077
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || exit 1
[ "$#" = 5 ] || { echo 'Usage: install.sh FROM TO HOST PORT PRIVATE_PASSWORD_FILE'; exit 2; }
from=$1; to=$2; host=$3; port=$4; password_file=$5
for address in "$from" "$to"; do
 case "$address" in ''|*[!A-Za-z0-9@._+-]*) echo 'Invalid email address'; exit 2;; esac
 case "$address" in *@*.*) ;; *) exit 2;; esac
done
case "$host" in ''|*[!A-Za-z0-9.-]*) exit 2;; esac
[ "$port" = 465 ] || { echo 'This installer uses implicit TLS on port 465'; exit 2; }
[ -s "$password_file" ] || { echo 'Missing private authorization-code file'; exit 2; }
[ -x /opt/mu300/bin/busybox ] && [ -x /usr/bin/setsid ] || exit 1
for cmd in msmtp flock sha256sum; do command -v "$cmd" >/dev/null || { echo "Missing $cmd"; exit 1; }; done
grep -q 'SMS_FROM=.*SMS_DATE=.*SMS_TEXT=.*SMS_ID=' /opt/mu300/bin/mu300-sms || { echo 'SMS hook is not supported by this version'; exit 1; }
sha256sum -c SHA256SUMS >/dev/null
# Do not silently replace a user's unrelated hook.
if [ -e /etc/mu300/sms-hook ] && ! grep -q f50-sms-email /etc/mu300/sms-hook; then
 echo 'Existing SMS hook found; adapt it before installing this feature'; exit 1
fi
B=/root/f50-sms-email-backups/$(date +%Y%m%d-%H%M%S)-$$
mkdir -p "$B"
if [ -x /etc/init.d/f50-sms-email ] && /etc/init.d/f50-sms-email enabled; then echo 1 > "$B/enabled"; else echo 0 > "$B/enabled"; fi
if [ -x /etc/init.d/f50-sms-email ] && /etc/init.d/f50-sms-email running; then echo 1 > "$B/running"; else echo 0 > "$B/running"; fi
cat > "$B/paths" <<'PATHS'
/etc/mu300/sms-hook
/etc/mu300/sms-email/settings
/etc/mu300/sms-email/msmtprc
/etc/mu300/sms-email/smtp-password
/usr/libexec/f50-sms-email-enqueue
/usr/libexec/f50-sms-email-worker
/usr/libexec/f50-bounded
/etc/init.d/f50-sms-email
PATHS
while IFS= read -r p; do
 if [ -e "$p" ]; then mkdir -p "$B$(dirname "$p")"; cp -p "$p" "$B$p"; fi
done < "$B/paths"
cp restore.sh "$B/restore.sh"
[ ! -x /etc/init.d/f50-sms-email ] || /etc/init.d/f50-sms-email stop
D=/etc/mu300/sms-email
mkdir -p "$D/outbox" "$D/sent"
chmod 700 "$D" "$D/outbox" "$D/sent"
cp "$password_file" "$D/smtp-password"
printf "FROM='%s'\nTO='%s'\n" "$from" "$to" > "$D/settings"
cat > "$D/msmtprc" <<EOF
defaults
auth on
tls on
tls_starttls off
tls_trust_file /etc/ssl/certs/ca-certificates.crt
timeout 20
account f50
host $host
port $port
from $from
user $from
passwordeval "cat /etc/mu300/sms-email/smtp-password"
account default : f50
EOF
chmod 600 "$D/settings" "$D/msmtprc" "$D/smtp-password"
cp enqueue.sh /usr/libexec/f50-sms-email-enqueue
cp worker.sh /usr/libexec/f50-sms-email-worker
cp bounded.sh /usr/libexec/f50-bounded
cp service.sh /etc/init.d/f50-sms-email
printf '#!/bin/sh\nexec /usr/libexec/f50-bounded 20 /usr/libexec/f50-sms-email-enqueue\n' > /etc/mu300/sms-hook
chmod 700 /etc/mu300/sms-hook
chmod 755 /usr/libexec/f50-sms-email-enqueue /usr/libexec/f50-sms-email-worker /usr/libexec/f50-bounded /etc/init.d/f50-sms-email
for p in /etc/mu300/sms-hook /usr/libexec/f50-sms-email-enqueue /usr/libexec/f50-sms-email-worker /usr/libexec/f50-bounded /etc/init.d/f50-sms-email; do sh -n "$p"; done
sync
/etc/init.d/f50-sms-email enable
/etc/init.d/f50-sms-email start
echo "Installed. Restore: sh $B/restore.sh"
