#!/bin/sh
set -eu
B=$(cd "$(dirname "$0")" && pwd)
[ -f "$B/paths" ] || { echo 'Run the restore.sh copied to the installation backup directory'; exit 1; }
[ ! -x /etc/init.d/f50-sms-email ] || { /etc/init.d/f50-sms-email stop; /etc/init.d/f50-sms-email disable; }
while IFS= read -r p; do
 if [ -e "$B$p" ]; then cp -p "$B$p" "$p"; else rm -f "$p"; fi
done < "$B/paths"
sync
if [ -x /etc/init.d/f50-sms-email ]; then
 [ "$(cat "$B/enabled")" != 1 ] || /etc/init.d/f50-sms-email enable
 [ "$(cat "$B/running")" != 1 ] || /etc/init.d/f50-sms-email start
fi
echo 'Previous files and service state restored; outbox and sent records retained.'
