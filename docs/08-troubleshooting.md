# 8. Q&A：安装排障与可选扩展

## 8.1 先识别当前系统 / 模式

| 当前模式 | 电脑常见接口 | 管理方式 | 不应误判 |
|---|---|---|---|
| Android 正常开机 | 原厂网络口，开启调试后 ADB | 原厂网页通常 192.168.0.1、ADB | 降级重置了调试开关不等于没驱动 |
| Fastboot | Android Bootloader 类接口 | fastboot / 支持 WebUSB 的浏览器 | ADB 消失属于正常切换 |
| BootROM / 下载 | SPD / U2S 类下载端口 | 匹配 FDL 的 spd_dump | 两白灯不是成功握手证据 |
| SD 原生 OpenWrt | NCM 网卡、USB 串口 | SSH、LuCI、串口 | 没有 ADB 属于正常现象 |

驱动属于不同接口，安装 SPD 驱动不能自动保证 Fastboot / ADB 正常。按新增接口的硬件 ID、名称和工具枚举核对，避免给主路由网卡换驱动。

## 8.2 安装问题速查

| 现象 | 本次原因 / 判断 | 处理与成功标志 |
|---|---|---|
| 电脑上网改走 F50，操作端断网 | 网线、Wi-Fi、USB 的默认路由竞争 | 网线 metric 优先，USB 管理租约不发网关 / DNS，同时检查 IPv6 默认路由 |
| USB 插着但工具等待 | 线材、接口、驱动、当前模式都可能影响 | 看设备枚举和握手；本次还采用断电后测试点接电 |
| 已让人短接插线，又要求立即回复 | 双手无法同时完成三项操作 | 先启动等待工具，给操作者窗口，由电脑检测握手 |
| 按复位 2 秒无反应 | 不等于完全断电或进入 BootROM | 换口没解决本次启动故障；最终用已确认测试点恢复 |
| 两白灯常亮、无 Wi-Fi | 曾因旧工程 U-Boot 不匹配无法启动 | 匹配工具恢复启动链；不继续叠加未知补丁 |
| patched trustos 读回正确但仍锁定 | 写入完成不等于解锁生效 | 成功路线使用正确工程 U-Boot、原始 SPL、subut 签名解锁 |
| flashing unlock 失败 / oem unlock unknown | 普通命令不支持该流程 | 按原始说明走浏览器 token / 签名流程 |
| 网页 Unlocked 后 ADB 无设备 | 重启 / 降级关闭 USB 调试 | 原厂 usb_port 页面重新开启，核对驱动和 adb devices |
| Magisk 文件 / 进程存在却 su 拒绝 | 旧 canary、stub 和 Shell 授权未完成 | 官方同版本修补与管理器，完成环境安装和授权，id 返回 uid=0 |
| Windows WinError 1314 | 无创建某些符号链接的权限 | 本次安装器 tar 后备导出成功；核对最终安装结果，不忽略真正导出失败 |
| USB NCM 出现但 SSH / 网页超时 | 厂商内核 flowtable 不兼容，fw4 没成功应用 | 串口关闭软件 flow_offloading，重启 firewall 后确认 br-lan 放行 |
| 改为 50.1 后仍是旧 IP | nohup 不存在，网络应用未运行；或旧 DHCP 租约 | 串口 / LuCI 应用，Windows 释放更新租约，三处地址同步 |
| USB DHCP 地址时有时无 | 曾添加同 MAC 的重复主机条目 | 使用现有 dhcp.mu300_usb 打标签，不建重复 host |
| Linux 下找不到 ADB | 当前运行原生 Linux | 用 SSH / 串口；切 Android 后才用 ADB |
| 重启早期 WAN=false | 蜂窝初始化晚于 USB 枚举 | 等待并观察日志，本次约一分钟内 WAN=true |
| 拔卡很久才回 Android | 原版找盘回退约 300 秒 | 需要立即切换时，在 Linux 选下次 Android 再重启；未改超时 |
| scp 提示 SFTP 缺失 | 路由器没 SFTP server | LuCI 上传 / wget / 原始字节传输，不用文本保存二进制 |
| 软件源写着 6.12，uname 却 5.4 | rootfs 包元数据和实际 boot kernel 不同 | 检查实际内核和内建能力，不加载别版 kmod |
| OpenClash 菜单有了但不代理 | 菜单不足以证明依赖 / 核心 / DNS / 规则有效 | 配置 -t、进程、透明 HTTPS、Fake-IP、nft 与重启都检查 |
| Ruby helper require open3 失败 | 某些标准库在包管理中分拆 | 装缺失库或不依赖该库；不把辅助脚本错误等同 Mihomo 故障 |
| 新地址 SSH 主机密钥警告 | 地址、known_hosts 或重装变动 | 核对真实主机指纹再更新，不全局关闭密钥校验 |

## 8.3 按安装阶段核对

主流程按准备、降级解锁、Root、SD 安装、管理配置与备份章节执行，完成标准见 [分阶段核对表](09-checklist.md)。上表用于遇到对应症状时查询；每个问题按实际接口、日志和配置定位。

## 8.4 继续下一阶段的前提

- 备份不完整 / 分区或板型不符：不降级。
- 下载哈希、刷写退出状态或读回不符：不解锁。
- Android 不能正常启动或锁状态未确认：不 Root / 安装 Linux。
- `su -c id` 没有 root：不运行写入安装器。
- 安装摘要的磁盘不是目标 SD：不输入 ERASE / INSTALL。
- 管理、根挂载、WAN 未完成确认：先查日志，不批量装插件。
- 新版本布局 / 选项不同：以作者该版本文档重新确认，不硬套本次参数。

## 8.5 具体解决方法

<a id="usb-management"></a>

### Q：USB 网卡出现但 SSH / LuCI 不通，怎么办？

USB 与串口已枚举而 SSH / LuCI 无响应时，可通过串口检查防火墙日志。若 `fw4` 报以下 flowtable 错误，按下方方法关闭软件流量卸载：

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

重新尝试 SSH 和 LuCI。成功标志是防火墙重启没有上述错误，规则包含 LAN / WAN 接口，并能登录。该设置调整软件 flow offloading，保留防火墙及 LAN / WAN 访问规则。

若串口也未出现，按第 8 章检查 USB 驱动、当前模式与启动日志。


### Q：工具一直等待，怎样配合短接插线？

先确认数据线、下载驱动与当前 USB 模式。需要 BootROM 时：设备断电 → 工具进入等待 → 已确认的测试点短接 → 插入 USB → 工具握手后松开。操作者负责双手短接插线，Codex 监测枚举与工具输出。详细步骤和 FDL 前缀见第 2 / 2A 章。

### Q：两颗白灯常亮、没有 Wi-Fi，怎样恢复？

检查是否识别 BootROM 下载接口。若来自工程 U-Boot 不匹配，使用本机原始启动链与匹配 FDL 恢复受影响分区，读回校验后确认 Android 正常启动，再使用第 0 章指定的配套工程文件继续。恢复前核对分区和已有备份；原始文件缺失时先补齐匹配资源。

### Q：Magisk 已装，但 su 仍返回拒绝？

确认使用同一官方版本的 APK 与本机对应 B09 修补镜像。投屏进入管理器，完成提示的环境安装并重启，在超级用户页面授权 Shell / com.android.shell，再执行 `adb shell su -c id`。返回 uid=0 后接着安装 SD OpenWrt。

### Q：修改地址后连不上，怎样接着做？

通过串口核对 `/etc/mu300/lan.conf`、UCI LAN 和 USB DHCP 主机地址，三处按第 5 章同步。通过串口 / LuCI 应用网络，Windows 释放并更新对应网卡租约，再连接 192.168.50.1。旧 SSH 会话中断时从新地址续接。

## 8.6 可选扩展

以下项目在 SD OpenWrt 和管理连接完成后按需执行，默认部署先交付可用系统与备份。

<a id="optional-openclash"></a>

### Q：可以安装 OpenClash 吗？（可选）

可以。本方案已完成 OpenClash 0.47.156 / ARM64 Mihomo v1.19.29 的安装、配置检查、DNS、透明 HTTPS 与重启自启检查。软件获取、核心安装与配置导入见 [OpenClash 可选安装附页](06-openclash.md)。使用自己的配置；节点数量和原路由器型号不影响安装流程。

### Q：怎样做性能优化？（可选）

先根据实际负载定位，再调整对应项。下面是调优路径，不属于默认安装参数，也不预设统一的提升百分比。

```sh
uptime
top
free -m
df -h /
logread | tail -n 80
```

| 观察到的需求 / 瓶颈 | 对应可选措施 | 检查方式 |
|---|---|---|
| 系统用途是随身路由 | 保持精简安装，GPU / VPN extra 和额外服务按需启用 | 软件包、进程和内存占用 |
| 开启代理后负载明显增加 | 按实际用途整理 providers、规则与定时更新，逐项比较所用核心和配置 | 同一网络 / 节点下对比 CPU、内存、响应与吞吐 |
| 信号或连接稳定性影响体验 | 检查蜂窝信号、摆放、数据线、供电和散热 | 蜂窝日志、连接连续性与设备状态 |
| SD 长期承载系统 | 使用可靠 SD，按需保留日志与下载数据，做好完整备份 | 卡空间、I/O 报错和重启恢复 |
| 想调整流量卸载 | 先检查当前内核、fw4 与代理兼容性；本文厂商 5.4 的 flowtable 报错分支采用关闭软件卸载 | 防火墙成功加载、管理连接和转发都正常 |

每次调整前另存配置，一次改变一个因素；达到自己的目标后保留该设置。OpenClash 可用选项参照 [作者说明](https://github.com/vernesong/OpenClash)。不要把“所有调优都打开”当成默认方案。

### Q：F50 蜂窝网络的 IPv6 怎么保留？（可选）

在 F50 上检查：

```sh
ip -6 addr show dev sipa_eth0
ip -6 route
ping -6 -c 3 2606:4700:4700::1111
uci show dhcp.lan
```

本次蜂窝口有全局 IPv6 地址、IPv6 默认路由，经蜂窝网络 ping6 无丢包。在运营商提供 IPv6 的情况下，可保留路由器与 OpenClash 的 IPv6 功能。

电脑继续走主路由网线的管理场景中，LAN 使用 DHCPv6 禁用、RA lifetime 为 0；蜂窝 WAN 与 OpenClash IPv6 / IPv6 DNS 保持启用。需要让 Wi-Fi 客户端通过 F50 使用原生 IPv6 时，根据运营商前缀和作者网络服务配置 LAN RA / DHCPv6，并检查客户端默认路由。

Windows 检查 IPv6 默认路由：

```powershell
Get-NetRoute -AddressFamily IPv6 -DestinationPrefix '::/0' |
  Format-Table InterfaceIndex,NextHop,RouteMetric
```

IPv4 优先级设置不会自动控制 IPv6 出口；不要只看一个协议的路由表判断“电脑已经走网线”。

### Q：换 16 GB 卡或者切回 Android 怎么操作？（可选）

当前系统容量需求用 16 GB 卡即可，换卡要保留 ext4 权限、属主与符号链接，方法见 [备份与换卡恢复](07-backup-and-restore.md#75-换到-16-gb-sd-卡)。系统切换使用 [第 4 章命令](04-sd-openwrt.md#46-系统切换)；拔卡先断电，原版无卡回退约 300 秒。

### Q：怎样修改 Wi-Fi 地区？（可选）

本版本 OpenWrt 日常 Wi-Fi 使用 UCI / LuCI 管理。在 **网络 → 无线 → 对应无线设备 → 高级设置 → 国家代码** 选择实际使用地点的地区，保存并应用；名称可能随 LuCI 语言变化。

先按日常配置页备份 `/etc/config/wireless`，确认无线设备节。本机为 `radio0`，示例命令在 USB SSH 上执行：

```sh
printf '输入实际使用地区的两位国家代码（例如 CN / SG）：'
read -r WIFI_COUNTRY
case "$WIFI_COUNTRY" in
  [A-Z][A-Z]) uci set wireless.radio0.country="$WIFI_COUNTRY" ;;
  *) echo '请核对两位国家代码'; return 1 2>/dev/null || exit 1 ;;
esac
uci commit wireless
wifi reload
iw reg get
iw phy phy0 info
```

核对 UCI 已保存国家代码，以及驱动实际显示的可用频段 / 信道。国家代码用于匹配使用地的信道与功率规则，实际效果取决于驱动与固件能力；不以随意换地区作为增大发射功率的默认优化。无线名称 / 密码见 [扫尾配置](11-daily-management.md#2-wi-fi-名称与密码)。

<a id="persistent-traffic"></a>

### Q：插 SIM 卡，怎样统计跨重启的总流量和月流量？（可选）

MU300 面板展示蜂窝接口的速率与 RX / TX 计数。需要按日、按月、累计并跨重启保留时，可以增加 **vnStat 2**，读取内核接口计数并把数据库保存到 SD 根文件系统。它支持日 / 月汇总和账期起始日，详见 [vnStat 作者介绍](https://humdi.net/vnstat/)。

这是根据上游软件与 OpenWrt 服务配置提供的可选部署步骤；本案例原安装未添加该服务。Codex 执行该选项时，先检查软件源包和接口，再保存安装后的检查结果。

#### 1. 确定蜂窝出口

```sh
ubus call network.interface.wan status
ip -s link show sipa_eth0
```

本方案蜂窝接口为 `sipa_eth0`，按当前 WAN 的实际 device / l3_device 确认。统计 RX + TX，包含经过这个接口的 IPv4 / IPv6 上下行；不把 `br-lan`、USB 管理口或代理 TUN 的计数再相加，避免重复计算。

#### 2. 安装对应包

软件源按日常配置页核对：

```sh
apk update
apk search -x vnstat2
apk add --simulate vnstat2
apk add vnstat2
vnstat --version
```

需要网页图表时，再检查并按需安装 `luci-app-vnstat2`；[LuCI 上游包](https://github.com/openwrt/luci/tree/master/applications/luci-app-vnstat2) 还依赖 vnstati2 等组件。CLI 汇总可以先独立使用。

#### 3. 持久化数据库

OpenWrt 的 `/var` 常在内存中，数据库明确保存到本方案 SD 根内的 `/root/traffic/vnstat`。先停止服务、备份配置：

```sh
/etc/init.d/vnstat stop
cp -p /etc/vnstat.conf /root/vnstat.conf.before-change
cp -p /etc/config/vnstat /root/vnstat.uci.before-change
mkdir -p /root/traffic/vnstat
```

修改 `/etc/vnstat.conf` 中对应项。以下去掉已有的活动定义后追加一组配置：

```sh
sed -i '/^[[:space:]]*DatabaseDir[[:space:]]/d; /^[[:space:]]*SaveInterval[[:space:]]/d; /^[[:space:]]*MonthRotate[[:space:]]/d' /etc/vnstat.conf
cat >> /etc/vnstat.conf <<'EOF'
DatabaseDir "/root/traffic/vnstat"
SaveInterval 1
MonthRotate 1
EOF
```

`SaveInterval 1` 为每分钟保存；`MonthRotate 1` 为自然月。套餐从每月 7 日开始时可改为 `MonthRotate 7`，该选项范围为 1—28，修改后影响后续归属、历史统计不重新计算。配置定义参见 [vnStat 配置手册](https://humdi.net/vnstat/man/vnstat.conf.html)。

若原数据库已有记录，先确认旧 DatabaseDir，再在服务停止时复制旧数据库到新目录。配置有 DaemonUser / DaemonGroup 时，应让该服务用户有目标目录的访问 / 写权限；本文 OpenWrt init 以 root 启动，按实际包配置核对。

#### 4. 注册蜂窝接口并开机启动

上游 OpenWrt 使用 `/etc/config/vnstat` 的 interface 列表，服务启动时初始化数据库并注册接口，见 [服务脚本](https://github.com/openwrt/packages/blob/master/net/vnstat2/files/vnstat.init)。核对该配置节后执行：

```sh
uci show vnstat
uci -q delete vnstat.@vnstat[0].interface
uci add_list vnstat.@vnstat[0].interface='sipa_eth0'
uci commit vnstat
/etc/init.d/vnstat enable
/etc/init.d/vnstat start
vnstat -i sipa_eth0
vnstat -i sipa_eth0 -d
vnstat -i sipa_eth0 -m
```

首次输出等待采样积累后查看。记录中应能看到 RX、TX、total、每日 / 每月与累计结果，数据库文件出现在持久目录。

#### 5. 统计范围与保存

- 统计起点是启用服务开始；套餐已使用的历史量从运营商查询，单独记录基线。
- OpenWrt 中运行才采集；切换 Android 期间的流量以原厂统计 / 运营商数据补充。
- 本地接口数据用于用量观察，套餐剩余和计费以运营商查询为准；流量单位也按 GB / GiB 区分。
- 换 SIM 时为新卡建立独立记录或数据库，避免把两张套餐混为一份月用量。
- 重启后核对累计量继续增长，完整 WRT 备份会保存 `/root/traffic/vnstat`；正常关机前停止服务可完成保存。

完成检查后，Codex 在交付中加入统计接口、数据库路径、账期起始日和查询命令。告警 / 超额限速可作为后续单独配置，不随统计服务默认阻断网络。

## 想让手机首页更紧凑，并直接设置流量套餐？

使用 [可选：首页美化与流量套餐面板](13-optional-dashboard.md)。保留锁频入口，将其他参数折叠，并加入本次 / 本月累计、持久化月度历史和六个快捷控制；配套脚本带原页面与配置备份、恢复入口。
