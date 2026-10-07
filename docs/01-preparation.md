# 1. 准备、网络顺序与接口识别

## 本次环境

- Windows 11 x64，PowerShell，Google Platform Tools。
- ZTE F50 / MU300，初始 Android B15，活动槽 b，约 64 GB 内置存储。
- 一张约 64 GB SD 卡，允许清空；最终 Linux 系统放在这张卡上。
- 电脑网线连接主路由；Wi-Fi 和 USB 连接 F50，避免 F50 的重启使电脑断网。

准备工具：Platform Tools、对应设备的 ADB 与 SPD 下载驱动、作者的解锁工具、官方 Magisk APK、mu300-linux。链接见 [CREDITS](../CREDITS.md)。不要把“装了 Platform Tools”等同于“驱动已匹配”。

原厂 F50 通常从 `http://192.168.0.1/` 登录，再在同一浏览器访问 `http://192.168.0.1/index.html#usb_port` 开启 USB 调试。网页设置、降级或解锁清空数据后要重新检查此开关。

## 三种接口不要混淆

| 接口 | 用途 | 检查方法 |
|---|---|---|
| USB 网卡 | 管理与上网 | `Get-NetAdapter` / 设备管理器 |
| ADB | Android shell、重启、Root 操作 | `adb devices` |
| SPD / U2S / BootROM | 底层备份、刷写、恢复 | 设备管理器 Ports 和下载工具 |

正常 Android 的 RNDIS、Linux 的 NCM、Linux 的 USB 串口也会是不同接口，端口号可随插拔变化。本机 BootROM 曾显示 `VID_1782&PID_4D00`；Linux NCM/串口曾显示 `VID_0525&PID_A4A1`。这是观察记录，不应把它们写成所有 F50 的固定 COM 号。

## 先安排电脑联网

```powershell
Get-NetAdapter
Get-NetIPInterface -AddressFamily IPv4
Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'
Find-NetRoute -RemoteIPAddress 1.1.1.1
```

Windows 比较的是路由 metric 与接口 metric 的组合。我们一度只设了网线接口 metric 为 5，但网线默认路由 metric 为 50，F50 新 USB 网卡却是 0 + 20，于是新网卡仍抢到了默认路由。不能只看其中一项。

有管理员权限时可调整接口 metric，但如果系统拒绝访问，不要宣称已修改成功。我们最终在 F50 中只对电脑 USB MAC 设置不提供默认网关/DNS的 DHCP 标签，保留同网段管理能力；见 [第 5 章](05-network-and-management.md)。

需要先设置联网优先级时，在管理员 PowerShell 按实际接口编号填写，不照抄其他电脑的编号：

```powershell
$MainEthernetIndex = [int](Read-Host '主路由网线接口 ifIndex')
$F50NetworkIndex = [int](Read-Host 'F50 Wi-Fi / USB 网络接口 ifIndex')
Set-NetIPInterface -InterfaceIndex $MainEthernetIndex -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 5
Set-NetIPInterface -InterfaceIndex $F50NetworkIndex -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 100
Find-NetRoute -RemoteIPAddress 1.1.1.1
```

这只是当前接口的 IPv4 调整，新枚举 USB 接口需重新核对。用上面的默认路由表检查总 metric，必要时对自己的 F50 默认路由调整 RouteMetric；不要删主路由网关。IPv6 出口另看第 5 章。

## 使用前的边界

- 写入启动程序、降级、解锁会改变设备状态；本次降级清空了用户数据，解锁也可能再次清空。
- 先拿到本机分区与校准数据备份，再动启动链；不能用别人的 NV、IMEI 或整机备份代替。
- 本教程的槽位、镜像与测试点来源于这台机器。不同容量和板型应重新确认。
- SD 卡格式化只针对确认过的卡，不应误操作电脑硬盘或 F50 内置 eMMC。
