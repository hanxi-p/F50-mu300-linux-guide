# 2A. 降级与解锁命令详解

本章是 [第 2 章](02-downgrade-unlock.md) 的命令补充。目录按 [第 0 章](00-files-and-workspace.md) 整理，原生 EXE 调用使用 PowerShell 7。这些写入示例对应本次确认过的 F50 B15 → B09 A 槽布局。

## A. 先做原厂备份

可以在 `toolkit` 目录启动 `backup_direct.bat`，按工具提示断电后再接入。若正常握手不通，使用 `backup_shortcircuit.bat`，按已确认的测试点顺序进入 BootROM。

脚本显示完成之后，检查新生成的备份目录、文件大小、分区表和错误；明确是否包含 userdata。最初我们排除了 userdata/cache/blackbox，不以“有若干 bin 文件”冒充已备份所有用户文件。

给自己这份原始备份另存哈希：

```powershell
$OriginalBackup = Read-Host '输入本机原始备份目录的绝对路径'
Get-ChildItem -LiteralPath $OriginalBackup -File |
  Get-FileHash -Algorithm SHA256 |
  Export-Csv (Join-Path $OriginalBackup 'original-sha256.csv') -NoTypeInformation
```

后续 NV 校验始终与这个本机备份比较，不能和下载固件中的别人的数据比较。

## B. 准备保留设备数据的 B09 副本

我们没有直接运行工具包的“刷全部目录”默认脚本。实际操作是另复制 B09 目录，去掉 `miscdata.bin`，不引入外来的 prodnv / NV / 校准镜像，使用这个 fork 的 `write_parts_a` 明确写到 A 槽。

```powershell
Set-Location $F50Work
Copy-Item .\toolkit\zte-f50-b09 .\B09-preserve-device-data -Recurse
Remove-Item -LiteralPath .\B09-preserve-device-data\miscdata.bin
$ReadbackParts = @(
  'boot_a','common_rs1_a','dtbo_a','metadata','nr_modem_a','nr_phy_a',
  'pm_sys_a','sml_a','splloader','super','teecfg_a','trustos_a','uboot_a',
  'vbmeta_a','vbmeta_odm_a','vbmeta_product_a','vbmeta_system_a',
  'vbmeta_system_ext_a','vbmeta_vendor_a','vendor_boot_a','ztepersist'
)
```

保留下载包原始副本不动。核对工具帮助里是否有 `write_parts_a`，确认设备分区表包含这些名称。该功能不是所有 `spd_dump` 版本都有。

## C. 写 A 槽、清空 userdata、立即读回

以下参数对应本次实际操作，**会擦除 userdata**。开始前已确认备份和布局；先启动等待，再给 F50 接电。保持电脑主路由网线连接。

```powershell
$F50Verify = Join-Path $F50Work 'verification\B09-readback'
New-Item -ItemType Directory -Path $F50Verify -Force | Out-Null
$F50Rom = (Join-Path $F50Work 'B09-preserve-device-data') + '\'
Set-Location (Join-Path $F50Work 'toolkit\bin')
$FlashArgs = @('--wait','300','--kickto','2','exec','path',$F50Verify,
               'write_parts_a',$F50Rom,'e','userdata')
foreach ($PartName in $ReadbackParts) { $FlashArgs += @('r',$PartName) }
foreach ($PartName in @('nr_fixnv2_a','nr_fixnv2_b','prodnv','miscdata')) {
  $FlashArgs += @('r',$PartName)
}
$FlashArgs += 'reset'
& .\spd_dump.exe @FlashArgs
if ($LASTEXITCODE -ne 0) { throw '刷写工具失败，停止后续步骤' }
```

这里末尾反斜杠必须作为文件夹参数正常传给原生工具。我们曾遇到批处理引号和尾部反斜杠的问题；若日志显示 ROM 路径错误，先处理参数，不换固件重试。

直接模式无法握手时，确认已进入 BootROM，并使用同一工具的配套 FDL。测试点分支的连接前缀是：

```text
--wait 300 exec_addr 0x65012f48 fdl fdl1-dl.bin 0x65000800
fdl fdl2-dl.bin 0xb4fffe00 exec
```

这段前缀替换 direct 模式的 `--kickto 2 exec`，后续写入和读回内容仍要明确。它只记录本次匹配的 FDL/地址，不是跨芯片通用值。

## D. 比较 21 个读回结果

```powershell
foreach ($PartName in $ReadbackParts) {
  $ExpectedFile = Join-Path $F50Rom ($PartName + '.bin')
  $ActualFile = Join-Path $F50Verify ($PartName + '.bin')
  if ((Get-FileHash $ExpectedFile).Hash -ne (Get-FileHash $ActualFile).Hash) {
    throw "读回不匹配：$PartName，停止解锁"
  }
}
```

固定 NV 应与最初备份一致。prodnv 是可写 ext4，开机后整分区哈希可以受日志/元数据影响，要具体分析差异。检查 Android 的 firmware、slot 和 boot-completed，再重新打开 USB 调试。

```powershell
adb shell getprop ro.build.display.id
adb shell getprop ro.boot.slot_suffix
adb shell getprop sys.boot_completed
```

本机是 `F50_FLYMODEM_ZYV1.0.0B09`、`_a`、`1`。不满足时先恢复或排查，不进入解锁。

## E. 写入正确的工程 U-Boot 并读回

第 0 章得到的 `unlock-package/uboot_eng.bin` 才是本次成功使用的有效载荷。不要使用同一资料仓库中另一个同名近似的旧镜像。

```powershell
$EngImage = Join-Path $F50Work 'unlock-package\uboot_eng.bin'
if ((Get-FileHash $EngImage).Hash -ne '36CF3341C7F809489451D9C6DB793AF62A74FDCF0026005C6EB9C24DAB77A68C') {
  throw '工程 U-Boot 文件不匹配'
}
$EngVerify = Join-Path $F50Work 'verification\engineering-uboot'
New-Item -ItemType Directory -Path $EngVerify -Force | Out-Null
Set-Location (Join-Path $F50Work 'toolkit\bin')
& .\spd_dump.exe --wait 300 exec_addr 0x65012f48 `
  fdl .\fdl1-dl.bin 0x65000800 fdl .\fdl2-dl.bin 0xb4fffe00 `
  exec path $EngVerify w uboot_a $EngImage `
  read_part uboot_a 0 1511736 engineering-readback.bin reset
if ($LASTEXITCODE -ne 0) { throw '工程 U-Boot 写入失败' }
if ((Get-FileHash $EngImage).Hash -ne (Get-FileHash (Join-Path $EngVerify 'engineering-readback.bin')).Hash) {
  throw '工程 U-Boot 读回失败'
}
```

上述写入目标是已经确认的 `uboot_a`，保留原始 SPL。先断电、让工具等待、再按已确认的测试点方法接电，直到写入和读回完成。

## F. 浏览器签名解锁

确认 Android 再次正常启动、调试开启后：

```powershell
adb devices
adb reboot bootloader
fastboot devices
```

保持 Fastboot，Chrome/Edge 打开 [subut](https://unisoc-android.github.io/subut/)，连接这台 USB 设备，按页面完成 identifier-token 签名解锁流程。看到 `Device status: Unlocked!` 后执行 `fastboot reboot`。

页面当前按钮为 `Connect` 和 `Unlock`：先点 Connect，在浏览器 USB 选择框选本机 F50 的 Fastboot 接口，等待页面确认设备连接，再点 Unlock。`Custom identifier token` / `Custom private key` 是高级选项，不把别人的 token 或密钥填进去。正常签名流程使用页面与设备获取的信息；如果界面要求与原说明不同，先停下对照原 PDF，不能用其他设备参数凑齐。

若浏览器没有设备，检查 WebUSB 支持、Fastboot 驱动、USB 数据线及接口占用，不反复写启动镜像。页面显示成功后重新开启调试，核对 [第 2 章的启动属性](02-downgrade-unlock.md#25-最终成功的路径)，再进入 Magisk Root。
