# 面向全体在册学生开放 — 2026-09-18

用户已完成真实自动导入测试，并明确授权向所有学生开放。190 已将运行中 Web 配置从单学号试用切换为：

```ini
COURSE_KEYS_ENROLLMENT_OPEN=true
COURSE_KEYS_ENROLLMENT_PILOT_IDS=
```

只开放当前在册学生，验证码收件邮箱仍由学号生成。非名单和已移除学生继续不能登录或提交。之前由用户打开的自动导入开关保持开启，首次提交与换钥按既有流程处理，root 安装允许清单仍有效。

切换前后均有 180 名在册学生，132/190/197 分别 61/60/59 人；1 人已提交且已导入，0 人已移除。此次操作不变更名单或服务器分配，不生成验证码、不提交公钥。名单恢复和自动导入启用均为本次开放之前的用户操作。

只重启 Web，现有服务版本仍为 20260918-auto-v1，静态版本仍为 20260918T083726Z-fa1b25ff。未重新发布代码或改 SSH。四项配置/权限回归在 Linux 通过；公网 health 确认为 open、enrollmentOpen=true、mailConfigured=true，学生入口 HTTP200。

root 私有环境备份：`/var/lib/course-key-service/installer/web-env-before-open-20260918T091024703774Z`。本次脚本只更改两个开放参数；其他环境配置逐行保留。若需要恢复试用，恢复该备份并重启 Web；这不会改动学生数据或已安装公钥，已经批准的安装任务仍独立完成。

操作脚本 SHA256：`726f691b029f1d5702e04dd33c93e71653d3d35942e83b6b412ed59cd4246eae`。原始操作日志和回归日志保留在 190；公网检查摘要在本地 `artifacts/course-keys-open-enrollment/public-smoke.json`。
账号只读预检：180/180 个目标账号全部 ready，132 为 61 个、190 为 60 个、197 为 59 个；没有缺失或未授权账号。Web、importer、Nginx 均 active。
