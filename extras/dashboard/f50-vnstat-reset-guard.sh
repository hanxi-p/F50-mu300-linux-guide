#!/bin/sh
set -eu
# A sanity ceiling for accounting, not a traffic shaper. F50 bearer AMBR is 1000 Mbps.
path=/etc/vnstat.conf
[ -r "$path" ] || exit 1
awk '!/^[[:space:]]*(MaxBWsipa_eth0|PollInterval|UpdateInterval|HourlyDays)[[:space:]]/' "$path" > "$path.f50-new"
printf '\nMaxBWsipa_eth0 1000\nPollInterval 2\nUpdateInterval 5\nHourlyDays 100\n' >> "$path.f50-new"
chmod 644 "$path.f50-new"
mv "$path.f50-new" "$path"
