# 8. 踩坑速查与操作顺序

## 8.1 先识别当前系统 / 模式

| 当前模式 | 电脑常见接口 | 管理方式 | 不应误判 |
|---|---|---|---|
| Android 正常开机 | 原厂网络口，开启调试后 ADB | 原厂网页通常 192.168.0.1、ADB | 降级重置了调试开关不等于没驱动 |
| Fastboot | Android Bootloader 类接口 | fastboot / 支持 WebUSB 的浏览器 | ADB 消失属于正常切换 |
| BootROM / 下载 | SPD / U2S 类下载端口 | 匹配 FDL 的 spd_dump | 两白灯不是成功握手证据 |
| SD 原生 OpenWrt | NCM 网卡、USB 串口 | SSH、LuCI、串口 | 没有 ADB 属于正常现象 |

驱动属于不同接口，安装 SPD 驱动不能自动保证 Fastboot / ADB 正常。按新增接口的硬件 ID、名称和工具枚举核对，避免给主路由网卡换驱动。

## 8.2 真实踩坑

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

## 8.3 本次完整顺序

1. 建立电脑 Ethernet 优先联网；确认 F50 网络和 USB 不抢互联网出口。
2. 查 USB 接口并安装匹配驱动；先做本机 B15 分区 / 启动链 / NV 备份。
3. 明确写 Android A 槽，降级 B09、清空 userdata，21 镜像读回匹配、固定 NV 核对。
4. 先前 trustos / 普通 fastboot / 旧工程 U-Boot 分支失败；通过 BootROM 恢复。
5. 按原始说明，用哈希已核对的 1,511,736 字节工程 U-Boot、保留原始 SPL，subut 成功解锁。
6. Android 启动属性独立确认 unlocked，重新开启 USB 调试。
7. 官方 Magisk 30.7 修补本机 B09 boot_a，安装管理器、补全环境、授权 Shell，su id 返回 root。
8. 固定 mu300-linux 提交与 Release，先 Check，再选择 SD、openwrt-luci、厂商 5.4、默认 Linux。
9. 核对目标卡后 ERASE，核对写入摘要后 INSTALL，安装器写 boot_b 和启动控制并读回。
10. Linux 首次 USB 出现但管理不通，经串口定位 fw4 / flowtable，关闭软件 flow offloading 后恢复。
11. 地址更新为 192.168.50.1，同步 LAN 配置 / USB 租约；设置专用 SSH 密钥。
12. 确认蜂窝 IPv6；保留电脑 Ethernet 联网安排，不误说所有 LAN IPv6 都已配置。
13. 安装 OpenClash / ARM64 Mihomo，从自己的 CR6609 迁移选定配置、providers 与列表。
14. 检查配置、透明代理、DNS、IPv6 和开机自启；冷启动 / 重启检查成功。
15. 保存整个 SD 持久文件系统、相关 boot / 启动链 / 分区表，校验哈希，恢复 OpenClash 服务。

这份时间线保留失败事实，但推荐执行顺序是第 0 至第 7 章。不要把失败分支也照着全部再执行一次。

## 8.4 每个阶段的停止条件

- 备份不完整 / 分区或板型不符：不降级。
- 下载哈希、刷写退出状态或读回不符：不解锁。
- Android 不能正常启动或锁状态未确认：不 Root / 安装 Linux。
- `su -c id` 没有 root：不运行写入安装器。
- 安装摘要的磁盘不是目标 SD：不输入 ERASE / INSTALL。
- 管理、根挂载、WAN 未完成确认：先查日志，不批量装插件。
- 新版本布局 / 选项不同：以作者该版本文档重新确认，不硬套本次参数。
