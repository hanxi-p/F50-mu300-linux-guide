# 0. 下载文件、工作目录与命令约定

本章在前面几章操作之前完成。以下以 Windows PowerShell 为例，选择英文路径可以减少批处理、压缩包和编码问题。

带原生 EXE 参数数组的示例以 **PowerShell 7** 为准；Windows 自带 PowerShell 5.1 在带空格及末尾反斜杠参数的处理上不同。先运行 `$PSVersionTable.PSVersion` 确认版本。作者的 `install.cmd` 可用于 cmd.exe，但不能把 PowerShell 语法直接粘贴进 cmd。

## 0.1 建立目录

```powershell
$F50Work = Join-Path $env:USERPROFILE 'F50-work'
New-Item -ItemType Directory -Path $F50Work -Force | Out-Null
Set-Location $F50Work
```

本教程后面的目录结构约定：

```text
F50-work/
  platform-tools/     adb.exe、fastboot.exe
  toolkit/            bin/、zte-f50-b09/ 等社区工具目录
  unlock-package/     解压后可见 uboot_eng.bin 的目录
  mu300-linux/        作者安装器仓库
  backups/            本机私有备份，不上传
  verification/      本机读回结果，不上传
```

ZIP 有无外层目录以下载内容为准。解压后整理到上述位置，不能把 ZIP 本身或上级空目录当成工具目录。

## 0.2 必备下载

| 文件 | 来源 | 本次用途 |
|---|---|---|
| Google Platform Tools Windows ZIP | [官方下载](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) | ADB、Fastboot |
| B09 / SPD 驱动 / 刷机工具 ZIP | [作者 releasev1](https://github.com/dikeckaan/zte-f50-toolkit/releases/tag/releasev1)，[ZIP](https://github.com/dikeckaan/zte-f50-toolkit/releases/download/releasev1/f50-downgrade-unlock-modempatch.zip) | 原厂备份和 B09 降级 |
| Minikano 整理的一步解锁包 | [Daniel-Hwang 的资料页](https://github.com/Daniel-Hwang/U20-F50)，文件 `一步解锁Bootloader_飞猫U20_中兴F50_M3_U30Air.zip` | 提取本次成功使用的工程 U-Boot；不运行其中一键解锁批处理 |
| 原始解锁说明 | 同一资料页的 `解锁教程.pdf` | 对照浏览器签名解锁分支 |
| Magisk v30.7 APK | [官方下载](https://github.com/topjohnwu/Magisk/releases/download/v30.7/Magisk-v30.7.apk) | 修补本机 B09 boot、授权 Shell |
| mu300-linux | [作者仓库](https://github.com/dikeckaan/mu300-linux) | 原生 Linux 与 SD 安装 |

Minikano 包在这份公开镜像中的内容已核对，和本次本地文件完全一致。为避免镜像仓库以后改变文件，下面使用固定提交：

```powershell
$UnlockSource = 'https://raw.githubusercontent.com/Daniel-Hwang/U20-F50/97d365986dd4d888a3c9aa7647f9f8820862d280/'
$UnlockFile = [Uri]::EscapeDataString('一步解锁Bootloader_飞猫U20_中兴F50_M3_U30Air.zip')
Invoke-WebRequest -Uri ($UnlockSource + $UnlockFile) -OutFile .\unlock-package.zip
Get-FileHash .\unlock-package.zip -Algorithm SHA256
Expand-Archive .\unlock-package.zip .\unlock-package
Get-FileHash .\unlock-package\uboot_eng.bin -Algorithm SHA256
```

应分别得到：

```text
ZIP: 7fbfb85996ef13bad517b97e2298b1ac8e575a5968c143a521dc550011fbf25a
uboot_eng.bin: 36cf3341c7f809489451d9c6db793af62a74fdcf0026005c6eb9c24dab77a68c
```

同一资料仓库单独放着的 `engineering-uboot_signed.bin` **不是**这里的 `uboot_eng.bin`。前者曾让我们这台设备无法正常启动，不能因为名称都包含 engineering 就混用。

B09 ZIP 的本次校验值为：

```text
33cfc91eb96f67f49d5b722aaf06c7ccb5ead534f38f896191a72e22c18c1af7
```

文件不同就先查来源和完整性，不跳过核对。公开资源的完整列表见 [versions.json](../versions.json)。

## 0.3 配置命令路径

把 Platform Tools 解压到工作目录，然后在当前 PowerShell 会话设置：

```powershell
$env:Path = (Join-Path $F50Work 'platform-tools') + ';' + $env:Path
adb version
fastboot --version
```

后面裸写 `adb`、`fastboot` 都以这一步已完成为前提；也可以写它们的完整路径。PowerShell 调用当前目录 EXE 要带 `./`，带空格的可执行路径要用 `&`。

SPD 驱动使用对应工具包中的驱动安装器。安装完在设备管理器核对接口硬件 ID、驱动和是否有感叹号，不把安装器的“成功”当成设备实际识别成功。

## 0.4 固定 Linux 安装器版本

```powershell
Set-Location $F50Work
git clone https://github.com/dikeckaan/mu300-linux.git
Set-Location .\mu300-linux
git checkout aff105fa3ed9f4b6add2e8d91ef1cf2d63cee92b
```

本次发行资源标签为 `v2026.10.11`，操作发生在 2026-10-07。标签名字按作者发布记录使用，不把它解释为我们操作的日期。

这组固定版本是用于复现我们的案例。要使用新版本时，先阅读作者 README 和更新日志，再重新确认本文中依赖版本的选项。
