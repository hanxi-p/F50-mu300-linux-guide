# 第十二章（可选）：其他可选功能

前十章完成安装、管理连接和备份，第十一章提供页面美化。本章按需增加短信邮件转发等功能；Codex 只执行用户选定的项目。

## 1. 复制给 Codex 的提示词

```text
为我的 F50 配置本仓库 docs/12-optional-features.md 的短信邮件转发。
先核对 SSH、mu300-sms / mu300-smsd、短信 hook、SMTP 软件和网络；已有 hook 时先读取并备份，确认如何保留已有转发功能。
使用我提供的发件邮箱、SMTP 服务器、端口、授权码和收件邮箱。
授权码通过私有文件配置，不放进公开仓库、命令参数或输出。
准备 msmtp、extras/sms-email 配套文件和 SHA256 校验；电脑下载后传给 F50，缺少依赖时核对匹配的软件源。
保存原配置与服务状态，部署持久发送队列和开机服务；断网时保留待发邮件，失败后重试，不阻塞短信接收。
发送一封主题为“来自F50新信息”、正文仅为 hello 的测试邮件，先核对编码后的主题和正文，再核对 SMTP 返回码；再用一条新短信核对收到短信→入队→邮件提交的完整流程。
只报告已实际验证的结果，区分 SMTP 接受发送与收件箱实际收信。
最后记录本机恢复目录、服务状态和检查结果，在 F50-progress.md 勾选。
```

## 2. 短信转发到邮件

### 准备什么

- [ ] F50 已插 SIM 卡，能接收短信，OpenWrt SSH 和 DNS 正常。
- [ ] `mu300-smsd` 正常运行，`mu300-sms` 支持 `/etc/mu300/sms-hook`。
- [ ] 发件邮箱已开启 SMTP，取得客户端授权码；使用邮箱提供的服务器、端口和 TLS 类型。
- [ ] 提供收件邮箱。授权码只保存在本机和设备的私有配置中。
- [ ] Codex 准备 `msmtp`；首次安装会下载少量软件包。

本配套默认采用 **465 端口的隐式 TLS**，适合支持该方式的 SMTP 服务。587 / STARTTLS 需要调整 `tls_starttls`，不直接套用本安装命令。

### 怎么工作

新短信保存到本地短信池后，hook 生成 UTF-8 邮件并放入 SD 持久队列。发送服务每 10 秒检查待发邮件，单次发送最多 45 秒；失败保留邮件，60 秒后重试。成功提交后记录短信 ID，避免同一 ID 重复入队。

发送只处理**启用后进入短信池的新短信**，不会自动补发旧短信。邮件主题固定为“来自F50新信息”，正文第一行显示“发送号码：号码”，下一行显示“短信原文：”并接上完整短信内容。服务不修改 OpenClash、AdGuard Home、无线或蜂窝配置。

配套文件：[安装与恢复说明](../extras/sms-email/README.md)、[安装器](../extras/sms-email/install.sh)、[入队 hook](../extras/sms-email/enqueue.sh)、[发送服务](../extras/sms-email/worker.sh)、[hello 测试](../extras/sms-email/test.sh)。

### Codex 执行顺序

1. 核对短信接收、时间、DNS、SMTP TLS 连通性和已有 hook。
2. 安装 `msmtp`，传输整个 `extras/sms-email` 目录并核对 `SHA256SUMS`。
3. 将授权码写入仅 root 可读的临时文件，再由安装器保存为私有凭据文件。
4. 运行安装器，记录其打印的备份目录；删除临时授权码文件。
5. 运行 `test.sh`，确认 SMTP 接受 hello；查看收件箱及垃圾箱。
6. 发一条新短信到 F50 的 SIM 卡，核对本地短信池、发送状态和邮件内容。

```sh
# F50 上执行；FROM / TO 换成自己的地址，授权码不作为命令参数。
apk add msmtp
cd /root/f50-guide/extras/sms-email
sha256sum -c SHA256SUMS
sh install.sh FROM@example.com TO@example.com smtp.example.com 465 /root/smtp-password.private
rm -f /root/smtp-password.private
sh test.sh
```

**完成标志：** 开机服务启用且运行；hello 得到 SMTP 成功返回；一条新短信完成入队与邮件提交，并由收件方核对收到。

本次 F50 已完成 SMTP hello 提交、服务自启动及权限检查。真实新短信的收件端确认需另行完成，不用 hello 代替该项验证。

### 管理和恢复

```sh
/etc/init.d/f50-sms-email running
cat /run/f50-sms-email-status
logread -e f50-sms-email
ls /etc/mu300/sms-email/outbox
```

队列与凭据存放在 `/etc/mu300/sms-email`，目录权限 700，凭据权限 600。公开问题反馈不要附带配置、授权码或短信正文。完整私人备份包含这些文件，应按原有加密备份方法保存。

暂停转发使用 `/etc/init.d/f50-sms-email stop` 和 `disable`，再移走 `/etc/mu300/sms-hook`；仅停止服务会继续累积待发邮件。恢复使用安装器生成的 `restore.sh`，保留队列和发送记录。

## 3. 其他可选项目入口

| 需求 | 入口 | 准备 |
| --- | --- | --- |
| 页面美化、流量套餐和手机布局 | [第十一章](11-optional-dashboard.md) | 已完成基本安装与管理连接 |
| OpenClash | [Q&A](08-troubleshooting.md)、[配套说明](06-openclash.md) | 自己的订阅或配置 |
| AdGuard Home 与 DNS 联动 | [首页扩展的 Q&A](11-optional-dashboard.md) | 自己选择的过滤规则，分别验证两个插件开关 |
| Wi-Fi、时区、软件源、管理端口 | [日常管理](05b-daily-management.md) | 保留 USB 管理连接 |
| 性能、温度与手动能效模式 | [安装后优化](10a-post-install-optimization.md)、[首页扩展](11-optional-dashboard.md) | 保持 Wi-Fi 可管理，不自动关闭热点或蜂窝 |
| 换 SD 卡、备份恢复 | [备份与恢复](07-backup-and-restore.md) | 核对目标卡容量与设备节点 |

## 4. Q&A：邮件没有收到

- **认证失败：** 核对 SMTP 开关、完整邮箱地址和客户端授权码。服务密码与网页登录密码可能不同。
- **连接或 TLS 失败：** 核对系统时间、DNS、服务器端口、证书和 TLS 类型；保留证书校验。
- **SMTP 成功但收件箱没有：** 检查垃圾箱及收件端规则。SMTP 接受表示已提交给发件服务器，不等于收件端完成投递。
- **旧短信没有转发：** hook 对新入池短信触发，历史短信不自动补发。
- **断网后怎么办：** 待发邮件留在 SD 队列，服务恢复联网后重试；状态以 `/run/f50-sms-email-status` 和日志为准。
- **偶尔收到重复邮件：** SMTP 已接受但客户端未收到成功应答时，重试可能重复投递；稳定 Message-ID 和短信 ID 用于识别同一条消息。

短信接收与 hook 来自 [dikeckaan/mu300-linux](https://github.com/dikeckaan/mu300-linux)，本仓库补充邮件队列、部署和恢复流程。
