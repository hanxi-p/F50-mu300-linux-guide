#!/bin/sh
# Run each bounded operation in its own process group; clean descendants too.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/opt/mu300/busybox-bin
limit=$1; shift
case "$limit" in ''|*[!0-9]*) exit 2;; esac
[ "$limit" -gt 0 ] || exit 2
worker=''; timer=''
cleanup() {
 [ -z "$timer" ] || /opt/mu300/bin/busybox kill -KILL "-$timer" 2>/dev/null
 # Give nested bounded helpers time to clean their own detached groups.
 trap '' TERM INT
 if [ -n "$worker" ] && /opt/mu300/bin/busybox kill -0 "-$worker" 2>/dev/null; then
  # Snapshot descendants before TERM: nested setsid helpers own separate groups.
  descendants=$(awk -v root="$worker" '
   { split(FILENAME,f,"/"); id=f[3]; sub(/^.*\) /,""); parent[id]=$2; tick[id]=$20 }
   END { for(id in parent) { p=id; n=0; while(p>1 && n++<64) {
    if(p==root) { print id, tick[id]; break } p=parent[p]
   } } }' /proc/[0-9]*/stat 2>/dev/null)
  /opt/mu300/bin/busybox kill -TERM "-$worker" 2>/dev/null
  sleep 3
  /opt/mu300/bin/busybox kill -KILL "-$worker" 2>/dev/null
  printf '%s\n' "$descendants" | while read -r child tick; do
   [ -n "$child" ] && [ -r "/proc/$child/stat" ] || continue
   current=$(sed 's/.*) //' "/proc/$child/stat" 2>/dev/null | awk '{print $20}')
   [ "$current" = "$tick" ] || continue
   /opt/mu300/bin/busybox kill -KILL "$child" 2>/dev/null
  done
 fi
}
trap cleanup EXIT
trap 'exit 143' TERM INT
/usr/bin/setsid "$@" &
worker=$!
/usr/bin/setsid sh -c 'sleep "$1"; /opt/mu300/bin/busybox kill -TERM "-$2" 2>/dev/null; sleep 5; /opt/mu300/bin/busybox kill -KILL "-$2" 2>/dev/null' sh "$limit" "$worker" &
timer=$!
wait "$worker"
code=$?
exit "$code"
