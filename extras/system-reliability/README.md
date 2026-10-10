# 系统稳定性配套修补

用于本指南固定的 **v2026.10.11 OpenWrt 基础系统 + 厂商 5.4 内核**。提供本机实际合入的系统组件，首页美化与短信邮件转发分别安装。

来源：[dikeckaan/mu300-linux](https://github.com/dikeckaan/mu300-linux)，上游提交 `52093b28c9c3e0280b1a1be6f0d4b5437a6053a1` 的相关组件，另加本指南的互斥和进程清理修补。许可见 [LICENSE](LICENSE)。组件来源与哈希见仓库 `versions.json` 和本目录 `SHA256SUMS`。

包含：

- `ndp-learn`：学习多个蜂窝 IPv6 前缀并撤回消失的前缀。
- `mu300-sms` / `mu300-smsd`：本地保存后释放 SIM 空间、短信池互斥、接收守护单实例和停止清理。
- `mu300-next-boot` / `mu300-update`：启动控制与更新共用互斥锁；试启动设置失败时拒绝写入；内核回滚同时恢复匹配模块。
- USB / fw4 hotplug：先桥接再移除重复地址；处理 5.4 的 flowtable 重载问题。
- `modem-lock`：开机早期回放遇到设置锁忙时立即延期，打断 radio / apply 锁的循环等待；重启未恢复无线就绪或控制锁超时时向页面返回失败，避免显示切换成功。
- `mu300-at`：按单调时钟限制锁等待与回包等待，避免小数休眠回退、系统校时使等待时间异常延长。
- 服务启动使用 `f50-bounded --keep-background`，成功后保留异步防火墙初始化；超时仍取消进程组。首页信号采集不占用拨号与控制通道，失败保留缓存并退避。
- `f50-bounded`：任务超时、子进程清理和标准输入保留。

Codex 核对软件源并准备缺少的 `flock` 等依赖（例如 `apk add flock`），将整个目录传到设备，保持 USB 管理，先执行检查，再安装：

```sh
cd /root/f50-guide/extras/system-reliability
sha256sum -c SHA256SUMS
sh install.sh --check
sh install.sh
```

安装器保存原文件、防火墙配置和服务运行状态，打印恢复入口。它短暂停止短信接收守护与 NDP 学习服务，完成或报错后恢复原先运行的服务；不重启 Wi-Fi、蜂窝或设备，也不写 boot 分区。5.4 的流量卸载设置保存为关闭，在防火墙下次正常加载时生效。

安装后核对：

```sh
/etc/init.d/mu300-smsd running
/etc/init.d/mu300-ndp running
mu300-next-boot status
/opt/mu300/bin/ndp-learn --prefix
uci get firewall.@defaults[0].flow_offloading
uci get firewall.@defaults[0].flow_offloading_hw
ubus call hostapd.wlan0 get_status
ubus call network.interface.wan status
```

两项 offloading 应为 `0`；短信守护与 NDP 服务原先启用时应正常运行；确认 SSH、LuCI、Wi-Fi 和蜂窝连接。NDP 无输出时先核对运营商是否下发 IPv6，不将无 IPv6 当作安装失败。

这是一组经适配的组件修补，基础 rootfs 版本仍为 v2026.10.11。以后整系统升级需重新核对兼容性；不要把本目录覆盖到更新版本。启动组件的升级不代表整系统已经升级。自动休眠、省电守护与 TTL 改动不在该安装器中。

恢复系统组件时保留共用超时执行器 `f50-bounded`，避免影响另行安装的首页或短信邮件服务。
