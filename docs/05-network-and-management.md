# 5. 管理连接、地址更新、SSH 和 IPv6

本章中 PowerShell 命令在电脑执行，`sh` 命令在 F50 的 SSH / 串口终端执行。不要在 Windows 直接运行 `uci`。初始地址 `192.168.77.1`，完成后为 `192.168.50.1`。

## 5.1 USB 网卡出现，但 SSH 和网页不通

先核对 Windows 网卡状态、IPv4 地址和到管理地址的路由，不把“没有 ADB”当成 Linux 没启动。Linux 使用 NCM 网络与串口，Android ADB 不应出现在这个阶段。

```powershell
Get-NetAdapter | Format-Table ifIndex,Name,InterfaceDescription,Status
Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceIndex,IPAddress,PrefixLength
Test-NetConnection 192.168.77.1 -Port 22
```

本次 USB 和串口已经枚举，但 SSH、LuCI 都无响应。通过 USB 串口检查发现 Linux 正常启动，`fw4` 生成 flowtable 时遇到厂商内核兼容问题：

```text
Resource busy: flowtable ft
No such file or directory: flow offload @ft
The rendered ruleset contains errors, not doing firewall restart.
```

结果是早期 USB 防火墙规则仍在，正常 `br-lan` 管理放行未完成。处理如下：

1. 在设备管理器找到这次新增的 USB 串口，不固定照抄我们当时的 COM5。
2. 使用 PuTTY 等串口工具，115200 波特、8 数据位、无校验、1 停止位、无流控。
3. 连接后按一次 Enter，等待 `askfirst` 控制台进入 shell。
4. 执行以下命令。

```sh
logread | tail -n 100
uci get firewall.@defaults[0].flow_offloading
uci set firewall.@defaults[0].flow_offloading=0
uci commit firewall
/etc/init.d/firewall restart
nft list ruleset | grep -E 'br-lan|sipa_eth0'
```

重新尝试 SSH 和 LuCI。成功标志是防火墙重启没有上述错误，规则包含 LAN / WAN 接口，并能登录。我们关闭的是软件 flow offloading，没有关闭防火墙；不用清空整个 nft ruleset。

若串口也未出现，回到启动日志、USB 驱动和第 8 章排查，不能凭这一条错误假设所有设备都是同一原因。

## 5.2 将管理地址更新为 192.168.50.1

先确认电脑主路由和其他已连接网络没有使用 `192.168.50.0/24`。地址冲突时换其他网段，下面所有相关地址也要一起换。

在原地址登录 F50，先备份相关配置：

```sh
mkdir -p /root/address-change-backup
cp -p /etc/config/network /etc/config/dhcp /root/address-change-backup/
cp -p /etc/mu300/lan.conf /root/address-change-backup/lan.conf
cat /etc/mu300/lan.conf
uci show dhcp.mu300_usb
```

作者的 `lan.conf` 也要同步，避免只改 UCI、后续生成配置又恢复旧地址。本次该文件已有一行 `LAN_IP=`，确认后执行：

```sh
sed -i 's/^LAN_IP=.*/LAN_IP=192.168.50.1/' /etc/mu300/lan.conf
uci set network.lan.ipaddr='192.168.50.1'
uci set dhcp.mu300_usb.ip='192.168.50.200'
uci commit network
uci commit dhcp
grep '^LAN_IP=' /etc/mu300/lan.conf
uci get network.lan.ipaddr
uci get dhcp.mu300_usb.ip
```

预期依次是 `LAN_IP=192.168.50.1`、`192.168.50.1`、`192.168.50.200`。若本版本没有 `dhcp.mu300_usb`，先查看 `uci show dhcp` 找到实际 USB 主机条目，不凭空新建同 MAC 的第二个条目。

**通过串口执行** `/etc/init.d/network restart`，或在 LuCI 中应用网络更改。网络重启会中断旧地址的 SSH，USB 网卡 / 串口也可能重新枚举；这是本次实际发生的现象。不要依赖旧 SSH 会话继续返回结果。我们的 BusyBox 没有 `nohup`，使用 `nohup ... &` 会根本没有完成应用。

Windows 中找到 F50 USB 网卡的实际名称，更新 DHCP 租约：

```powershell
$F50UsbName = Read-Host '输入 F50 USB 网卡名称（从 Get-NetAdapter 确认）'
ipconfig /release "$F50UsbName"
ipconfig /renew "$F50UsbName"
Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias,IPAddress
Test-NetConnection 192.168.50.1 -Port 22
ssh root@192.168.50.1
```

网页：[http://192.168.50.1/](http://192.168.50.1/)。只更改 OpenWrt 地址；Android 原厂管理地址仍通常为 `192.168.0.1`，系统切换后要访问对应地址。

## 5.3 电脑网线联网，F50 USB 仅管理

适用于本次场景：电脑接主路由网线保持互联网，同时连 F50 管理。准备阶段的接口 metric 仍须保留。更可靠的方法是让 F50 对这台 USB 管理电脑不发默认网关和 DNS，但保留直连网段地址。

我们使用安装器已经生成的 `dhcp.mu300_usb` 主机条目，在其上打标签，不新建重复 MAC 条目：

```sh
uci show dhcp.mu300_usb
uci set dhcp.mu300_usb.tag='pc_usb_management'
uci set dhcp.pc_usb_management='tag'
uci add_list dhcp.pc_usb_management.dhcp_option='3'
uci add_list dhcp.pc_usb_management.dhcp_option='6'
uci commit dhcp
/etc/init.d/dnsmasq restart
```

DHCP 选项 3 / 6 的空值表示不向该标签客户端发路由 / DNS。**这是首次设置命令**；重复执行前检查 `uci show dhcp.pc_usb_management`，不要不断追加重复列表。重新释放 / 更新电脑 USB 租约，再检查：

```powershell
Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' |
  Format-Table InterfaceIndex,NextHop,RouteMetric
Get-NetIPInterface -AddressFamily IPv4 |
  Format-Table InterfaceIndex,InterfaceAlias,InterfaceMetric
```

预期 F50 USB 没有默认网关，电脑默认互联网出口为主路由网线；直连 `192.168.50.0/24` 仍走 F50 USB。这不影响路由器本身使用蜂窝流量，也不要求普通 Wi-Fi 客户端停用路由器。

## 5.4 配置专用 SSH 密钥

在 Windows PowerShell 生成自己电脑的专用密钥：

```powershell
$F50Key = Join-Path $env:USERPROFILE '.ssh\id_ed25519_f50'
ssh-keygen -t ed25519 -f $F50Key -C 'f50-management'
Get-Content "$F50Key.pub"
```

私钥可设置口令并配合 ssh-agent；若选择空口令，任何能读到私钥的人都能以其权限登录。不要覆盖现有同名密钥。将显示的**完整公钥一行**添加到 LuCI 的系统 → 管理权 → SSH 公钥页面，保存；不是把私钥上传。

也可在已经登录的 F50 终端执行：

```sh
mkdir -p /etc/dropbear
chmod 700 /etc/dropbear
vi /etc/dropbear/authorized_keys
chmod 600 /etc/dropbear/authorized_keys
```

编辑器中追加自己刚生成的公钥，保留已有正确条目。电脑第一次连接时核对 F50 主机指纹，接受后写入自己的 known_hosts。可在可信串口中用 `dropbearkey -y -f /etc/dropbear/dropbear_ed25519_host_key` 查看对应指纹（先核对实际主机密钥文件）。

```powershell
ssh -i $F50Key -o IdentitiesOnly=yes root@192.168.50.1
```

在 `%USERPROFILE%\.ssh\config` 中添加以下内容，把 `<你的Windows用户名>` 替换成实际用户名；路径含空格时保留引号：

```sshconfig
Host f50
    HostName 192.168.50.1
    User root
    IdentityFile "C:/Users/<你的Windows用户名>/.ssh/id_ed25519_f50"
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    ServerAliveInterval 30
```

之后 `ssh f50` 应能登录。先核对密钥登录再调整密码认证；本次没有要求关闭密码登录。重装后主机密钥变化要先确认原因和新指纹，不能把 `StrictHostKeyChecking no` 当作修复。

## 5.5 IPv6 是存在的，但分清 WAN 与 LAN

在 F50 上检查：

```sh
ip -6 addr show dev sipa_eth0
ip -6 route
ping -6 -c 3 2606:4700:4700::1111
uci show dhcp.lan
```

本次蜂窝口有全局 IPv6 地址、IPv6 默认路由，经蜂窝网络 ping6 无丢包。说明 F50 流量网络支持 IPv6，不能因为电脑没用 IPv6 就把路由器 IPv6 全关。

但是为避免电脑改走 F50，本次保留了 LAN DHCPv6 禁用、RA lifetime 为 0 的配置。OpenClash IPv6 与 IPv6 DNS 已打开；这**不等于所有 LAN 客户端都已获得可用 IPv6 默认路由**。要把 F50 当主路由供 Wi-Fi 客户端原生 IPv6 使用，需单独根据蜂窝前缀、作者网络服务和运营商限制配置 LAN RA / DHCPv6，并检查电脑是否因此选择 F50 出口。

Windows 检查 IPv6 默认路由：

```powershell
Get-NetRoute -AddressFamily IPv6 -DestinationPrefix '::/0' |
  Format-Table InterfaceIndex,NextHop,RouteMetric
```

IPv4 优先级设置不会自动控制 IPv6 出口；不要只看一个协议的路由表判断“电脑已经走网线”。
