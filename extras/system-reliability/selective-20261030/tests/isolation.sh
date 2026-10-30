#!/bin/sh
set -eu
BASE=/tmp/f50-selective-check-20261030
C=$BASE/candidate
T=$BASE/fixture
mkdir -p "$T/bin" "$T/root/proc" "$T/root/run/mu300/led" "$T/root/sys/class/thermal/thermal_zone0" "$T/root/sys/class/power_supply/fg" "$T/root/sys/class/leds/sc27xx:blue" "$T/root/sys/class/leds/sc27xx:green" "$T/root/sys/class/leds/sc27xx:red" "$T/root/sys/class/leds/keyboard-backlight" "$T/bundle/modules"
for f in "$C"/*; do sh -n "$f"; done
export MU300_SYSROOT=$T/root MU300_BIN=$T/bin MU300_LED_CONF=$T/led.conf
export PATH=$T/bin:$PATH
export CHECK_LOG=$T/actions CHECK_DEVICE=f50 CHECK_EVENTS='0 tick'
cat > "$T/bin/mu300-device" <<'EOF'
#!/bin/sh
echo "${CHECK_DEVICE:-f50}"
EOF
cat > "$T/bin/mu300-led" <<'EOF'
#!/bin/sh
echo "led $*" >> "$CHECK_LOG"
[ "$1" != sleep ] || rm -f "$MU300_SYSROOT/run/mu300/led/.awake-until"
EOF
cat > "$T/bin/mu300-keys" <<'EOF'
#!/bin/sh
printf '%s\n' "$CHECK_EVENTS"
EOF
for name in poweroff systemctl logger mu300-wifi-band wifi ubus; do
    printf '#!/bin/sh\necho "%s $*" >> "$CHECK_LOG"\n' "$name" > "$T/bin/$name"
done
chmod 755 "$T/bin/"*
for name in sc27xx:blue sc27xx:green sc27xx:red keyboard-backlight; do
    echo 127 > "$T/root/sys/class/leds/$name/max_brightness"
    echo 0 > "$T/root/sys/class/leds/$name/brightness"
    echo none > "$T/root/sys/class/leds/$name/trigger"
done
echo '100.5 0.0' > "$T/root/proc/uptime"
sed -n '/^modules_complete() {/,/^}/p' "$C/mu300-update" > "$T/module-check.sh"
. "$T/module-check.sh"
passed=0
ok() { passed=$((passed+1)); }
for round in 1 2 3; do
    # Full installed LED command against fake sysfs, including live settings and invalid deadline.
    echo LED_TIMEOUT=0 > "$MU300_LED_CONF"
    sh "$C/mu300-led" data on
    [ "$(cat "$T/root/sys/class/leds/sc27xx:blue/brightness")" = 127 ]; ok
    sh "$C/mu300-led" wifi on
    [ "$(cat "$T/root/sys/class/leds/keyboard-backlight/brightness")" = 48 ]; ok
    sh "$C/mu300-led" sleep --if-due
    [ "$(cat "$T/root/sys/class/leds/keyboard-backlight/brightness")" = 48 ]; ok
    printf 'LED_TIMEOUT=bad\nLED_TIMEOUT=20\n' > "$MU300_LED_CONF"
    echo 120 > "$T/root/run/mu300/led/.awake-until"
    sh "$C/mu300-led" sleep --if-due
    [ -f "$T/root/run/mu300/led/.awake-until" ]; ok
    echo 90 > "$T/root/run/mu300/led/.awake-until"
    sh "$C/mu300-led" sleep --if-due
    [ ! -e "$T/root/run/mu300/led/.awake-until" ]; ok
    sh "$C/mu300-led" wake
    [ "$(cat "$T/root/run/mu300/led/.awake-until")" = 120 ]; ok
    echo bad > "$T/root/run/mu300/led/.awake-until"
    sh "$C/mu300-led" sleep --if-due
    [ ! -e "$T/root/run/mu300/led/.awake-until" ]; ok

    # Actual buttons script; helpers cannot touch hardware. No helper called on no-op ticks.
    echo LED_TIMEOUT=0 > "$MU300_LED_CONF"; : > "$CHECK_LOG"
    sh "$C/mu300-buttons"
    [ ! -s "$CHECK_LOG" ]; ok
    echo LED_TIMEOUT=20 > "$MU300_LED_CONF"
    echo 120 > "$T/root/run/mu300/led/.awake-until"; : > "$CHECK_LOG"
    sh "$C/mu300-buttons"
    [ ! -s "$CHECK_LOG" ]; ok
    echo 90 > "$T/root/run/mu300/led/.awake-until"; : > "$CHECK_LOG"
    CHECK_EVENTS="$(printf '0 tick\n0 tick')" sh "$C/mu300-buttons"
    [ "$(grep -c '^led sleep --if-due$' "$CHECK_LOG")" = 1 ]; ok
    : > "$CHECK_LOG"
    CHECK_EVENTS='116 short' sh "$C/mu300-buttons"
    grep -qx 'led wake' "$CHECK_LOG"; ok
    : > "$CHECK_LOG"
    CHECK_EVENTS='138 short' sh "$C/mu300-buttons"
    grep -qx 'mu300-wifi-band toggle' "$CHECK_LOG"; ok
    : > "$CHECK_LOG"
    CHECK_EVENTS='116 long' sh "$C/mu300-buttons"
    grep -qx 'poweroff ' "$CHECK_LOG"; ok

    # Kernel trip points mean watch-only, even for a critical mocked temperature.
    echo 105000 > "$T/root/sys/class/thermal/thermal_zone0/trip_point_0_temp"
    echo 106000 > "$T/root/sys/class/thermal/thermal_zone0/temp"
    echo Battery > "$T/root/sys/class/power_supply/fg/type"
    echo 750 > "$T/root/sys/class/power_supply/fg/temp"
    rm -f "$T/root/run/mu300/thermal-alarm"; : > "$CHECK_LOG"
    sh "$C/thermal-guard" > /dev/null
    grep -qx 'led alarm on' "$CHECK_LOG"
    ! grep -q '^poweroff' "$CHECK_LOG"; ok
    echo bad > "$T/root/sys/class/thermal/thermal_zone0/temp"; : > "$CHECK_LOG"
    sh "$C/thermal-guard" > /dev/null
    [ -f "$T/root/run/mu300/thermal-alarm" ] && [ ! -s "$CHECK_LOG" ]; ok
    echo 65000 > "$T/root/sys/class/thermal/thermal_zone0/temp"; : > "$CHECK_LOG"
    sh "$C/thermal-guard" > /dev/null
    [ ! -f "$T/root/run/mu300/thermal-alarm" ]
    grep -qx 'led alarm off' "$CHECK_LOG"; ok
    # Phantom F50 fuel gauge must not activate a battery alarm.
    : > "$CHECK_LOG"; sh "$C/thermal-guard" > /dev/null
    [ ! -s "$CHECK_LOG" ]; ok
    CHECK_DEVICE=u30air sh "$C/thermal-guard" > /dev/null
    [ -f "$T/root/run/mu300/thermal-alarm" ]; ok
    echo 400 > "$T/root/sys/class/power_supply/fg/temp"
    CHECK_DEVICE=u30air sh "$C/thermal-guard" > /dev/null
    [ ! -f "$T/root/run/mu300/thermal-alarm" ]; ok
    # Missing all sensors also must retain the alarm rather than claiming cool.
    : > "$T/root/run/mu300/thermal-alarm"
    rm -f "$T/root/sys/class/thermal/thermal_zone0/temp"; : > "$CHECK_LOG"
    sh "$C/thermal-guard" > /dev/null
    [ -f "$T/root/run/mu300/thermal-alarm" ] && [ ! -s "$CHECK_LOG" ]; ok

    # Module names, count, empty/extra/missing files, release metadata and repeated checks.
    echo 5.4-test > "$T/bundle/kernel.release"
    printf './kernel.release\n./modules/a.ko\n./modules/b.ko\n' > "$T/list"
    echo a > "$T/bundle/modules/a.ko"; echo b > "$T/bundle/modules/b.ko"
    modules_complete "$T/bundle" "$T/list"; modules_complete "$T/bundle" "$T/list"; ok
    : > "$T/bundle/modules/b.ko"
    ! modules_complete "$T/bundle" "$T/list"; ok
    rm "$T/bundle/modules/b.ko"
    ! modules_complete "$T/bundle" "$T/list"; ok
    echo wrong > "$T/bundle/modules/c.ko"
    ! modules_complete "$T/bundle" "$T/list"; ok
    echo b > "$T/bundle/modules/b.ko"
    ! modules_complete "$T/bundle" "$T/list"; ok
    rm "$T/bundle/modules/c.ko"
    : > "$T/bundle/kernel.release"
    ! modules_complete "$T/bundle" "$T/list"; ok
    echo 5.4-test > "$T/bundle/kernel.release"
    printf './modules/../a.ko\n' > "$T/list"
    ! modules_complete "$T/bundle" "$T/list"; ok
done
# TERM regression: a real blocking key-reader stand-in must not survive service stop.
cp "$T/bin/mu300-keys" "$T/keys-finite"
cat > "$T/bin/mu300-keys" <<'EOF'
#!/bin/sh
echo $$ > "$MU300_SYSROOT/key-reader.pid"
exec sleep 1000
EOF
for round in 1 2 3; do
    rm -f "$T/root/key-reader.pid"
    sh "$C/mu300-buttons" & parent=$!
    n=0
    while [ ! -s "$T/root/key-reader.pid" ]; do sleep 1; n=$((n+1)); [ "$n" -lt 20 ]; done
    reader=$(cat "$T/root/key-reader.pid")
    kill -TERM "$parent"
    wait "$parent" 2>/dev/null || [ "$?" = 143 ]
    sleep 1
    ! kill -0 "$reader" 2>/dev/null; ok
done
cp "$T/keys-finite" "$T/bin/mu300-keys"
# Read-only verification that BusyBox supports the bounded commands. No recorder/flash execution.
logread -l 1 >/dev/null
dmesg -s 1000000 >/dev/null
printf 'PASS: %s assertions in three rounds; five shell syntax checks.\n' "$passed"
