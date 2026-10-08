# 安装后优化：密码、SSH、后台、性能、管理与备份

本章从“OpenWrt 已能启动并登录”开始，把系统配置为日常使用的路由器。Windows 命令在电脑 PowerShell 执行，`sh` 命令在 F50 的 root SSH / 串口执行。安装主线已经完成时，直接从本章继续。

## 1. 开始前准备

- [ ] 保留 USB 管理连接，电脑网线继续连接主路由。
- [ ] 确认当前管理地址与 root 登录方式，准备自己选定的管理密码和 Wi-Fi 密码。
- [ ] 准备电脑 SSH 公钥和本地备份目录。
- [ ] 记录当前配置，修改前另存对应文件；涉及网络时保留当前管理会话。

当前初始地址通常为 `192.168.77.1`；下面以已按第 5 章改好的 `192.168.50.1` 为例。已有相同配置时直接核对，不重复生成密钥或追加 UCI 列表。

## 2. 设置自己的密码

### 2.1 路由器后台与 SSH 密码

在 F50 终端执行：

```sh
passwd
```

输入两次自己选定的新密码，输入过程不会显示字符。也可在 LuCI 的 **系统 → 管理权 → 路由器密码**中修改。保留当前会话，另开浏览器用 `root` 和新密码登录，确认后再关闭旧会话。

LuCI 与 SSH 密码登录使用同一 root 密码。作者 PowerShell 安装器使用安装时输入的密码；Magisk ZIP 新安装入口可能生成 12 位临时密码。长临时密码的读取方法见 [首次登录与密码修改](05-network-and-management.md#首次登录后修改管理密码)。

### 2.2 Wi-Fi 密码

LuCI **网络 → 无线 → AP 编辑 → 无线安全**中设置。Wi-Fi 密码与管理密码分别设置，修改 root 密码不会自动修改无线密码。

- [ ] 新管理密码能登录 LuCI。
- [ ] Wi-Fi 密码已单独设置，手机重新连接成功。
- [ ] 密码保存到本机私有材料，公开教程不包含自己的密码。

## 3. 配置电脑 SSH 密钥

在 Windows PowerShell 创建专用密钥；已有同名密钥时使用现有密钥，不覆盖：

```powershell
$F50Key = Join-Path $env:USERPROFILE '.ssh\id_ed25519_f50'
if (-not (Test-Path $F50Key)) {
  ssh-keygen -t ed25519 -f $F50Key -C 'f50-management'
}
Get-Content "$F50Key.pub"
```

将完整公钥一行添加到 LuCI **系统 → 管理权 → SSH 公钥**，保存。私钥留在电脑。私钥口令按自己的需要设置，使用 ssh-agent 可避免重复输入。

核对设备主机指纹后，在电脑连接：

```powershell
ssh -i $F50Key -o IdentitiesOnly=yes root@192.168.50.1
```

然后按 [SSH 密钥与 Host 配置](05-network-and-management.md#54-配置专用-ssh-密钥) 添加 `Host f50`。日常使用：

```powershell
ssh f50
```

- [ ] 公钥已导入，主机指纹已核对。
- [ ] `ssh f50` 能使用本机专用密钥登录。
- [ ] SSH 私钥与密码材料保存在本机。

## 4. 配置路由器后台和管理网络

### 4.1 地址与电脑联网顺序

管理页：[http://192.168.50.1/](http://192.168.50.1/)，用户名 `root`。如果仍是初始地址，先按 [管理地址更新](05-network-and-management.md#52-将管理地址更新为-192168501) 同步 UCI、`/etc/mu300/lan.conf` 和 USB 主机租约。

电脑网线负责互联网，F50 USB 负责管理。按 [USB 管理电脑的 DHCP 标签](05-network-and-management.md#53-电脑网线联网f50-usb-仅管理) 设置这台电脑不接收 F50 默认网关和 DNS。该设置作用于 USB 管理电脑，手机通过 F50 Wi-Fi 使用蜂窝网络。

### 4.2 后台与 SSH 端口

本次保留网页 HTTP 80、HTTPS 443、SSH 22。需要改端口时，按 [后台与 SSH 控制](11-daily-management.md#3-后台与-ssh-控制) 修改，先确认新端口能登录再关闭旧连接。后台用于管理网段，保留现有 WAN 入站防火墙策略。

### 4.3 无线名称、加密与租期

先保存无线配置：

```sh
cp -p /etc/config/wireless /root/wireless.before-change
uci show wireless | grep -E '=wifi-iface|=wifi-device|\.device='
```

核对本版本的 AP 节确实为 `ap0` 后，可以设置本文实操使用的名称：

```sh
uci set wireless.ap0.ssid='ZTE_f50'
uci commit wireless
wifi reload
```

无线安全使用本次恢复稳定的 **WPA2-PSK / AES（CCMP）**。加密或名称修改后出现手机连接失败时，按 Q&A 排查，保留 USB 管理连接；无线密码仍在 LuCI 本地输入。

DHCP 租期设置为 7 天，减少日常租约更新频率。先核对服务手机的 DHCP 节确实为 `lan`：

```sh
uci show dhcp.lan
uci set dhcp.lan.leasetime='168h'
uci commit dhcp
/etc/init.d/dnsmasq reload
```

已有租约在续租时使用新租期。长期固定地址用静态租约；延长租期不提高无线吞吐，也不能解决无线认证失败。

- [ ] LuCI 和 SSH 可用，电脑默认互联网出口仍是主路由网线。
- [ ] 无线名称、密码和加密方式已核对，手机能连接。
- [ ] DHCP 租期已保存，需要固定地址的客户端使用静态租约。

## 5. 路由器性能、温度与功耗

### 5.1 日常配置：动态调频与 5GHz 无线

本次保留 **5GHz、信道 36、80MHz 带宽**，CPU 使用作者工具的 `balanced` 模式，兼顾空闲时动态降频和有负载时的频率余量。频段、信道与国家代码按实际使用地和周围网络选择。

在 F50 执行：

```sh
/opt/mu300/bin/mu300-toolkit profile balanced
/etc/init.d/mu300-toolkit enable
/opt/mu300/bin/mu300-toolkit profile
```

作者工具保存选择，开机服务负责应用。查看负载、温度和频率：

```sh
/opt/mu300/bin/mu300-toolkit top
```

按 `q` 退出。设备已有该工具，可以先用它完成日常监控。

### 5.2 按场景选择省电模式

更重视温度和功耗时，可选：

```sh
/opt/mu300/bin/mu300-toolkit profile eco
```

`eco` 将 CPU 上限设到硬件最大频率约 60% 以内的可用档位，GPU 限到最低档；高吞吐代理和其他计算负载可能需要更高频率。恢复日常配置用 `profile balanced`。默认部署保留 balanced，eco 按自己的目标选择。

### 5.3 保留本机成立的网络配置

- 本机厂商 5.4 内核曾出现 firewall flowtable 兼容问题，软件 flow offload 保持关闭，具体修复见 Q&A。
- 蜂窝 WAN 有运营商提供的 IPv6 时保留；LAN 是否发送 IPv6 默认路由，按手机上网与电脑管理的实际安排配置。
- 国家代码按实际使用地区设置，操作见 Q&A；它不是任意增加无线功率的开关。
- 保留温控保护、原装屏蔽罩和导热结构，机身通风，远离其他热源。

本次诊断时 CPU 大部分时间空闲，温度传感器约 53–62°C，未触发温控降频。真实吞吐取决于蜂窝信号、运营商、无线环境和所用服务，软件负载与温度按自己的使用场景观察。实际瓦数使用 USB 电流表测量，驱动显示的 5V / 2A 是供电能力。

- [ ] balanced 设置与开机应用已保存。
- [ ] 能查看温度、频率、CPU 和内存占用。
- [ ] 调整前保存原配置；需要测速时先考虑蜂窝流量消耗。

## 6. 日常管理与软件维护

1. 核对时区、日期和 NTP，让日 / 月流量统计按正确时间累计。
2. 保留当前 release 与架构的软件源，普通包使用对应 APK 源。
3. MU300 系统更新使用作者的更新入口，先保存完整备份，再阅读目标版本说明。
4. 增加软件按实际需求选用，配置步骤由 [Q&A 可选扩展](08-troubleshooting.md#86-可选扩展) 进入。
5. 需要累计 SIM 流量时，由 Q&A 的流量统计条目配置蜂窝接口与 SD 持久数据库；统计从安装后开始，套餐扣费以运营商账单为准。

时间、软件源与系统更新命令见 [日常维护](11-daily-management.md)。本方案运行厂商 5.4 内核，不能把普通软件包更新当成内核升级，也不能直接加载其他内核版本的 kmod。

- [ ] 时间与软件源符合当前系统。
- [ ] 知道系统更新入口、蜂窝流量统计入口和扩展功能入口。
- [ ] 管理地址、SSH、Wi-Fi、调频选择和软件版本有本地记录。

## 7. 优化完成后重新备份

### 7.1 快速保存管理配置

完成 `ssh f50` 密钥配置后，在 Windows PowerShell 保存配置归档。二进制输出通过 cmd 重定向，保留原始字节：

```powershell
$BackupDir = Join-Path $env:USERPROFILE ('F50-backups\config-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Set-Location $BackupDir
cmd /d /c 'ssh -o BatchMode=yes f50 "tar -C /etc -czf - config dropbear mu300 passwd shadow" > management-config.tar.gz'
if ($LASTEXITCODE -ne 0) { throw '配置归档失败' }
Get-FileHash .\management-config.tar.gz -Algorithm SHA256
```

这份归档保存 UCI、SSH 主机密钥 / 授权公钥、MU300 配置和账号密码哈希；完整 SD 系统、扩展程序及其数据库使用下一步的完整备份保存。配置归档与完整备份均保存在本机私有目录。

### 7.2 保存最终系统与恢复资料

按 [完整备份与恢复](07-backup-and-restore.md) 保存 SD 持久文件系统、Android / Linux 启动数据与本机启动恢复资料，核对文件大小、SHA256 和归档成员。修改密码、无线、调频或增加软件后，再保存一份新的完整备份。

- [ ] 优化后的管理配置已归档。
- [ ] 最终系统已完整备份，位置与校验清单明确。
- [ ] Android ↔ OpenWrt 切换方法、恢复方法和各自管理地址已记录。

**完成标志：** 自己的密码与密钥可用，后台和手机连接正常，性能选择能开机应用，日常维护与恢复材料齐全。

## 8. 可选：首页美化与流量套餐面板

需要在手机上集中查看速率、套餐用量、温度与每个 CPU 核心时，进入 [可选首页优化](13-optional-dashboard.md)。按该章提示词准备依赖、备份并部署，完成浏览器验收后再保存最终系统备份。
