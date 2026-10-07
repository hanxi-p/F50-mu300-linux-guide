# 7. 完整 OpenWrt 备份、换卡与恢复

## 7.1 保存范围与验证结果

完整备份包含整个 SD **持久文件系统**，另存 Android / Linux boot、启动控制数据、启动链与分区表，覆盖已安装软件包、MU300 文件及自己的规则和配置。

此方案采用文件系统归档与启动恢复数据，便于保存和换卡；Android super / userdata 及原始校准数据沿用降级前的独立备份。

备份校验包括双端 SHA256、文件大小与关键归档成员。本指南已验证这些完整性检查；下方恢复说明用于原设备的换卡与故障恢复，实际恢复操作需按目标布局核对。

## 7.2 先确认实际布局

```sh
mount | grep mmcblk1
ls -la /mnt/mu300-disk
df -h /mnt/mu300-disk
mu300-next-boot status
ls -l /dev/block/by-name/boot_a /dev/block/by-name/boot_b
```

本次挂载点 `/mnt/mu300-disk` 下有 `.mu300`、`boot`、`openwrt-luci`、`lost+found`。其他版本挂载点不同要调整后续命令。备份含密码哈希、Wi-Fi、订阅 / 节点和设备数据，不上传到公共仓库。

## 7.3 Windows 保存二进制系统归档

先完成第 5 章的 `ssh f50` 密钥登录。已安装会持续写入数据的扩展服务时，归档前按对应说明暂停，完成后恢复。这里用 cmd 进行原始字节重定向，避免旧 PowerShell 文本重定向破坏 tar / gzip；不要替换成 `Out-File` 或 `Set-Content`。

```powershell
$BackupDir = Join-Path $env:USERPROFILE ('F50-backups\WRT-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Set-Location $BackupDir
ssh -o BatchMode=yes f50 'id; df -h /mnt/mu300-disk'
if ($LASTEXITCODE -ne 0) { throw '先解决 SSH 密钥连接' }
cmd /d /c 'ssh -o BatchMode=yes f50 "tar -C /mnt/mu300-disk --exclude=openwrt-luci/dev --exclude=openwrt-luci/proc --exclude=openwrt-luci/sys --exclude=openwrt-luci/tmp --exclude=openwrt-luci/run --exclude=openwrt-luci/mnt -czf - .mu300 boot openwrt-luci lost+found" > sd-filesystem.tar.gz'
if ($LASTEXITCODE -ne 0) { throw '归档读取失败' }
Get-Item .\sd-filesystem.tar.gz | Select-Object Name,Length
Get-FileHash .\sd-filesystem.tar.gz -Algorithm SHA256
tar -tzf .\sd-filesystem.tar.gz > .\archive-members.txt
if ($LASTEXITCODE -ne 0) { throw '归档不能正常读取' }
Select-String -Path .\archive-members.txt -Pattern 'boot-os|etc/config/network|etc/config/wireless|etc/shadow'
```

备份前暂停会持续写入数据的扩展服务，完成后恢复服务。运行中归档适合保存持久文件；需要严格一致性时，停机取卡，在 Linux 上离线归档。

不要打包 `dev/proc/sys/tmp/run/mnt` 的运行时绑定挂载，防止重复遍历 SD 或包含内存目录。恢复后应重建目录，不恢复其临时内容。

## 7.4 启动恢复数据

先核对本机对应分区确实存在。以下只读保存：

```powershell
foreach ($Part in @('boot_a','boot_b','misc','miscdata','uboot_a','trustos_a')) {
  $BackupCommand = 'ssh -o BatchMode=yes f50 "gzip -c /dev/block/by-name/' + $Part + '" > ' + $Part + '.bin.gz'
  cmd /d /c $BackupCommand
  if ($LASTEXITCODE -ne 0) { throw "读取失败：$Part" }
}
foreach ($Part in @('mmcblk0boot0','mmcblk0boot1')) {
  $BackupCommand = 'ssh -o BatchMode=yes f50 "gzip -c /dev/' + $Part + '" > ' + $Part + '.bin.gz'
  cmd /d /c $BackupCommand
  if ($LASTEXITCODE -ne 0) { throw "读取失败：$Part" }
}
Get-ChildItem -File *.gz | Get-FileHash -Algorithm SHA256 |
  Export-Csv .\sha256.csv -NoTypeInformation
ssh f50 'uname -a; cat /etc/openwrt_release; mount; df -h; cat /proc/partitions; blkid; mu300-next-boot status; apk list --installed' > device-metadata.txt
```

文本元数据可以用 PowerShell 保存；二进制不可混用。进一步把解压后原始数据的哈希与路由器 `sha256sum /dev/block/by-name/…` 比对。Linux boot_b 含运行时启动日志，重启后整分区哈希可以变化，不要跨启动拿两个整分区 hash 作静态镜像比较。

可另外保存本机 eMMC GPT 头尾、SD 分区前的头部区域、manifest 与校验清单。GPT 位置根据**本机逻辑扇区大小、总扇区数与分区布局**计算，恢复时对应原设备使用。

## 7.5 换到 16 GB SD 卡

**16 GB 足够当前这套 OpenWrt 的容量需求。** 本次已配置系统的持久文件实测约 213.4 MiB，为规则库、日志和后续软件留下充足空间；大量下载与数据存储按实际需求选更大容量。选卡优先考虑稳定性与品质。

启动链正常、只更换 SD 时：

1. 核对归档 SHA256，另存一份原始备份。
2. F50 断电后取卡，用 Linux 电脑或 Live USB 操作目标卡，依据容量和设备标识确定磁盘。
3. 按作者安装器支持的 SD 布局建立第一分区，格式化为 ext4，标签 `mu300sd`。这会清空**目标卡**，不应涉及电脑系统盘或 F50 内置盘。
4. 把目标分区挂到空目录。以下假定已正确挂到 `/mnt/f50-restore`；路径或来源不符先停止。

```sh
findmnt /mnt/f50-restore
sudo tar --numeric-owner -xzpf /path/to/sd-filesystem.tar.gz -C /mnt/f50-restore
sudo mkdir -p /mnt/f50-restore/openwrt-luci/{dev,proc,sys,tmp,run,mnt}
sudo chmod 1777 /mnt/f50-restore/openwrt-luci/tmp
sync
sudo umount /mnt/f50-restore
```

5. 插回原 F50，接电，观察串口，检查根挂载、管理地址、WAN、启动确认及自己安装的扩展服务。

另一条路线是插入新卡，在 Android 下重新运行同版本作者安装器、选择 SD，再恢复自己的软件和配置。**新安装不能把旧卡完整归档未经核对就全覆盖**，因为新生成的 vendor / boot 与布局可能不同。

文件恢复必须保留权限、属主、符号链接和隐藏 `.mu300`。不能在 Windows 解压到 FAT / exFAT 后用资源管理器复制代替。本文固定版本按 SD ext4 标签 `mu300sd` 查找根文件系统。使用其他版本时，按其启动配置核对标签、UUID 与分区布局。

## 7.6 启动链损坏的恢复边界

需要按当前模式使用 Fastboot 或匹配 FDL 的 BootROM 工具，不是单纯换卡。

- 使用本机自己的 boot 与启动链，确认槽位和长度，只恢复已确认损坏部分，写入后读回。
- misc / miscdata、GPT、NV 不是万能清理包，不能刷别人设备的数据。
- Android 能启动时，优先用作者安装器检查 / 重新生成 Linux 启动支持。
- Android 和 Fastboot 都不能用时，参照第 2 章的 BootROM 前提，测试点必须匹配 PCB。

先明确故障范围、保留两份可校验备份，再恢复对应 SD 文件或启动分区。
