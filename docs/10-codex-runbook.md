# 10. Codex 全流程执行入口

目标：用户接好 F50 并提供部署需求后，由 Codex 完成软件准备、按状态部署、问题定位、管理配置与备份交付。详细命令来自各章节，本页给出它们的执行顺序与跳转条件。

## 10.1 输入与默认方案

| 输入 | 采用方式 |
|---|---|
| 目标设备 | 通过 USB 实际枚举与 Android 属性识别 F50 / MU300 |
| 系统存储 | SD 卡；节点、容量与分区表从设备检查获取 |
| 用户数据 | 降级擦除 userdata；用户已另存所需文件并授权该操作 |
| SD 数据 | 使用者授权格式化核对后的目标卡 |
| 系统方案 | B09 Android 槽 a；厂商 5.4、openwrt-luci、Linux 槽 b、默认 Linux |
| 网络 | 电脑网线走主路由；F50 USB / Wi-Fi 管理 |
| 管理地址 | 192.168.50.1/24，先查是否与电脑现有网络冲突 |
| 密码 | 使用者本地输入，存入需要的私有安装材料 |
| SSH | 为当前电脑使用 / 创建专用 Ed25519 密钥 |

先集中补齐实际缺失的输入，同时进行下载与只读检查。SD 安装与降级的擦除授权已经明确时，按核对后的目标执行。

核心软件使用 README / 第 0 章链接；可选软件通过 Q&A 的扩展入口获取。本文固定提交和资产哈希以 `versions.json` 为准；执行时使用同一套版本，不混合旧工程 U-Boot、预修补 boot 或其他设备的 NV。

## 10.2 先识别状态，再决定起点

电脑端先收集 PowerShell 版本、已有工具、网卡与路由、USB / COM 接口，再按可用模式查询设备：

```powershell
$PSVersionTable.PSVersion
Get-Command adb,fastboot,git,ssh -ErrorAction SilentlyContinue
Get-NetAdapter
Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'
Get-NetRoute -AddressFamily IPv6 -DestinationPrefix '::/0'
adb devices
fastboot devices
```

Android 可用时：

```powershell
adb shell getprop ro.product.model
adb shell getprop ro.build.display.id
adb shell getprop ro.boot.slot_suffix
adb shell getprop ro.boot.flash.locked
adb shell getprop ro.boot.vbmeta.device_state
adb shell getprop sys.boot_completed
adb shell su -c id
```

Linux 可用时，通过实际地址连接并读取：

```sh
cat /etc/openwrt_release
uname -r
mount | grep mmcblk1
mu300-next-boot status
ubus call network.interface.wan status
```

| 状态 | 下一阶段 |
|---|---|
| 原厂 B15 | 本机备份 → B09 降级 |
| B09 已正常启动、BL 锁定 | 保留 / 补齐备份 → 配套解锁 |
| B09 已 unlocked、无 root | 官方 Magisk Root |
| B09 unlocked 且 su uid=0 | 安装器 Check → SD 安装 |
| SD OpenWrt 已正常运行 | 管理配置 → 核对 → 备份交付 |
| 只有 Fastboot / BootROM | 先识别分区与已有恢复材料，按 Q&A 恢复到可确定状态 |

枚举有多个设备时，使用实际 serial 选择目标，ADB / Fastboot 命令附 `-s`。用户已运行正常 OpenWrt 时，保留该系统配置，不为了重复教程从降级重新开始。

## 10.3 本地材料与阶段记录

按第 0 章建立英文工作目录，分开保存工具、原始固件、设备备份和读回。阶段记录保存为本地 JSON，例如：

同时将 README 各章的勾选清单复制为本机工作目录中的 `F50-progress.md`。由 Codex 自动维护：读取设备状态，确认已完成项后勾选；后续每完成并确认一项，将 `[ ]` 改为 `[x]`，更新当前阶段与下一步。中断、重连或续接时先读取该文件和阶段 JSON。个人进度文件保存在本机，不提交到公共指南仓库。

```json
{
  "stage": "prepared",
  "completed": [],
  "device": {},
  "original_backup": "",
  "checks": {},
  "next_action": "identify-device"
}
```

每阶段成功后追加 completed / checks，并记录下一步。密码不写进脱敏记录；原始日志、分区与网络身份信息留在私有目录。断开、重启或会话中断后，重新读取设备状态与记录，从尚未完成的阶段继续。

## 10.4 阶段 A：准备与本机备份

执行 [第 0 章](00-files-and-workspace.md) 与 [第 1 章](01-preparation.md)。

1. 准备 PowerShell 7、Git、Platform Tools、配套工具与驱动，解压后核对目录和 SHA256。
2. 查实际接口编号，保持电脑主路由网线优先联网。
3. 原厂网页需要开启 USB 调试时，使用可用浏览器工具操作；登录 / 设备选择需用户完成的部分集中提示。
4. 下载工具先等待，再通知断电接电。正常路径无法握手时按 Q&A 识别原因，需测试点时确认 PCB 并安排人工短接窗口。
5. 按 [2A-A](02a-flash-commands.md#a-先做原厂备份) 保存本机分区、启动链、NV / 校准和分区表，核对大小、退出状态与哈希。用户文件另存。

成功后记录原固件、槽位、分区名、备份路径与校验结果，进入降级。

## 10.5 阶段 B：B09 与签名解锁

执行 [第 2 章](02-downgrade-unlock.md) 与 [第 2A 章](02a-flash-commands.md)。

1. 复制 B09 工作副本、排除外来 miscdata，保留本机 NV / 校准；确认 A 槽目标。
2. 使用匹配下载模式的命令写入，清空 userdata，再读回关键镜像与本机固定 NV。
3. Android 正常启动后读取 firmware / slot / boot_completed，重新开启 USB 调试。
4. 写入已校验的 `uboot_eng.bin` 至 `uboot_a`，保持原始 SPL，读回有效载荷比较。
5. 进入 Fastboot，subut Connect → 选择目标 USB → Unlock。具备浏览器控制能力时操作页面，系统 USB 选择由使用者配合。
6. 重启 Android，确认 flash.locked=0、vbmeta=unlocked、verifiedbootstate=orange、boot_completed=1。

成功后进入 Root；异常按 Q&A 对应项恢复，不重复写入不同解锁补丁。

## 10.6 阶段 C：官方 Magisk Root

执行 [第 3 章](03-root.md)。

1. 安装官方 Magisk 30.7，推送本机 B09 原始 boot 到 Download。
2. 通过 scrcpy / 可用 Android UI 操作完成“选择并修补一个文件”，取回生成产物，保存哈希。
3. 确认 Android 槽 a，再通过 Fastboot 写 boot_a，重启。
4. 完成管理器环境安装，重启后授权 Shell。
5. `adb shell su -c id` 返回 uid=0，才进入安装器。

无 UI 控制能力时，给使用者具体的界面路径和当前需要点击的项，完成后由 Codex 验证输出。物理 / UI 配合属于该阶段的一部分，不以模糊的“Root 应该好了”跳过验证。

## 10.7 阶段 D：SD 原生 OpenWrt

执行 [第 4 章](04-sd-openwrt.md)，使用固定提交与 Release。

1. `install.ps1 -Check -Lang zh -NoSelfUpdate`，核对卡节点、容量、su 和布局。
2. 设置 `MU300_STORAGE=sd`、`MU300_OPENWRT=luci`。
3. 选择 OpenWrt / openwrt-luci、默认 Linux、5 次失败回退、导入 Android Wi-Fi、无 GPU extra / VPN extra、厂商 5.4。
4. 目标卡与安装摘要匹配后执行 ERASE / INSTALL，检查安装成功和 boot_b 读回。
5. 原生 Linux 启动后重新枚举 NCM / 串口，管理初始地址为 192.168.77.1。

安装器支持 `-Answers` 按顺序提供回答。自动使用它时，先读取**固定提交**中 `Ask` 分支，根据本机 Check / 现存卡内容生成答案，不固定照搬另一台的回答行号。包含密码的回答文件放本机私有目录，安装后清理或妥善保护。

出现 WinError 1314 时，核对 tar 后备导出与最终结果；USB 有网卡但管理不通时，查询 Q&A 的 flowtable 分支。

## 10.8 阶段 E：管理配置与交付

执行 [第 5 章](05-network-and-management.md)、[第 7 章](07-backup-and-restore.md) 与 [核对表](09-checklist.md)。

安装完成后，按 [安装后优化](12-post-install-optimization.md) 集中设置密码、SSH 密钥、后台、无线与 DHCP，保存 balanced 动态调频和开机应用，整理时间、软件源、流量管理入口及最终备份。已安装 OpenWrt 的设备直接从管理与优化阶段续接。

Wi-Fi 名称、管理端口、时间、软件源与系统更新的日常配置见 [扫尾配置](11-daily-management.md)，依据用户需求设置；Wi-Fi 地区、总流量 / 月流量统计与调优由 Q&A 进入。

1. SSH、LuCI、SD 根挂载、蜂窝 WAN 和 Linux 启动确认正常。
   首次登录后按第 5 章修改 root 管理密码，用新密码重新登录 LuCI；Wi-Fi 密码单独处理，密码记录保存在本机私有材料中。
2. 同步 UCI LAN、MU300 lan.conf、USB 主机租约，将地址设置为 192.168.50.1。
3. 通过串口 / LuCI 应用网络，重连后更新电脑租约。
4. 配置当前电脑自己的 SSH 公钥与 Host f50，核对主机指纹。
5. 如电脑继续用主路由网线，给既有 USB 主机条目打 DHCP 标签，检查 IPv4 / IPv6 默认出口。
6. 重启 / 冷启动核对管理、SD 根、WAN 和失败计数；保存完整 WRT 文件系统与启动恢复数据，校验文件大小、SHA256 与归档成员。

交付给用户：管理 / SSH 地址、密码的私有保存位置、固件与槽位、SD 状态、Android ↔ Linux 切换命令、备份路径、各阶段完成结果。需要增加功能时，由 Q&A 进入对应说明，完成后重新保存备份。

## 10.9 遇到异常怎样续接

记录当前阶段和症状 → 查 [Q&A](08-troubleshooting.md) → 采集接口 / 属性 / 日志 → 执行对应修复 → 重新检查该阶段成功标志 → 继续下一阶段。

需要人工插拔时先让工具等待，说明断电时间与插线顺序；短接由用户双手操作，Codex 负责监测接口，避免要求操作者同时回复。恢复涉及不同板型或缺少本机原始备份时，先补齐适用资料与恢复依据。
