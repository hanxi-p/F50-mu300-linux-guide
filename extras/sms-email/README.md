# 短信邮件转发配套文件

完整步骤：[第十二章：其他可选功能](../../docs/12-optional-features.md)。

适用条件：mu300-linux OpenWrt、支持 SMS hook 的 `mu300-sms`、`msmtp`、465 隐式 TLS。无需安装首页美化。

将本目录完整传到 F50。Codex 准备一个仅 root 可读、只包含授权码的私有文件后执行：

```sh
sha256sum -c SHA256SUMS
sh install.sh FROM@example.com TO@example.com smtp.example.com 465 /root/smtp-password.private
rm -f /root/smtp-password.private
sh test.sh
```

`test.sh` 会实际发送一封 hello 邮件。安装器先保存旧 hook、配置、执行器和服务状态，输出恢复脚本位置；发现无关的已有 hook 时停止，需先适配保留原功能。

文件用途：`enqueue.sh` 编码并入队，`worker.sh` 发送与重试，`reconcile.sh` 补偿启用后遗漏的入队，`service.sh` 注册开机服务，`bounded.sh` 限制单次执行及清理子进程，`restore.sh` 恢复原配置。队列和发送记录留在设备上，恢复时不删除。

本目录无个人邮箱、授权码、实际短信和备份。协议接受但客户端未收到成功应答时，重试可能重复投递。
