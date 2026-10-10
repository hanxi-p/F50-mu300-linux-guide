#!/bin/sh
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
umask 077
D=/etc/mu300/sms-email
. "$D/settings"
R=/run/f50-sms-email-retry
mkdir -p "$R"
exec 9>/run/f50-sms-email.flock
flock -n 9 || exit 0
child=''
cleanup() {
 trap '' TERM INT
 if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; fi
}
trap cleanup EXIT
trap 'exit 143' TERM INT
ticks() { cut -d. -f1 /proc/uptime; }
last_reconcile=-60
while :; do
 now=$(ticks)
 if [ $((now-last_reconcile)) -ge 60 ]; then
  /usr/libexec/f50-bounded 15 /usr/libexec/f50-sms-email-reconcile >/dev/null 2>&1 & child=$!
  wait "$child"; child=''
  last_reconcile=$now
 fi
 attempts=0
 for mail in "$D"/outbox/*.eml; do
  [ -f "$mail" ] || continue
  id=${mail##*/}; id=${id%.eml}
  if [ -s "$D/sent/$id" ]; then rm -f "$mail"; continue; fi
  due=$(cat "$R/$id" 2>/dev/null || echo 0)
  case "$due" in ''|*[!0-9]*) due=0;; esac
  [ "$(ticks)" -ge "$due" ] || continue
  /usr/libexec/f50-bounded 45 /usr/bin/msmtp --file="$D/msmtprc" --account=f50 "$TO" < "$mail" >/run/f50-sms-email-error 2>&1 & child=$!
  wait "$child"; code=$?; child=''
  if [ "$code" = 0 ]; then
   if date -Iseconds > "$D/sent/$id.new" && sync "$D/sent/$id.new" && mv "$D/sent/$id.new" "$D/sent/$id" && sync "$D/sent"; then
    rm -f "$mail" "$R/$id"
    printf 'sent %s %s\n' "$id" "$(date -Iseconds)" > /run/f50-sms-email-status
    logger -t f50-sms-email "Mail accepted by SMTP; message id=$id"
   else
    printf '%s\n' $(( $(ticks)+60 )) > "$R/$id"
    logger -t f50-sms-email "SMTP accepted, but recording failed; retaining queued mail; message id=$id"
   fi
  else
   printf '%s\n' $(( $(ticks)+60 )) > "$R/$id"
   printf 'retry %s %s\n' "$id" "$(date -Iseconds)" > /run/f50-sms-email-status
   logger -t f50-sms-email "SMTP send failed; queued for retry; message id=$id"
  fi
  attempts=$((attempts+1)); [ "$attempts" -lt 10 ] || break
 done
 sleep 10
done
