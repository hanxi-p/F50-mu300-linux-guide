#!/bin/sh
set -eu
. /etc/mu300/sms-email/settings
T=$(mktemp /tmp/f50-smtp-hello.XXXXXX)
trap 'rm -f "$T"' EXIT
trap 'exit 143' TERM INT
{
 printf 'From: F50 <%s>\r\nTo: %s\r\nSubject: =?UTF-8?B?5p2l6IeqRjUw5paw5L+h5oGv?=\r\n' "$FROM" "$TO"
 printf 'Date: %s\r\n' "$(date -R)"
 printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n'
} > "$T"
/usr/libexec/f50-bounded 45 /usr/bin/msmtp --file=/etc/mu300/sms-email/msmtprc --account=f50 "$TO" < "$T"
echo 'SMTP accepted hello. Check the recipient inbox and spam folder.'
