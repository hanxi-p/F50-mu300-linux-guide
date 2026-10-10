#!/bin/sh
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
umask 077
D=/etc/mu300/sms-email
. "$D/settings"
pool=${POOL:-/etc/mu300/sms-pool}
first=$(cat "$D/first-id")
case "$first" in ''|*[!0-9]*) exit 1;; esac
for message in "$pool"/msg/[0-9]*; do
 [ -f "$message" ] || continue
 id=${message##*/}
 case "$id" in *[!0-9]*) continue;; esac
 n=$(printf '%s' "$id" | sed 's/^0*//')
 [ "${n:-0}" -ge "$first" ] || continue
 [ ! -s "$D/sent/$id" ] && [ ! -f "$D/outbox/$id.eml" ] || continue
 direction=$(sed '/^$/q' "$message" | sed -n 's/^dir: //p')
 [ "$direction" = mt ] || continue
 sender=$(sed '/^$/q' "$message" | sed -n 's/^from: //p')
 stamp=$(sed '/^$/q' "$message" | sed -n 's/^scts: //p')
 # Preserve trailing newlines; remove only store_msg's one appended newline.
 text=$(sed '1,/^$/d' "$message"; printf .)
 text=${text%.}; text=${text%?}
 SMS_ID="$id" SMS_FROM="$sender" SMS_DATE="$stamp" SMS_TEXT="$text" \
  /usr/libexec/f50-bounded 20 /usr/libexec/f50-sms-email-enqueue
done
