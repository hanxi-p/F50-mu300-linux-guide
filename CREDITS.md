# 作者与项目链接

这份实操指北由 [hanxi-p](https://github.com/hanxi-p) 整理，核心能力由下列项目提供。没有这些作者的工作，就没有这次安装。

| 用途 | 作者 / 项目 |
|---|---|
| F50 / MU300 原生 Linux、SD 安装器、驱动与系统集成 | [dikeckaan/mu300-linux](https://github.com/dikeckaan/mu300-linux)，作者 [dikeckaan](https://github.com/dikeckaan) |
| 原始 Linux 工作与 MU300 控制面板等贡献 | [kanoqwq/mu300-linux](https://github.com/kanoqwq/mu300-linux)，[kanoqwq / Minikano](https://github.com/kanoqwq) |
| B09 降级等社区工具封装 | [dikeckaan/zte-f50-toolkit](https://github.com/dikeckaan/zte-f50-toolkit) |
| 展讯下载模式读写工具 | [ilyakurdyukov/spreadtrum_flash](https://github.com/ilyakurdyukov/spreadtrum_flash)；具体封装可能使用其 fork |
| 解锁网页 subut | [使用页面](https://unisoc-android.github.io/subut/)，页面注明作者 [Iscle](https://github.com/Iscle) |
| 浏览器 Fastboot 基础 | [kdrag0n/fastboot.js](https://github.com/kdrag0n/fastboot.js) |
| Minikano 原始解锁资料的公开镜像 | [Daniel-Hwang/U20-F50](https://github.com/Daniel-Hwang/U20-F50)，保留原资料作者署名 |
| Root 与启动镜像修补 | [topjohnwu/Magisk](https://github.com/topjohnwu/Magisk) |
| Android ADB / Fastboot | [Google Platform Tools](https://developer.android.com/tools/releases/platform-tools) |
| 可选 Android 画面操作 | [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) |
| OpenWrt 代理管理插件 | [vernesong/OpenClash](https://github.com/vernesong/OpenClash) |
| 代理核心 | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) |

本次解锁还参照了 Minikano 整理的原始解锁说明，以及论坛的测试点讨论。这里重新叙述我们实测的操作与结果，不转载原始 PDF、论坛截图或网盘二进制包。工具包实际文件和版本应从作者渠道核对；不能把同名文件视为同一内容。

问题归属也要区分：降级、Bootloader 解锁和 Magisk Root 发生在 mu300-linux 安装之前，不能把这些操作中的错误归咎于 Linux 安装器。
