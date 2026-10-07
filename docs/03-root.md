# 3. Magisk Root

目标：在已解锁、能正常启动的 B09 上，获得安装器可实际使用的 `su` 权限。

## 为什么需要 Root

作者安装器需要从本机 Android 提取 vendor 运行资源，并写入 Linux 启动分区和启动控制数据；这些动作需要 Android 的超级用户权限。Magisk 用本机 B09 原始 boot 生成对应修补镜像，再通过管理器授权 Shell，给安装器提供可验证的 `su`。已具备有效 Root 时，先检查 `adb shell su -c id`，通过后可直接进入 SD 安装。

## 准备官方 Magisk 与原始 boot

- 官方 [Magisk v30.7](https://github.com/topjohnwu/Magisk/releases/tag/v30.7)。
- 本机对应的 **原始 B09 boot 镜像**，不是其他固件或其他设备的 boot。
- 原始 kernel 保持不变，修补 ramdisk，输出本次专用的 Magisk boot 镜像。

在官方 Magisk 管理器中选择“选择并修补一个文件”，输入本机原始 B09 boot，再取回修补输出。

### 使用管理器修补

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

保存输出哈希，确认修补日志成功、输入镜像属于本机 B09。修补方法参照 [Magisk 作者安装说明](https://topjohnwu.github.io/Magisk/install.html)。

## 写入前先确认槽位

本次 Android 已确定在槽 a：

```powershell
adb shell getprop ro.boot.slot_suffix
adb reboot bootloader
fastboot devices
fastboot flash boot_a "$F50Work\magisk-B09-own.img"
fastboot reboot
```

本文 Android 使用槽 a、Linux 使用槽 b；执行前确认 `ro.boot.slot_suffix` 为 `_a`，Root 镜像写入 `boot_a`。写入 `boot_b` 会覆盖 Linux 启动镜像。

## 管理器与授权同样关键

1. 安装同一版本的官方 Magisk APK。
2. 管理器若提示需要完成环境安装，按提示处理并重启。
3. 在“超级用户”页面确认 `com.android.shell` / Shell 获得授权。
4. 再实际执行：

```powershell
adb shell su -c id
```

本次返回 `uid=0(root)`，才确认 Root 完成。

F50 的 Android 界面可以通过 scrcpy 操作，用于完成 Magisk 管理器安装、环境设置与 Shell 授权。

修补输出与哈希保存到自己的备份目录，便于回退与核对。
