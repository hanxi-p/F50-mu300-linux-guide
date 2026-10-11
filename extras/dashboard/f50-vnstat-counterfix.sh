#!/bin/sh
# F50 aarch64 vnStat 2.13: counter decrease is a reset, never a 32-bit wrap.
# Refuse all other builds. Source-equivalent patch: vnstat-counter-reset.patch.
set -eu
original=7eca0a8d4d07f7c01c1703a096afde01e133d73c963b2a58e2a035ffeda219a9
fixed=436b3a8dd8efe250d21a908ba6ab36a70872832285d3a70dffeb2ddcf3507026
target=/usr/sbin/vnstatd
hash=$(sha256sum "$target" | awk '{print $1}')
[ "$hash" != "$fixed" ] || { echo 'vnStat counter reset fix already installed'; exit 0; }
[ "$hash" = "$original" ] || { echo 'Unsupported vnstatd build; refusing to patch'; exit 1; }
[ "$(uname -m)" = aarch64 ] || exit 1
backup=/usr/sbin/vnstatd.f50-original
if [ -e "$backup" ]; then
 [ "$(sha256sum "$backup" | awk '{print $1}')" = "$original" ] || exit 1
else
 cp -p "$target" "$backup"
fi
tmp=/usr/sbin/vnstatd.f50-new
trap 'rm -f "$tmp"' EXIT
cp -p "$target" "$tmp"
# 0x408644: mov x0,#0; b 0x408638 (the existing stack restoration).
printf '\000\000\200\322\374\377\377\027' | dd of="$tmp" bs=1 seek=34372 conv=notrunc 2>/dev/null
[ "$(sha256sum "$tmp" | awk '{print $1}')" = "$fixed" ] || exit 1
chmod 755 "$tmp"
mv "$tmp" "$target"
echo 'vnStat counter reset fix installed; restart vnstat to activate'
