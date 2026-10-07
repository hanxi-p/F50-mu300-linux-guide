# F50 刷入 mu300-linux 实操指北

这是我们在一台 **ZTE F50 / MU300** 上，从原厂 B15 降级、解锁、Root，到 **SD 卡原生运行 OpenWrt + OpenClash** 的实际记录。整理者：[hanxi-p](https://github.com/hanxi-p)。实操日期：2026-10-07。

核心项目与安装器来自 **[dikeckaan/mu300-linux](https://github.com/dikeckaan/mu300-linux)**。感谢作者 [dikeckaan](https://github.com/dikeckaan)，以及 [kanoqwq / Minikano](https://github.com/kanoqwq) 等上游贡献者。本仓库记录我们的操作、失败尝试和修复，属于他们项目的实操指北；不是官方教程，也不是固件发布仓库。完整致谢见 [CREDITS](CREDITS.md)。

## 这次最终做成了什么

| 项目 | 实测结果 |
|---|---|
| 原始系统 | Android B15，原始活动槽 b |
| 保留的 Android | B09，槽 a，Bootloader 已解锁，Magisk 30.7 Root |
| Linux | SD 卡上的原生 OpenWrt 25.12.5，带 MU300 LuCI 面板 |
| 内核 | 厂商 5.4.254；未切换主线内核 |
| SD 卡 | 约 64 GB 标称容量，ext4，标签 `mu300sd` |
| 启动 | 插卡时默认直接进入 Linux；冷启动与重启已验证 |
| 管理地址 | 从 `192.168.77.1` 改为 `192.168.50.1` |
| SSH | 电脑专用 Ed25519 密钥，支持 `ssh f50` |
| OpenClash | 0.47.156，Mihomo ARM64 v1.19.29，Fake-IP / rule 模式 |
| 参考配置 | 从自用 CR6609 备份迁移规则，61 节点、516 规则；凭据不公开 |
| IPv6 | 蜂窝公网 IPv6 可用；插件 IPv6 代理和 DNS 开启 |
| 电脑联网 | 主路由网线负责互联网，F50 USB 负责管理 |

**这是原生 Linux 启动，不是 Android 上的 OpenWrt 虚拟机，也不是 chroot。** Android 与 Linux 通过启动槽选择切换。SD 路线也需要内部启动支持：Root 改了 `boot_a`，Linux 安装器写了 `boot_b` 和 `misc` 的启动控制数据；这次没有重分内置 GPT，也没有把 Linux 根文件系统写进 Android 系统或 userdata。

## 按顺序阅读

0. [文件下载、哈希、工作目录与命令约定](docs/00-files-and-workspace.md)
1. [准备、网络顺序与接口识别](docs/01-preparation.md)
2. [B15 备份、B09 降级、BL 解锁及救砖记录](docs/02-downgrade-unlock.md)
   - [逐条刷写、解锁与读回命令](docs/02a-flash-commands.md)
3. [Magisk Root：修补本机原始 B09 启动镜像](docs/03-root.md)
4. [通过作者安装器把 OpenWrt 安装到 SD 卡](docs/04-sd-openwrt.md)
5. [启动后管理连接、防火墙、地址、SSH 与 IPv6](docs/05-network-and-management.md)
6. [安装 OpenClash 并迁移 CR6609 配置](docs/06-openclash.md)
7. [完整 OpenWrt 备份与恢复边界](docs/07-backup-and-restore.md)
8. [踩坑速查表与完整操作时间线](docs/08-troubleshooting.md)
9. [分阶段核对表](docs/09-checklist.md)

项目更新地址：[hanxi-p/F50-mu300-linux-guide](https://github.com/hanxi-p/F50-mu300-linux-guide)。作者上游更新地址：[mu300-linux Releases](https://github.com/dikeckaan/mu300-linux/releases)。本指南记录固定版本；新版本先阅读作者更新说明，再按自己的设备重新核对。

固定版本和公开资源校验值见 [versions.json](versions.json)。使用这些版本记录可以解释本次结果，不代表更新版本或其他硬件一定相同。上游安装器、Root 与解锁工具是不同项目，准备和获取方法分别说明。

## 三个先弄清楚的问题

- **备份是否真的完整？** 最早的 Android 分区备份没有包含 `userdata`、`cache`、`blackbox`，用户文件要另存。之后的 OpenWrt 备份则包含整个 SD 持久文件系统和启动恢复数据；不包含 Android 的整盘内容。
- **不插卡是不是立即进 Android？** 当前原版回退等待仍约 300 秒，我们没有修改它。需要马上切换时使用 `mu300-next-boot android`，再重启。
- **USB 网卡出现是不是安装成功？** 不是。至少核对 SSH、LuCI、SD 根挂载、蜂窝 WAN、启动确认和重启恢复。本次 USB 已枚举但 SSH 不通，最终是防火墙 flowtable 问题。

## 公开范围

本仓库只发布重新整理的文档、公开资源哈希和恢复说明。设备备份、IMEI/NV、厂商二进制、SSH 私钥、登录密码、订阅 URL、节点配置和原始日志均不上传。没有一键刷写或一键恢复脚本，防止把我们这台设备的分区名、槽位和测试点误套到其他版本。

原始文档采用 [CC BY 4.0](LICENSE.md)。上游软件与固件保留各自许可；本仓库的许可不覆盖它们。
