# 2. 备份、B09 降级与 Bootloader 解锁

本章先说明顺序与判断条件，具体 PowerShell 参数、目标槽位和读回命令见 [降级与解锁命令详解](02a-flash-commands.md)。请按本文顺序阅读，再执行对应阶段。

## 为什么先降级，再解锁

本文使用的配套工程 U-Boot 与签名解锁流程建立在 **B09** 上，因此先将 B15 转到这套配套版本，统一后续镜像与工具的运行环境。已在匹配 B09 上的设备可直接核对备份与槽位，进入解锁；这里的降级是本流程的版本准备。

Bootloader 解锁使设备能够启动后续的 Magisk 修补 boot 和作者生成的 Linux boot。先确认 B09 正常启动，再使用配套工程 U-Boot 与 subut，最后读 Android 启动属性确认解锁状态。下面依次给出备份、连接、降级、解锁与核对。

## 2.1 备份本机分区与用户文件

使用社区工具中的 `spd_dump` 与相配的 FDL，先读出本机分区，核对分区清单、文件大小与哈希。若分区备份跳过 userdata / cache / blackbox，另行保存所需用户文件。

要留存：分区列表、实际活动槽、原始 boot / uboot / SPL / trustos，以及 prodnv、固定 NV、运行 NV、校准数据和 miscdata。NV / 校准数据属于本机，单独保存在私有备份中。某些工具读 nv1 的方式有特殊处理，本次由对应 nv2 数据去除 512 字节头得到，同时保留完整 nv2，避免只留一个转换结果。

## 2.2 进入下载模式

先安装 SPD 下载驱动，再让工具进入等待状态，最后给设备接电。优先使用正常 USB 下载路径。

需要强制进入 BootROM 时，使用与本机 PCB 匹配的测试点：

1. 拔掉 USB，让设备确实断电；电脑网线保留。
2. 下载工具先进入等待设备状态。
3. 在已确认的两个测试点短接着的情况下接入 USB。
4. 看到设备枚举 / 工具开始握手后松开短接，后续保持数据线连接。

顺序为 **先短接，再插 USB，握手后松开**；以电脑端设备枚举和工具握手确认进入下载模式。

测试点位置需和实际板型逐项比对。白灯状态与下载接口识别方法见 [排障速查](08-troubleshooting.md)。

## 2.3 降级到 B09

参考 [zte-f50-toolkit](https://github.com/dikeckaan/zte-f50-toolkit) 的备份与 B09 降级分支。确认本文目标 Android 槽为 **a** 后刷写，再读回校验。

完成标准：21 个 B09 镜像读回哈希匹配，固定 NV 与本机原备份一致，Android 正常启动 B09。`prodnv` 是可写 ext4，开机后的日志与 inode 元数据按文件系统变化分析。

降级会清空用户数据。不要让镜像包中同名分区、工具的活动槽自动判断和实际想写的槽位混在一起；我们后续关键写入使用明确的 `boot_a` / `uboot_a` 并做读回核对。

## 2.4 选择配套解锁资源

使用第 0 章校验过的 `uboot_eng.bin`，目标为 `uboot_a`，保留本机原始 SPL。随后通过 subut 完成浏览器签名解锁。文件选择、写入与读回命令见 [第 2A 章](02a-flash-commands.md#e-写入正确的工程-u-boot-并读回)。

## 2.5 浏览器签名解锁

按 Minikano 原始解锁说明的浏览器分支进行：

1. 使用该解锁包配套、已核对的工程 U-Boot，明确写到本机目标 `uboot_a`，读回比较。
2. SPL 保持本机原始版本。
3. 进入 Fastboot，用 Chrome / Edge 打开 [subut](https://unisoc-android.github.io/subut/)，按它的 identifier token / 签名流程解锁。
4. 网页显示 `Device status: Unlocked!` 后重启 Android，用 ADB 独立验证。

本次写入的配套工程 U-Boot 有效载荷为 1,511,736 字节，资源哈希见 [versions.json](../versions.json)。下载来源、文件哈希与板型按第 0 章核对。

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

浏览器显示 Unlocked，且 Android 启动属性符合以上结果后，进入 Root 阶段。

## 2.6 恢复原则

先进入下载模式，确认原始备份和当前目标分区，再恢复匹配的启动链。工具示例中的无槽位 `uboot` 与我们的显式 `uboot_a` 不能不经确认就互换。恢复 stock U-Boot 还可能改变实际解锁行为，所以设备已经正常解锁时不应为了“看起来原厂”随意换回启动链。

本流程保留配套工程 U-Boot 和原版 B09 trustos；原始启动链及读回文件保存到本机备份目录。
