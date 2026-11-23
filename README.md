# Marketing Operations

独立的营销自动化工作区：把内容研究/生产和线索/冷触达分成两条流程，共用来源证据、审批状态和转化记录。

## 快速运行

Python 3.11+；运行时仅用标准库。

```bash
python3 -m venv .venv
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local ingest --file examples/seed.json
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local daily
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local report
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

命令与输入格式以 [runtime](docs/runtime.md) 为准。`examples` 仅用于演示；真实业务配置和产物保存在 gitignored `.local/`。

## 两条流程

内容：来源检查 → 证据卡/事件去重 → 选题 → 公众号原稿 → 平台适配 → 人工审阅 → 平台发布回执 → 表现复盘。

触达：公开业务信号 → 画像/证据评分 → 合作假设 → 个性化消息 → 人工发送 → 回复分类 → 会议/下一步 → CRM 归因。

运行器实现来源采集、去重、评分、基础草稿、状态持久化和报告导出；真正的研究与写作由配置好的 agent 执行。它不会自行调用模型，也未连接社媒发布 API、CRM 或 LinkedIn 账号。`daily` 的基础模板不能替代 agent 的定制稿。

## 职责与知识库

L0 负责战略和验收，3 个 L1 和 9 个 L2 角色覆盖日常运营。执行使用 `gpt-6.2-astra` 协作子代理。一个任务可承接相关角色，各角色分别维护证据、产出和反馈。实际任务路径和结果保存在私有运行登记表中。[分工与移交](docs/delegation.md) · [运营手册](docs/agent-operations.md)

## 运行与发布

GitHub Actions 运行离线检查。晨间任务按内容与合作两条流程归属各自 L1，启用状态、运行时区和最近回执以调度服务记录为准。

LinkedIn 发送队列采用人工操作；海外平台可在配置授权连接后接 Buffer 或官方 API，公众号/小红书等不默认视为已支持。所有发布状态必须由真实平台结果更新。

## 数据

本仓库可能公开；会议纪要、客户身份、私有知识库、消息内容、业务策略均不进入 git。`.local/` 是本地业务存储，并非加密数据库。团队上线时使用具有访问控制的独立业务存储，代码与数据分别备份。

## Private operations platform

The persistent dashboard source is in [platform](platform/README.md). Role definitions, real Astra execution records, review queues and schedule observations are distinct. Private production data is imported through authenticated Sites tools; the public repository contains code, schemas and generic role instructions only.
