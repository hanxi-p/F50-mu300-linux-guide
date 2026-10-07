# 3. Magisk Root

目标：在已解锁、能正常启动的 B09 上，获得安装器可实际使用的 `su` 权限。

## 旧预修补镜像遇到的问题

我们最初尝试了社区预修补 B09 镜像：临时 `fastboot boot` 或写入后看到 Magisk 进程，并不等于 adb shell 能获得 root。旧镜像中有 canary 核心和 stub 管理器，Shell 授权状态也不可靠。`su` 文件存在但返回拒绝，仍然没有完成 Root。

## 最终使用的组合

- 官方 [Magisk v30.7](https://github.com/topjohnwu/Magisk/releases/tag/v30.7)。
- 本机对应的 **原始 B09 boot 镜像**，不是其他固件或其他设备的 boot。
- 原始 kernel 保持不变，修补 ramdisk，输出本次专用的 Magisk boot 镜像。

通常可以在 Magisk 管理器中选择“选择并修补一个文件”，将原始 boot 送进去，取回输出。我们这次为排除旧组件影响，实际在设备上运行官方 APK 中的修补文件，参数如下：

### 推荐给读者的操作：官方管理器修补

先回到已启动的 Android，不在 Fastboot 或 OpenWrt 下运行以下 ADB 命令。将第 0 章下载的官方 APK 保存为工作目录中的 `Magisk-v30.7.apk`，原始镜像来自保留的 B09 固件目录。

```powershell
Set-Location $F50Work
adb devices
adb install .\Magisk-v30.7.apk
adb push .\B09-preserve-device-data\boot_a.bin /sdcard/Download/stock-B09.img
```

用 [官方 scrcpy](https://github.com/Genymobile/scrcpy/releases) 的 Windows 包连接设备，运行其中的 `scrcpy.exe`。在投屏窗口打开 Magisk，点击 Magisk 一栏的“安装”→“选择并修补一个文件”，在 Download 目录选 `stock-B09.img`，等待修补成功。这里选择的是 Magisk 的安装按钮，不是应用安装器。

```powershell
adb shell ls /sdcard/Download/
```

找到刚生成的 `magisk_patched-……img`，把其**实际完整文件名**填入下面的变量，不要原样照抄占位文字。若看见多个旧产物，按本次时间和管理器日志确认。

```powershell
$PatchedOnDevice = Read-Host '输入本次 /sdcard/Download/magisk_patched-……img 完整路径'
adb pull $PatchedOnDevice .\magisk-B09-own.img
Get-Item .\magisk-B09-own.img | Select-Object Name,Length
Get-FileHash .\magisk-B09-own.img -Algorithm SHA256
```

保存这次输出的哈希，确认文件非空、修补日志成功且输入确为 B09。不得下载别人修补好的 boot 来替代本步骤。官方管理器路径由 Magisk 作者支持；下方 CLI 参数是我们当时排查旧组件后使用的实操记录，不要求读者同时执行两种修补方法。

```sh
BOOTMODE=true KEEPVERITY=true KEEPFORCEENCRYPT=true PREINITDEVICE=cache \
  sh ./boot_patch.sh stock-B09.img
```

这不是完整下载脚本：`boot_patch.sh`、`util_functions.sh`、magiskboot、magiskinit、magisk、stub 等均须来自同一个官方 APK，按其实际 ABI 组织好后在设备工作目录执行。`PREINITDEVICE=cache` 是本次设备上的选择，不是所有 Android 通用常量。优先参照 [Magisk 作者安装说明](https://topjohnwu.github.io/Magisk/install.html)。

本次输出 64 MiB，kernel 部分与 B09 原始镜像一致。修补日志中个别厂商 hex pattern 未找到，不应只凭一行字判断成败；要看退出状态、解包结果和 kernel/输出镜像核对。

## 写入前先确认槽位

本次 Android 已确定在槽 a：

```powershell
adb shell getprop ro.boot.slot_suffix
adb reboot bootloader
fastboot devices
fastboot flash boot_a "$F50Work\magisk-B09-own.img"
fastboot reboot
```

`boot_a` 不是对所有设备的默认答案。以后 Linux 放在槽 b，误刷 b 会覆盖 Linux 启动镜像。不要把第三方预修补镜像直接当作通用答案。

## 管理器与授权同样关键

1. 安装同一版本的官方 Magisk APK。
2. 管理器若提示需要完成环境安装，按提示处理并重启。
3. 在“超级用户”页面确认 `com.android.shell` / Shell 获得授权。
4. 再实际执行：

```powershell
adb shell su -c id
```

本次返回 `uid=0(root)`，才确认 Root 完成。

F50 是无屏设备，但 Android 中仍有显示界面。我们用 ADB 唤醒、截图与 UI 操作完成管理器安装和授权；需要人工查看时可用 scrcpy。`uiautomator` 某些导航按钮边界会不准，不能把坐标点击当成通用脚本。

修补后的 boot 哈希只标识这次产物，不作为别人应直接刷入的下载资源。设备镜像不放在公开仓库。
