# 扫尾与日常配置：更新、Wi-Fi、后台和 SSH

SD OpenWrt 首次启动与管理连接完成后，按本页整理日常配置。命令在 F50 的 root SSH / 串口运行；涉及网络重载时，优先保留 USB 管理连接。

按顺序完成密码、密钥、后台、性能和备份时，使用 [安装后优化章节](10a-post-install-optimization.md)；本页保留管理端口、时间、软件源和系统更新的详细命令。

## 1. 安装后的扫尾顺序

1. 核对 OpenWrt、运行内核、SD 根挂载、蜂窝 WAN 与 `mu300-next-boot status`。
2. 按第 5 章设置管理地址 192.168.50.1，并同步电脑 USB 租约与 MU300 LAN 配置。
3. 运行 `passwd` 设置自己的 root 密码，导入电脑 SSH 公钥并确认 `ssh f50`。
4. 设置 Wi-Fi 名称 / 密码，重新连接客户端，验证 USB / Wi-Fi 两种管理方式。
5. 核对时区、日期和 NTP，再需要时配置套餐周期流量统计。
6. 检查软件源与系统更新入口，保存配置 / 完整备份。
7. 做一次重启与断电接电核对，交付管理、切换和备份信息。

## 2. Wi-Fi 名称与密码

此版本首次开机从 `/etc/mu300/hotspot.conf` 导入 Wi-Fi，生成 `/etc/config/wireless` 后由 UCI / LuCI 管理。日常修改走 **网络 → 无线 → 对应 AP → 编辑**，设置 SSID、无线安全中的密码，保存并应用。

先通过 USB SSH 另存无线配置，确认实际 AP 节与无线设备：

```sh
cp -p /etc/config/wireless /root/wireless.before-change
uci show wireless | grep -E '=wifi-iface|=wifi-device|\.device='
```

本版本示例为 `wireless.ap0` / `wireless.radio0`。核对后修改 SSID：

```sh
uci set wireless.ap0.ssid='F50-OpenWrt'
uci commit wireless
wifi reload
```

无线密码在 LuCI 页面本地输入，避免写入共享命令日志。Wi-Fi 客户端会断开，按新名称 / 密码重新连接；USB 管理地址保持原配置。无需删除 `wifi-configured` 或重复执行初始导入脚本。

## 3. 后台与 SSH 控制

后台地址与 SSH 主机地址由 LAN IP 决定，修改方法见第 5 章。默认网页访问 `http://192.168.50.1/`，SSH `ssh f50`；登录密码用 `passwd` 修改，SSH 公钥在 LuCI 系统 → 管理权中管理。

### 可选：改 SSH 端口

保留当前会话并另存配置，确认现有 Dropbear 节：

```sh
cp -p /etc/config/dropbear /root/dropbear.before-change
uci show dropbear
uci set dropbear.@dropbear[0].Port='2222'
uci commit dropbear
/etc/init.d/dropbear restart
```

电脑用 `ssh -p 2222 root@192.168.50.1` 建立新连接，成功后在 Host f50 中添加 `Port 2222`。若有多个 Dropbear 实例，按实际监听 LAN 的节修改。新端口登录确认后再关闭旧会话。

### 可选：改网页 HTTP 端口

默认监听项通常为 `0.0.0.0:80` 和 `[::]:80`，先看实际配置：

```sh
cp -p /etc/config/uhttpd /root/uhttpd.before-change
uci show uhttpd.main
```

确认后，以 8080 为例替换对应 HTTP 监听项：

```sh
uci -q del_list uhttpd.main.listen_http='0.0.0.0:80'
uci -q del_list uhttpd.main.listen_http='[::]:80'
uci add_list uhttpd.main.listen_http='0.0.0.0:8080'
uci add_list uhttpd.main.listen_http='[::]:8080'
uci commit uhttpd
/etc/init.d/uhttpd restart
```

访问 `http://192.168.50.1:8080/`。HTTP 与 HTTPS 监听分开管理，HTTPS 保留当前配置。后台 / SSH 用于管理网段，WAN 入站继续按防火墙策略控制；改端口不需要开放蜂窝公网管理。

## 4. 时区与日期

LuCI 系统 → 系统，选择实际使用地区的时区并核对日期，启用时间同步。命令检查：

```sh
date
uci get system.@system[0].zonename
uci get system.@system[0].timezone
```

时间正确后再按套餐账期统计每日 / 每月流量，避免月份边界错位。

## 5. 软件包更新源

本方案使用 **OpenWrt 25.12.5 / aarch64_generic 的 APK 软件源**。先保存原文件：

```sh
cp -a /etc/apk/repositories.d /root/repositories.before-change
cat /etc/openwrt_release
uname -r
cat /etc/apk/repositories.d/distfeeds.list
```

本机备份核对到的普通包源包括：

```text
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/base/packages.adb
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/luci/packages.adb
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/packages/packages.adb
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/routing/packages.adb
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/telephony/packages.adb
https://downloads.openwrt.org/releases/25.12.5/packages/aarch64_generic/video/packages.adb
```

保留安装器已有的目标平台 / kmod 源条目，不用上面这段替换整个文件。若改镜像站，只替换提供同版本完整目录的下载主机，保留 release、架构与签名校验；改完运行：

```sh
apk update
apk search -x vnstat2
apk add --simulate vnstat2
```

确认索引获取成功、候选架构和依赖符合当前系统，再安装所需包。rootfs 元数据与运行厂商 5.4 内核不同，涉及 kmod 先核对内建能力 / 匹配支持；不把软件源换成 snapshot 或其他 release 来凑依赖。

第三方源放 `/etc/apk/repositories.d/customfeeds.list`，按该软件作者的 APK 签名与架构说明配置。扩展软件的固定本地 APK 获取方法由 Q&A 进入对应附页，不需要为一个插件替换整个 OpenWrt 源。

## 6. MU300 系统更新

软件包索引刷新和整套系统升级是两个入口。MU300 的 rootfs / kernel / boot 更新使用作者工具；先完整备份，阅读目标 Release，再检查更新：

```sh
mu300-update check
```

决定升级后，按 [作者更新说明](https://github.com/dikeckaan/mu300-linux#readme) 使用：

```sh
mu300-update apply
```

完成后按工具提示重启，重新核对 SD 根、管理地址、Wi-Fi、蜂窝与所装扩展。作者提供 `mu300-update rollback` 与 `rollback-boot` 对应系统 / 启动回退，先看当前版本帮助再使用。默认部署固定本文版本，系统升级作为后续维护动作；不通过批量 `apk upgrade` 代替 MU300 的启动系统更新。

## 7. 可选配置入口

- [Q&A](08-troubleshooting.md)：按具体需求查询扩展功能与调优。
- [完整备份 / 换卡](07-backup-and-restore.md)：文件系统归档、启动恢复数据、ext4 权限。
- [系统切换](04-sd-openwrt.md#46-系统切换)：OpenWrt 去 Android、Android 回 Linux。
