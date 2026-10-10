#!/bin/sh /etc/rc.common
START=99
USE_PROCD=1
start_service() {
 procd_open_instance
 procd_set_param command /usr/libexec/f50-sms-email-worker
 procd_set_param respawn 3600 10 0
 procd_set_param term_timeout 10
 procd_close_instance
}
