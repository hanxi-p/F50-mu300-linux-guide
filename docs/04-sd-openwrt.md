# 4. 安装 SD 卡原生 OpenWrt

## 为什么选择这条路线

OpenWrt 提供统一的路由管理、SSH、软件包与网络服务配置，适合把 F50 用作可扩展的蜂窝路由器。SD 路线将 Linux 根文件系统独立放在卡上，保留 Android 分区布局，支持原生启动与命令切换；日常使用直接进入 Linux。安装由 mu300-linux 完成本机资源提取、根文件系统部署与启动支持，按其配套版本操作。

## 开始前应满足

- Android B09 正常开机，Bootloader 属性已经确认解锁。
- `adb devices` 有设备，`adb shell su -c id` 返回 root。
- SD 卡已插入并允许格式化，知道它的实际容量。
- 本机校准 / NV 和原始启动链已独立备份。

SD 卡承载 Linux 根文件系统，内部 `boot_b` 与 `misc` 提供启动支持；Android 分区大小与内置 GPT 保持原有布局。

## 4.1 先只读检查

在 [第 0 章](00-files-and-workspace.md) 准备的 `mu300-linux` 目录中：

```powershell
adb devices
adb shell su -c id
.\install.ps1 -Check -Lang zh -NoSelfUpdate
```

检查输出中的 SD 卡容量、设备节点与存储选项，确认目标为准备好的卡；本流程选择 SD 存储。

卡容量、设备节点或布局不符时，先解决识别问题，再确认格式化目标。

## 4.2 明确选择 SD 和带面板 OpenWrt

```powershell
$env:MU300_STORAGE = 'sd'
$env:MU300_OPENWRT = 'luci'
.\install.ps1 -Lang zh -NoSelfUpdate -Release v2026.10.11
```

本次使用的交互选择：

| 项目 | 选择 |
|---|---|
| 安装系统 | OpenWrt |
| OpenWrt 类型 | `openwrt-luci`，带 MU300 面板 |
| 存储 | SD 卡 |
| Linux 默认启动 | 是 |
| 连续失败后返回 Android | 5 次 |
| Wi-Fi | 从 Android 导入原来的 SSID / 密码 |
| GPU extra | 不安装 |
| VPN extra | 不安装 |
| 内核 | 选项 1，厂商 5.4 |
| 格式化确认 | 核对卡后输入 `ERASE` |
| 管理密码 | 设置自己的管理密码并妥善保存 |
| 最终安装确认 | 核对写入摘要后输入 `INSTALL` |

安装器将目标 SD 卡作为 ext4 系统盘。16 GB 卡足够本指南的系统容量需求；按安装器支持的布局使用即可。

## 4.3 安装器做了什么

本次结果是：

- SD 第一分区 ext4，标签 `mu300sd`。
- 卡上包含 `.mu300/`、`boot/` 和 `openwrt-luci/`。
- 整理本机 Android/vendor 运行资源，供 Linux 系统使用。
- 生成 Linux `boot_b` 镜像，写入后校验。
- 更新 `misc` 的启动控制数据，安排 Linux 槽 b 启动。
- 部署 Android 的 Magisk 切换模块。

看到 `MU300-INSTALL-OK` 并完成镜像读回校验后，按 4.5 检查首次启动、管理连接与蜂窝网络。

## 4.4 Windows 的符号链接提示

若 Windows 输出以下符号链接提示：

```text
system/bin/linker64: [WinError 1314] 客户端没有所需的特权
```

安装器可通过 `windows-source.tar.gz` 保留这些条目。确认后备导出已完成、vendor 归档已生成，再检查最终安装结果；导出中止时先处理报错。

## 4.5 首次启动验证

安装器重启后，Windows 出现 NCM 网卡，初始管理地址是 `192.168.77.1`。

```powershell
ssh root@192.168.77.1
```

进入后检查：

```sh
cat /etc/openwrt_release
uname -r
df -h /
mount | grep mmcblk1
ubus call network.interface.wan status
mu300-next-boot status
```

本次：OpenWrt 25.12.5 / ARM64、内核 5.4.254，根文件系统来自 SD `/dev/mmcblk1p1`，WAN 最终 `up=true`，默认启动为 Linux，成功确认后的失败计数为 0。

还应打开 LuCI、确认 Wi-Fi 和做一次重启 / 完整断电启动。蜂窝 WAN 不一定和 USB 枚举同时就绪，我们的重启检查中早期 WAN 为 false，约一分钟内随后为 true。

## 4.6 系统切换

从 OpenWrt 的 SSH 终端去 Android：

```sh
mu300-next-boot android
reboot
```

Android 开启 USB 调试，电脑上返回 Linux：

```powershell
adb shell su -c mu300-linux
```

也可以使用作者 Magisk 模块的 Action。切换命令选择下次原生启动的系统。

插着有效 SD 卡、默认 Linux 时，正常重启和断电接电直接进入 Linux。拔卡要先关机 / 断电；没有卡且没有内置 Linux 时，当前项目约 300 秒后回退 Android。本指南使用原版回退超时。

切换后的管理地址也会变：Linux 使用本文设置的 `192.168.50.1`，Android B09 通常仍是它自己的原厂地址。按当前系统确认网页地址、管理接口和 ADB 状态。
