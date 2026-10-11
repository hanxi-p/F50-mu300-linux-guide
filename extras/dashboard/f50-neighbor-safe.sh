#!/bin/sh
set -eu
file=/www/luci-static/resources/mu300/common.js
[ -r "$file" ] || exit 1
grep -q 'F50: sanitize transient neighbor entries' "$file" && exit 0
grep -Fq 'var nb = (c && c.neigh) || [];' "$file" || { echo 'Unknown neighborRows layout; refused patch'; exit 1; }
mkdir -p /root/f50-neighbor-backups
[ -e /root/f50-neighbor-backups/common.js.original ] || cp -p "$file" /root/f50-neighbor-backups/common.js.original
awk '
 index($0,"var nb = (c && c.neigh) || [];") {
  print "\t// F50: sanitize transient neighbor entries without mutating cache."
  print "\tvar nb = (c && Array.isArray(c.neigh) ? c.neigh : []).filter(function(n){return n && typeof n === '\''object'\'' && ['\''nr'\'','\''lte'\''].indexOf(n.rat)>=0;}).map(function(n){var row=Object.assign({},n);['\''rsrp'\'','\''rsrq'\'','\''sinr'\''].forEach(function(k){row[k]=n[k]!=null && Number.isFinite(Number(n[k]))?Number(n[k]):null;});return row;});"
  next
 }
 {print}
' "$file" > "$file.f50-new"
cat "$file.f50-new" > "$file"
rm -f "$file.f50-new"
