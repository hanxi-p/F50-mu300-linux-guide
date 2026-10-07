# 4. 安装 SD 卡原生 OpenWrt

## 开始前应满足

- Android B09 正常开机，Bootloader 属性已经确认解锁。
- `adb devices` 有设备，`adb shell su -c id` 返回 root。
- SD 卡已插入并允许格式化，知道它的实际容量。
- 本机校准 / NV 和原始启动链已独立备份。

SD 卡是 Linux 根文件系统，内部启动槽仍负责把它启动起来。本次没有改 Android 内部分区大小，但不能描述成“内部存储完全不动”。

## 4.1 先只读检查

在 [第 0 章](00-files-and-workspace.md) 准备的 `mu300-linux` 目录中：

```powershell
adb devices
adb shell su -c id
.\install.ps1 -Check -Lang zh -NoSelfUpdate
```

本机输出相当于：内置约 58.2 GiB、Android 分区后有约 32.4 GiB 空闲、SD 卡约 58.2 GiB。我们选择了 SD，不使用内置空闲区域，也不缩小 userdata。

如果只读检查的卡容量、设备节点或内部布局与你理解的不一致，先处理识别问题。读到卡不等于允许格式化任意磁盘。

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
| VPN extra | 不安装；之后另装 OpenClash |
| 内核 | 选项 1，厂商 5.4 |
| 格式化确认 | 核对卡后输入 `ERASE` |
| 管理密码 | 自己设置并妥善保存，本文不提供我们的实际密码 |
| 最终安装确认 | 核对写入摘要后输入 `INSTALL` |

没有手工切成 1 GiB 分区：本次整张卡作为 ext4 系统盘，系统文件最初只占约 108 MiB。容量够用和安装器支持的分区布局是两件事，不需要为了缩小系统占用重新设计它的 SD 检测逻辑。

## 4.3 安装器做了什么

本次结果是：

- SD 第一分区 ext4，标签 `mu300sd`。
- 卡上包含 `.mu300/`、`boot/` 和 `openwrt-luci/`。
- 自己设备中的 Android/vendor 运行资源被整理到系统，而不是取别人的校准数据。
- 生成 Linux `boot_b` 镜像，写入后校验。
- 更新 `misc` 的启动控制数据，安排 Linux 槽 b 启动。
- 部署 Android 的 Magisk 切换模块。

输出中需要看到 `MU300-INSTALL-OK`，同时核对镜像读回结果。它证明写入阶段完成，尚不能单独证明后面的管理、蜂窝网络和长期运行正常。

## 4.4 Windows 的符号链接提示

我们出现过：

```text
system/bin/linker64: [WinError 1314] 客户端没有所需的特权
```

安装器随后采用 `windows-source.tar.gz` 保留不能在 Windows 本地创建的条目，Android 子集导出和后续安装成功。要看紧接着是否采用了这个后备方式、是否生成 vendor 归档和最终是否成功，不能仅看到 1314 就重新刷机，也不能对没有完成后备导出的错误一概忽略。

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

也可以使用作者 Magisk 模块的 Action。以上动作选择下次启动系统，不是让 Android 先完整运行再在其中开一个 Linux 虚拟机。

插着有效 SD 卡、默认 Linux 时，正常重启和断电接电直接进入 Linux。拔卡要先关机 / 断电；没有卡且没有内置 Linux 时，当前项目约 300 秒后回退 Android。**我们没有缩短这个等待，也没有实测新的超时值。**

切换后的管理地址也会变：Linux 使用本文设置的 `192.168.50.1`，Android B09 通常仍是它自己的原厂地址。别把两个系统的网页地址、ADB 可用状态和 USB 网卡名称混为一谈。
