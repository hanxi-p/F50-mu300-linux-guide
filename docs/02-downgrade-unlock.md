# 2. B15 备份、B09 降级、Bootloader 解锁与恢复

本章先说明顺序与判断条件，具体 PowerShell 参数、目标槽位和读回命令见 [降级与解锁命令详解](02a-flash-commands.md)。请按本文顺序阅读，再执行对应阶段。

## 2.1 最初的备份

使用社区工具中的 `spd_dump` 与相配的 FDL，先读出本机分区。最早这份 B15 备份检查了 72 个文件的大小，没有发现大小不匹配；它 **没有包含 userdata、cache、blackbox**，不能叫“所有用户文件都已备份”。

要留存：分区列表、实际活动槽、原始 boot / uboot / SPL / trustos，以及 prodnv、固定 NV、运行 NV、校准数据和 miscdata。NV 备份不只是固件：它属于本机，公开仓库不能上传。某些工具读 nv1 的方式有特殊处理，本次由对应 nv2 数据去除 512 字节头得到，同时保留完整 nv2，避免只留一个转换结果。

## 2.2 进入下载模式

我们先安装 SPD 下载驱动，再让工具进入等待状态，最后给设备接电。正常路径不一定需要拆机。

直接连接反复失败时，本次用板上测试点强制进 BootROM：

1. 拔掉 USB，让设备确实断电；电脑网线保留。
2. 下载工具先进入等待设备状态。
3. 在已确认的两个测试点短接着的情况下接入 USB。
4. 看到设备枚举 / 工具开始握手后松开短接，后续保持数据线连接。

**先短接再插 USB** 是本次验证的顺序。不要让操作者一边用双手短接插线、一边还必须回消息；实际配合时给了一个操作窗口，由电脑端检测设备。

两盏白灯常亮、无 Wi-Fi 不能证明设备已进入 BootROM，也不能证明按复位一定有效。短按 2 秒和换 USB 口没有解决本次启动问题，最终通过测试点和匹配启动链恢复。论坛圈图必须和板型逐项比对，本仓库不猜测其他板子的焊盘位置。

## 2.3 降级到 B09

参考 [zte-f50-toolkit](https://github.com/dikeckaan/zte-f50-toolkit) 的备份与 B09 降级分支。我们确认目标 Android 槽为 **a** 后刷写，再读回校验。

结果：21 个 B09 镜像哈希匹配，两份固定 NV 哈希匹配，能正常启动 B09。`prodnv` 的差异主要是 ext4 inode 元数据和日志；不能要求开机后的可写文件系统整分区哈希永远不变。

降级会清空用户数据。不要让镜像包中同名分区、工具的活动槽自动判断和实际想写的槽位混在一起；我们后续关键写入使用明确的 `boot_a` / `uboot_a` 并做读回核对。

## 2.4 失败过的解锁方法

| 尝试 | 结果 / 教训 |
|---|---|
| 只刷 patched trustos | 写入读回一致，但不能据此证明 BL 已解锁 |
| 普通 `fastboot flashing unlock` | 返回 `Unlock bootloader fail.` |
| `fastboot oem unlock` | 返回 `unknown cmd.` |
| 不匹配的旧工程 U-Boot | 出现两白灯常亮、无 Wi-Fi，需要恢复启动链 |
| SPL / miscdata 中看到解锁标志 | 仍需看实际启动锁状态；不能只看字节变化 |

这些失败不是 mu300-linux 安装器造成的，当时还没有安装 Linux。失败尝试留在记录里，不作为推荐步骤。

## 2.5 最终成功的路径

按 Minikano 原始解锁说明的浏览器分支进行：

1. 使用该解锁包配套、已核对的工程 U-Boot，明确写到本机目标 `uboot_a`，读回比较。
2. SPL 保持本机原始版本，本次成功路径没有再靠改 SPL 来宣称解锁。
3. 进入 Fastboot，用 Chrome / Edge 打开 [subut](https://unisoc-android.github.io/subut/)，按它的 identifier token / 签名流程解锁。
4. 网页显示 `Device status: Unlocked!` 后重启 Android，用 ADB 独立验证。

本次写入的配套工程 U-Boot 有效载荷为 1,511,736 字节，资源哈希见 [versions.json](../versions.json)。该值是对我们用过的文件作标识，不能拿它替代下载来源和板型确认。

本次 Android 验证结果：

```text
ro.boot.flash.locked=0
ro.boot.vbmeta.device_state=unlocked
ro.boot.verifiedbootstate=orange
sys.boot_completed=1
ro.build.display.id=F50_FLYMODEM_ZYV1.0.0B09
ro.boot.slot_suffix=_a
```

读取示例：

```powershell
adb shell getprop ro.boot.flash.locked
adb shell getprop ro.boot.vbmeta.device_state
adb shell getprop ro.boot.verifiedbootstate
adb shell getprop sys.boot_completed
adb shell getprop ro.build.display.id
adb shell getprop ro.boot.slot_suffix
```

浏览器确认成功和这些启动属性同时成立，才进入 Root 阶段。解锁工具涉及设备的签名流程，本仓库不提供替换签名、伪造 token 或跨机刷入本机 miscdata 的脚本。

## 2.6 恢复原则

先进入下载模式，确认原始备份和当前目标分区，再恢复匹配的启动链。工具示例中的无槽位 `uboot` 与我们的显式 `uboot_a` 不能不经确认就互换。恢复 stock U-Boot 还可能改变实际解锁行为，所以设备已经正常解锁时不应为了“看起来原厂”随意换回启动链。

本机最终保留的是成功解锁所用的工程 U-Boot 和原版 B09 trustos。原始 B15/B09 和历次恢复读回都在私有备份中，本仓库不发布这些设备数据或未经重新核对的刷写命令。
