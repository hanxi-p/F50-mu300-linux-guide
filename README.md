# F50 刷入 mu300-linux 实操指北

让 **ZTE F50 / MU300** 在保留 Android 的同时，从 **SD 卡原生运行 OpenWrt**。本指南串起 B15 降级、解锁、Root、SD 安装和系统切换，让软件准备、操作命令与成功标志都有据可查。整理者：[hanxi-p](https://github.com/hanxi-p)。实操日期：2026-10-07。

核心项目与安装器来自 **[dikeckaan/mu300-linux](https://github.com/dikeckaan/mu300-linux)**。感谢作者 [dikeckaan](https://github.com/dikeckaan)，以及 [kanoqwq / Minikano](https://github.com/kanoqwq) 等上游贡献者。本仓库是面向 Windows 用户的社区实操指北，提供配套软件下载链接、顺序清晰的安装步骤和按症状检索的排障说明。完整致谢见 [CREDITS](CREDITS.md)。

## 一张 SD 卡，让 F50 多一套 OpenWrt

| 项目 | 方案与验证 |
|---|---|
| 原始系统 | Android B15，原始活动槽 b |
| 保留的 Android | B09，槽 a，Bootloader 已解锁，Magisk 30.7 Root |
| Linux | SD 卡上的原生 OpenWrt 25.12.5，带 MU300 LuCI 面板 |
| 内核 | 厂商 5.4.254 |
| SD 卡 | ext4，标签 `mu300sd`；16 GB 足以满足本方案的系统容量需求 |
| 启动 | 插卡时默认直接进入 Linux；冷启动与重启已验证 |
| 管理地址 | 从 `192.168.77.1` 改为 `192.168.50.1` |
| SSH | 电脑专用 Ed25519 密钥，支持 `ssh f50` |
| 蜂窝网络 | WAN 与运营商提供的公网 IPv6 已完成连接检查 |
| 电脑联网 | 主路由网线负责互联网，F50 USB 负责管理 |

**原生启动、保留 Android、按需切换**是这条路线的核心：OpenWrt 根文件系统放在 SD 卡，正常接电直接进入 Linux；需要原厂功能时，用命令切回 Android。内置 GPT 与 Android 分区大小保持原有布局。

写入范围明确：Magisk 修补 `boot_a`，Linux 安装器写入 `boot_b` 和 `misc` 启动控制数据。SD 卡承载 Linux 系统文件，内部启动槽负责启动。

## 把这个链接交给 Codex

接好 F50、插入目标 SD 卡，把仓库链接和下面这段需求发给电脑上的 Codex：

```text
请按 https://github.com/hanxi-p/F50-mu300-linux-guide 部署我的 F50。
先获取仓库，读取 AGENTS.md 和 docs/10-codex-runbook.md，识别当前设备状态，
完成本机备份后，依次处理需要的 B09 降级、解锁、Root 和 SD 原生 OpenWrt 安装。
我已另存需要的用户文件，同意本次降级擦除 userdata，并格式化核对后的目标 SD 卡。
管理地址设为 192.168.50.1，配置这台电脑的 SSH 密钥，保持电脑互联网走主路由网线。
软件准备、命令执行和检查由你完成；需要插拔、短接、浏览器选择 USB 或本地输入密码时，集中告诉我。
遇到问题查 Q&A，按实际日志修复；已完成的阶段直接跳过。
最后保存完整 WRT 备份，交付访问地址、切换系统方法和核对结果。
OpenClash 属于可选扩展，我提供配置后再安装和导入。
```

执行入口按设备状态推进软件任务，详细命令沿用各章节；物理连接和设备端交互由操作者配合。无需把个人实验记录逐段交给 Codex。

## 提前准备什么

**操作环境：Windows 11 x64 + PowerShell 7。** 浏览器使用 Chrome / Edge；设备端先运行 Android B09，再安装 SD 上的 OpenWrt。换卡时需要保留 Linux 文件权限，离线恢复使用 Linux 电脑或 Live USB。

- 一台匹配本文分区布局的 F50 / MU300，一根可靠的 USB 数据线和稳定供电。
- 一张可清空的 SD 卡；当前这套系统使用 16 GB 容量即可。
- 电脑通过主路由网线保持互联网，同时用 USB / Wi-Fi 管理 F50。
- 本机启动链、NV / 校准数据和用户文件的备份空间。

| 软件 / 文件 | 用途 | 获取地址 |
|---|---|---|
| PowerShell 7 | 执行 Windows 命令与安装器 | [PowerShell Releases](https://github.com/PowerShell/PowerShell/releases) |
| Git for Windows | 获取固定版本的安装器 | [Git 官方下载](https://git-scm.com/downloads/win) |
| Platform Tools | ADB / Fastboot | [Google 官方下载](https://developer.android.com/tools/releases/platform-tools) |
| B09、SPD 驱动与下载工具 | 备份、降级、读回 | [zte-f50-toolkit releasev1](https://github.com/dikeckaan/zte-f50-toolkit/releases/tag/releasev1) |
| 配套工程 U-Boot | Bootloader 解锁准备 | [固定文件与校验说明](docs/00-files-and-workspace.md#02-必备下载) |
| Chrome / Edge + subut | 浏览器签名解锁 | [subut 页面](https://unisoc-android.github.io/subut/) |
| Magisk 30.7 + scrcpy | Root 与无屏 Android 界面操作 | [Magisk](https://github.com/topjohnwu/Magisk/releases/tag/v30.7)、[scrcpy](https://github.com/Genymobile/scrcpy/releases) |
| mu300-linux 安装器 | SD 原生 OpenWrt 与系统切换 | [作者仓库](https://github.com/dikeckaan/mu300-linux) |

文件解压位置、固定提交和 SHA256 按第 0 章统一准备，再进入刷写步骤。

完整准备清单见 [电脑系统、线材、SD、SIM 与网络顺序](docs/01-preparation.md)。阶段目的也在各章开头说明：B09 统一配套解锁环境，解锁允许启动修补 / Linux 镜像，Root 给安装器提供本机提取与写入权限，SD OpenWrt 提供可扩展的蜂窝路由系统。

## 部署主线

1. [文件下载、哈希、工作目录与命令约定](docs/00-files-and-workspace.md)
2. [准备、网络顺序与接口识别](docs/01-preparation.md)
3. [备份、B09 降级与 Bootloader 解锁](docs/02-downgrade-unlock.md)
   - [逐条刷写、解锁与读回命令](docs/02a-flash-commands.md)
4. [Magisk Root：修补本机原始 B09 启动镜像](docs/03-root.md)
5. [通过作者安装器把 OpenWrt 安装到 SD 卡](docs/04-sd-openwrt.md)
6. [建立管理连接、更新地址与配置 SSH](docs/05-network-and-management.md)
7. [完整 OpenWrt 备份与换卡恢复](docs/07-backup-and-restore.md)
8. [分阶段核对表](docs/09-checklist.md)

由 Codex 执行时，先读 [全流程执行入口](docs/10-codex-runbook.md)，再按阶段调用上面的详细步骤。Android ↔ OpenWrt 切换命令见 [系统切换](docs/04-sd-openwrt.md#46-系统切换)。

## Q&A 与可选扩展

安装异常按 [Q&A](docs/08-troubleshooting.md) 查询：USB 识别、解锁、Root 授权、首次启动和地址更新都有对应解决方法。OpenClash、性能优化、Wi-Fi 地区、IPv6 LAN 配置、持久流量统计与 SD 换卡也从这里按需进入。

日常扫尾见 [更新源、Wi-Fi 名称、后台与 SSH](docs/11-daily-management.md)。

项目更新地址：[hanxi-p/F50-mu300-linux-guide](https://github.com/hanxi-p/F50-mu300-linux-guide)。作者上游更新地址：[mu300-linux Releases](https://github.com/dikeckaan/mu300-linux/releases)。本指南记录固定版本；新版本先阅读作者更新说明，再按自己的设备重新核对。

已验证的软件版本与资源 SHA256 见 [versions.json](versions.json)。本文命令对应 F50 B15 → B09、Android 槽 a / Linux 槽 b、SD 存储路线；其他 PCB、分区布局或版本，先按作者对应说明核对。

## 公开范围

本仓库发布安装文档、资源链接、校验值和恢复说明，软件从各作者渠道获取。设备备份、NV / 校准数据、密钥与订阅由使用者本地保存。

原始文档采用 [CC BY 4.0](LICENSE.md)。上游软件与固件保留各自许可；本仓库的许可不覆盖它们。
