# 可选附页：安装 OpenClash 并导入自己的配置

从 [Q&A 可选扩展](08-troubleshooting.md#optional-openclash) 进入本页。先完成 SD、WAN、防火墙和管理连接检查。本章 `sh` 命令都在 F50 上运行，不在 Windows 运行。OpenWrt 的 APK 软件包与 Android 的 APK 是不同格式。

## 6.1 固定版本与内核

本次 OpenWrt 25.12.5 / aarch64_generic，OpenClash 0.47.156，Mihomo linux-arm64 v1.19.29，实际运行厂商内核 5.4.254。

资源来自 [OpenClash Releases](https://github.com/vernesong/OpenClash/releases)、[Mihomo v1.19.29](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.29)。检查：

```sh
uname -m
uname -r
cat /etc/openwrt_release
df -h /
command -v apk
```

rootfs 软件源的 kernel 元数据为 6.12.94，运行内核以 `uname -r` 为准。本文依赖的 TUN / TPROXY 等功能由厂商 5.4 内核内建实现；软件包中的 6.12 kmod 文件不参与这套运行路径。

```sh
zcat /proc/config.gz | grep -E 'CONFIG_(TUN|NFT_TPROXY|NFT_SOCKET|NF_CT_NETLINK|INET_DIAG)='
```

本次相关项为 `y`。其他构建没有内建这些功能时，应寻找匹配内核的支持；不能强装别的版本 kmod，也不使用 `--force-broken-world`。

## 6.2 下载、哈希校验

```sh
cd /root
wget -O luci-app-openclash-0.47.156.apk \
  https://github.com/vernesong/OpenClash/releases/download/v0.47.156/luci-app-openclash-0.47.156.apk
wget -O mihomo-linux-arm64-v1.19.29.gz \
  https://github.com/MetaCubeX/mihomo/releases/download/v1.19.29/mihomo-linux-arm64-v1.19.29.gz
sha256sum luci-app-openclash-0.47.156.apk mihomo-linux-arm64-v1.19.29.gz
```

应分别为：

```text
1e4f330fc654e0270ac9cfa762af221335567d9b89388219890e8a7745b914ab
9a868b5e4e0ad91d9d71e1b41b0cfce78aaba44360c30df74a723f8e3926a86c
```

下载 404、HTML 或哈希不匹配时停止，从对应 Release 的 Assets 核对文件名。

## 6.3 安装

```sh
apk update
apk add --simulate --allow-untrusted /root/luci-app-openclash-0.47.156.apk luci-compat
```

检查计划，不应替换我们的启动内核或批量升级整个系统。`--allow-untrusted` 用于已由你核对来源和哈希的第三方本地包。

```sh
apk add --allow-untrusted /root/luci-app-openclash-0.47.156.apk luci-compat
mkdir -p /etc/openclash/core
gzip -dc /root/mihomo-linux-arm64-v1.19.29.gz > /etc/openclash/core/clash_meta
chmod 755 /etc/openclash/core/clash_meta
ln -sf /etc/openclash/core/clash_meta /etc/openclash/clash
/etc/openclash/core/clash_meta -v
```

安装会补齐 LuCI 兼容层、dnsmasq-full 等依赖；dnsmasq-full 提供 nftset / conntrack 支持。安装出错先处理空间、软件源或依赖，不马上启动插件。

没有 SFTP server 的设备会使现代 scp 默认传输失败。使用 LuCI 上传、路由器 wget 或保持原始字节的工具；不通过 PowerShell `Out-File` 保存二进制。

## 6.4 导入自己的配置

选择自己可用的 Clash / Mihomo 配置，另存为 `f50-reference.yaml`。已有 OpenClash 路由器配置也可迁移，按下列步骤处理配置文件与 providers。

1. LuCI → 服务 → OpenClash → 配置管理，上传自己的 YAML。
2. 一起迁移被引用的 rule-provider / proxy-provider 和列表数据，核对相对路径。
3. 迁移配置 YAML、providers 与列表数据；保留 F50 自己的网络、DHCP 与防火墙设置，自定义脚本另行核对接口和架构。
4. 选择 Meta 核心、Fake-IP、rule 模式，开启 IPv6 / IPv6 DNS 与 UDP 代理。
5. 初次暂停订阅自动覆盖，检查节点和策略组，确定测试的配置没有被定时任务替换。

主要 UCI 设置如下，文件名不同要同步更改：

```sh
uci set openclash.config.core_type='Meta'
uci set openclash.config.enable_meta_core='1'
uci set openclash.config.config_path='/etc/openclash/config/f50-reference.yaml'
uci set openclash.config.en_mode='fake-ip'
uci set openclash.config.operation_mode='fake-ip'
uci set openclash.config.proxy_mode='rule'
uci set openclash.config.ipv6_enable='1'
uci set openclash.config.ipv6_dns='1'
uci set openclash.config.enable_udp_proxy='1'
uci set openclash.config.disable_udp_quic='1'
uci commit openclash
```

更新插件后选项名可能变化，优先核对当前页面实际保存的设置。

## 6.5 启动、验证、重启检查

```sh
/etc/openclash/core/clash_meta -t -d /etc/openclash \
  -f /etc/openclash/config/f50-reference.yaml
```

源配置检查成功再启动：

```sh
mkdir -p /etc/crontabs
touch /etc/crontabs/root
/etc/init.d/cron enable
/etc/init.d/cron start
uci set openclash.config.enable='1'
uci commit openclash
/etc/init.d/openclash enable
/etc/init.d/openclash start
pgrep -af clash_meta
tail -n 60 /tmp/openclash.log
nft list ruleset | grep -Ei 'openclash|tproxy'
nslookup www.google.com 127.0.0.1
curl -I --max-time 30 https://www.google.com/generate_204
```

`touch` 会补建缺失的 crontab 文件，并保留已有内容。首次生成配置 / 下载数据需要时间；日志可能含私有资源，不原样公开。

本次 DNS 返回 `198.18.*.*` Fake-IP，透明 HTTPS 的 generate_204 返回 204，nft 中有 IPv4 / IPv6 代理和 DNS 重定向。Mixed 端口 7893 使用自动生成的认证；无认证访问失败不能直接判断核心故障。

最后在页面选择可用节点、查看规则命中，重启一次，再检查 SSH、WAN、进程、DNS 与透明 HTTPS。我们的重启结果全部恢复，蜂窝 IPv6 可用，Linux 失败计数为 0。完成这些检查后，确认代理功能和开机自启可用。

入口：[OpenClash](http://192.168.50.1/cgi-bin/luci/admin/services/openclash)。未登录时拒绝访问属于正常鉴权。插件已完成我们的功能检查，性能、温度和移动流量消耗取决于实际负载。
