#!/bin/sh
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
umask 077
D=/etc/mu300/sms-email
. "$D/settings"
id=${SMS_ID:-}
case "$id" in ''|*[!0-9A-Za-z_-]*) exit 2;; esac
[ ! -f "$D/sent/$id" ] || exit 0
[ ! -f "$D/outbox/$id.eml" ] || exit 0
temp=$(mktemp "$D/outbox/.new.XXXXXX")
trap 'rm -f "$temp"' EXIT
trap 'exit 143' TERM INT
subject=$(printf '%s' '来自F50新信息' | /opt/mu300/bin/busybox base64 | tr -d '\n')
{
 printf 'From: F50 <%s>\r\n' "$FROM"
 printf 'To: %s\r\n' "$TO"
 printf 'Subject: =?UTF-8?B?%s?=\r\n' "$subject"
 printf 'Date: %s\r\n' "$(date -R)"
 printf 'Message-ID: <f50-sms-%s-%s@163.com>\r\n' "$id" "$(date +%s)"
 printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
 printf '发送号码：%s\n\n短信原文：%s' "${SMS_FROM:-未知}" "${SMS_TEXT:-}" | /opt/mu300/bin/busybox base64 | sed 's/$/\r/'
} > "$temp"
chmod 600 "$temp"
mv "$temp" "$D/outbox/$id.eml"
sync "$D/outbox/$id.eml"
