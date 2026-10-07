# 5. 管理连接、地址更新与 SSH

本章中 PowerShell 命令在电脑执行，`sh` 命令在 F50 的 SSH / 串口终端执行。不要在 Windows 直接运行 `uci`。初始地址 `192.168.77.1`，完成后为 `192.168.50.1`。

## 5.1 建立管理连接

Windows 中确认 NCM 网卡已取得 F50 的管理网段地址，再连接初始地址：

```powershell
Get-NetAdapter | Format-Table ifIndex,Name,InterfaceDescription,Status
Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceIndex,IPAddress,PrefixLength
Test-NetConnection 192.168.77.1 -Port 22
ssh root@192.168.77.1
```

使用安装时设置的密码登录，打开 http://192.168.77.1/ 确认 LuCI 可用。连接超时时，查询 [Q&A：USB 网卡出现但管理不通](08-troubleshooting.md#usb-management)。

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

**通过串口执行** `/etc/init.d/network restart`，或在 LuCI 中应用网络更改。网络重启会中断旧地址的 SSH，USB 网卡 / 串口也可能重新枚举；应用后重新获取 USB 租约，用新地址连接。

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

适用场景：电脑接主路由网线保持互联网，同时连 F50 管理。准备阶段的接口 metric 仍须保留。更可靠的方法是让 F50 对这台 USB 管理电脑不发默认网关和 DNS，但保留直连网段地址。

使用安装器已经生成的 `dhcp.mu300_usb` 主机条目，在其上打标签，不新建重复 MAC 条目：

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

预期 F50 USB 没有默认网关，电脑默认互联网出口为主路由网线；直连 `192.168.50.0/24` 仍走 F50 USB。F50 本身继续使用蜂窝网络，其他 Wi-Fi 客户端保持各自的路由设置。

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

之后 `ssh f50` 应能登录。先验证密钥登录，再按需调整密码认证。重装后按可信渠道核对新主机指纹，更新对应 known_hosts 条目。

## 5.5 完成配置后核对

用新地址登录 SSH 与 LuCI，确认电脑默认互联网出口仍为主路由网线。检查 SD 根挂载、蜂窝 WAN 与启动状态，再按第 4 章使用系统切换命令、按第 7 章保存完整备份。

需要调整 IPv6 LAN 使用场景时，查询 Q&A 的可选网络配置。
