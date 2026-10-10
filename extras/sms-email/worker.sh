#!/bin/sh
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
umask 077
D=/etc/mu300/sms-email
. "$D/settings"
exec 9>/run/f50-sms-email.flock
flock -n 9 || exit 0
trap 'exit 143' TERM INT
while :; do
 delay=10
 for mail in "$D"/outbox/*.eml; do
  [ -f "$mail" ] || continue
  id=${mail##*/}; id=${id%.eml}
  if [ -s "$D/sent/$id" ]; then rm -f "$mail"; continue; fi
  if /usr/libexec/f50-bounded 45 /usr/bin/msmtp --file="$D/msmtprc" --account=f50 "$TO" < "$mail" >/run/f50-sms-email-error 2>&1; then
   if date -Iseconds > "$D/sent/$id.new" && sync "$D/sent/$id.new" && mv "$D/sent/$id.new" "$D/sent/$id" && sync "$D/sent"; then
    rm -f "$mail"
    printf 'sent %s %s\n' "$id" "$(date -Iseconds)" > /run/f50-sms-email-status
    logger -t f50-sms-email "Mail accepted by SMTP; message id=$id"
   else
    logger -t f50-sms-email "SMTP accepted, but recording failed; retaining queued mail; message id=$id"
    delay=60
    break
   fi
  else
   printf 'retry %s %s\n' "$id" "$(date -Iseconds)" > /run/f50-sms-email-status
   logger -t f50-sms-email "SMTP send failed; queued for retry; message id=$id"
   delay=60
   break
  fi
 done
 sleep "$delay"
done
