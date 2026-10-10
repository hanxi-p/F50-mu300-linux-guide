# 1. 准备、网络顺序与接口识别

## 操作环境与硬件准备

本指南的主机环境是 **Windows 11 x64 + PowerShell 7**。Git 用于获取固定提交，Platform Tools 用于 Android / Fastboot，Chrome / Edge 用于 WebUSB 解锁。Windows 自带 tar / curl 可用于安装器；安装器还需要 Python 3 与 lz4，按其提示补齐。其他电脑系统使用作者对应安装入口，本文 PowerShell 命令按 Windows 环境执行。

- 用户准备能运行 Codex 的 Windows 11 x64 电脑；PowerShell 7、Git、Python / lz4、Platform Tools 等软件由 Codex 按第 0 章链接检查、下载和安装。
- ZTE F50 / MU300，初始 Android B15，活动槽 b，约 64 GB 内置存储。
- 一张允许清空的 SD 卡；16 GB 足够本文系统路线的容量需求，示例设备使用标称 64 GB 卡。
- 电脑网线连接主路由；Wi-Fi 和 USB 连接 F50，避免 F50 的重启使电脑断网。

### 硬件清单

| 准备项 | 要求 / 用途 |
|---|---|
| F50 / MU300 | 核对型号、PCB 与分区布局；保持可稳定供电 |
| 网线与有线网口 | 电脑连接能上互联网的主路由；无网口时使用可靠 USB 网卡 |
| USB 数据线 | 支持数据传输，电脑直连 F50；充电线不能用于 ADB / 下载 |
| SD 卡 | 允许格式化，16 GB 容量足够当前系统方案；示例使用标称 64 GB 卡 |
| SIM 卡 | 断电插入，已开通数据业务且有少量剩余流量；用于安装后蜂窝连接验证，不要求大流量套餐 |
| 本地磁盘空间 | 保存约 1 GB 的 B09 包、安装资源、本机分区备份与读回；至少预留数 GB，包含 userdata 时按实际容量增加 |
| 可选串口软件 | PuTTY 等，处理 USB 串口日志；对应波特率 115200 |
| 可选拆机 / 短接工具 | 正常下载路径不可用且需 BootROM 时使用，位置与 PCB 匹配 |

### 连接顺序与网络职责

```text
互联网 ── 主路由 ── 网线 ── 电脑
                            │
                            ├── USB 数据线 ── F50（刷写、ADB、SSH、串口）
                            └── Wi-Fi ─────── F50（原厂网页 / 热点管理，按需）
```

F50：断电插入目标 SD 卡与自己的 SIM 卡，再接电。降级、解锁、Root 和 SD 安装本身不依赖 SIM 卡；没有卡时可以先完成安装和 USB 管理，记录蜂窝检查待插卡后完成。

软件包、固件与规则文件优先在电脑通过主路由网线下载，再通过 USB 传给 F50。SIM 卡用于少量蜂窝连接、DNS 和网页请求；不自动跑测速、大文件下载或大量外网请求。小规模验证通常不需要很多流量，实际耗量还取决于手机与其他客户端的后台业务，验证期间控制连接设备和业务。

先接主路由网线并确认电脑能联网，再接 F50 USB；需要原厂网页时再连 F50 Wi-Fi。F50 的重启、断电与系统切换不应中断电脑的资源下载。实际 USB 线可同时供电；插拔由操作者完成，工具先等待连接。

### 开始前检查

1. 保存需要的 Android 用户文件与 SD 文件；降级会清空 userdata，安装会格式化确认后的目标 SD。
2. Codex 按第 0 章链接自动准备工具与配套文件，核对校验值、PowerShell 7 和 ADB / Fastboot 可执行路径。
3. 通过网卡名称与路由查询识别主路由网线、F50 Wi-Fi 和 F50 USB，记录实际接口编号。
4. 安装对应接口驱动，确认 USB 调试与 `adb devices`；下载模式 / Fastboot 的驱动按各阶段核对。
5. 先完成本机分区 / NV 备份，再进入写入阶段。

准备工具：Platform Tools、对应设备的 ADB 与 SPD 下载驱动、作者的解锁工具、官方 Magisk APK、mu300-linux。链接见 [CREDITS](../CREDITS.md)。不要把“装了 Platform Tools”等同于“驱动已匹配”。

原厂 F50 通常从 `http://192.168.0.1/` 登录，再在同一浏览器访问 `http://192.168.0.1/index.html#usb_port` 开启 USB 调试。网页设置、降级或解锁清空数据后要重新检查此开关。

## 三种接口不要混淆

| 接口 | 用途 | 检查方法 |
|---|---|---|
| USB 网卡 | 管理与上网 | `Get-NetAdapter` / 设备管理器 |
| ADB | Android shell、重启、Root 操作 | `adb devices` |
| SPD / U2S / BootROM | 底层备份、刷写、恢复 | 设备管理器 Ports 和下载工具 |

正常 Android 的 RNDIS、Linux 的 NCM、Linux 的 USB 串口也会是不同接口，端口号可随插拔变化。本机 BootROM 曾显示 `VID_1782&PID_4D00`；Linux NCM/串口曾显示 `VID_0525&PID_A4A1`。按当前设备枚举确认硬件 ID 与端口号。

## 先安排电脑联网

```powershell
Get-NetAdapter
Get-NetIPInterface -AddressFamily IPv4
Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'
Find-NetRoute -RemoteIPAddress 1.1.1.1
```

Windows 使用路由 metric 与接口 metric 的组合选择出口。例如网线 50 + 5、USB 0 + 20 时，USB 优先；调整后用路由查询确认互联网出口是主路由网线。

在管理员 PowerShell 中调整接口 metric，并检查命令返回结果。对电脑 USB 管理租约设置不发默认网关 / DNS 的 DHCP 标签，可保留直连管理而让网线继续负责互联网；见 [第 5 章](05-network-and-management.md)。

需要先设置联网优先级时，在管理员 PowerShell 按实际接口编号填写，不照抄其他电脑的编号：

```powershell
$MainEthernetIndex = [int](Read-Host '主路由网线接口 ifIndex')
$F50NetworkIndex = [int](Read-Host 'F50 Wi-Fi / USB 网络接口 ifIndex')
$F50MetricBackup = Join-Path $F50Work 'network-metric-before.json'
Get-NetIPInterface -InterfaceIndex $F50NetworkIndex -AddressFamily IPv4 |
  Select-Object InterfaceIndex,AutomaticMetric,InterfaceMetric |
  ConvertTo-Json | Set-Content $F50MetricBackup -Encoding utf8
Set-NetIPInterface -InterfaceIndex $MainEthernetIndex -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 5
Set-NetIPInterface -InterfaceIndex $F50NetworkIndex -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 100
Find-NetRoute -RemoteIPAddress 1.1.1.1
```

**如果这里选的是电脑共用 Wi-Fi 网卡，metric 会影响这个网卡连接的所有 SSID。** 仅在它连接 F50 时临时调整，先保存原 `AutomaticMetric` / `InterfaceMetric`，离开 F50 后恢复；不能把 Wi-Fi 网卡永久设为低优先级。USB 专用接口可以单独设置。

上方命令已在修改前保存原设置。离开 F50 后恢复（核对 ifIndex 仍属于同一网卡）：

```powershell
$MetricBefore = Get-Content $F50MetricBackup -Raw | ConvertFrom-Json
Set-NetIPInterface -InterfaceIndex $MetricBefore.InterfaceIndex -AddressFamily IPv4 `
  -AutomaticMetric $MetricBefore.AutomaticMetric -InterfaceMetric $MetricBefore.InterfaceMetric
```

以上针对当前接口的 IPv4，新枚举 USB 接口需重新核对。用上面的默认路由表检查总 metric，必要时对自己的 F50 默认路由调整 RouteMetric；不要删主路由网关。IPv6 出口另看第 5 章。

## 使用前的边界

- 写入启动程序、降级、解锁会改变设备状态；本次降级清空了用户数据，解锁也可能再次清空。
- 先拿到本机分区与校准数据备份，再动启动链；不能用别人的 NV、IMEI 或整机备份代替。
- 本教程的槽位、镜像与测试点来源于这台机器。不同容量和板型应重新确认。
- SD 卡格式化只针对确认过的卡，不应误操作电脑硬盘或 F50 内置 eMMC。
