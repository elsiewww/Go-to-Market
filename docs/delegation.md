# L0 / L1 / L2 分工与移交

本仓库定义 1 个 L0 战略角色、3 个 L1 负责人和 9 个 L2 执行角色。L1/L2 要求 **实际 Claude Opus**，当前均为 prepared_not_created。任务文件和知识目录已准备；它们不等于独立聊天或已部署进程。

| L1（Opus） | L2（全部 Opus） | 汇总交付 |
|---|---|---|
| l1-content 内容与知识库 | 01 新闻/视频/知识库；02 公众号原创；06 全平台适配与发布管理 | 来源证据、主稿、平台包、内容质量及表现 |
| l1-partnerships 合作与冷触达 | 03 公开画像/线索；04 合作/冷触达文案；05 回复/异议处理 | 合格候选、消息、真实对话下一步、拒联状态 |
| l1-growth 增长与体验运营 | 07 CRM/归因/实验分析；08 SEO/GEO/投流；09 社群/指导体验/生命周期 | 实验执行方案、漏斗证据、试点准备与反馈 |

L0 保留战略、优先级、实验取舍与验收标准。L1 分派、协调依赖、检查产出、形成决策建议。L2 执行具体任务并维护自己的知识和反馈。任何角色都不能把未核实的产品材料升级为已验证能力。

## 独立会话和知识

目标是每个 L1/L2 都有可单独打开、继续和审阅的会话。临时后台子代理不自动满足用户的独立聊天要求。默认用独立主会话实现层级；是否采用平台内嵌 subagent 取决于该平台是否能保留用户要求的独立会话与访问方式，不能只靠命名假设。

每角色读取 `agents/<id>/START.md` 与 ROLE.md；私有知识、反馈和产出按 manifest 分开。共享批准事实只读，跨角色通过带版本的产物交接。目录与提示词只是逻辑分离，不是权限隔离，也不是模型微调。

## 模型与启动验收

1. 在真实支持 Opus 的入口建立会话；当前接口无创建会话/选择 Opus 的能力，云环境未安装 Claude Code。
2. 从运行平台核实模型完整 ID、会话 ID、环境、时间，写入私有 runtime registry。`required_model: opus` 是要求，`resolved_model` 才是实测记录。缺失记录为 blocked_model_unverified。
3. 不允许静默降级；模型切换或无法核验就暂停该角色。Claude Code 的 opus 是模型别名，不能把 opusplan 当全程 Opus；后者可在执行阶段更换模型。
4. 共享私有交接包到有权限的运行环境；不能仅克隆公开仓库后假装已获得业务资料。
5. 每条工作流先完成一次不外发的试运行，核对产物/证据/重复任务/知识路径，再接入晨间调度。

参考： https://code.claude.com/docs/en/sub-agents 与 https://code.claude.com/docs/en/model-config （2026-11-20 检索）。这里只提供通用任务包，没有安装或调用 Claude Code。

## 调度归属

内容晨间工作流属于 l1-content；合作线索晨间工作流属于 l1-partnerships。L1 按依赖调度所属 L2；l1-growth 消费两条工作流完成产物并协调 07/08/09。无需给每个 L2 单独建定时器。回复角色只在有真实来信时工作。

L0 不承担晨间业务执行。移交前旧任务保持暂停；保留原时区与时间。实际平台、独立会话、Opus 模型及私有数据访问验证后，将任务注册到对应 L1 并核实调度回执。不能仅修改提示词而声称已迁移线程或模型。

## 交接契约

每份交接记录：task_id、run_id、strategy_version、from_agent、to_agent、input_refs、output_refs、source/evidence、model_evidence_ref、status、limitations、next_action。

状态：prepared → assigned → running → needs_review → accepted；缺少前提用 blocked，不把 produced 与 sent/published 混用。L1 通过后才依赖其产物。每个跨角色引用保留版本；输出只写角色自己的 outbox，共享事实更新交由负责的 L0 审定。

L0 收到：每条业务最多 3 项有效进展、指标与真实分母、支持/反驳原假设的证据、最多 3 项待决策事项，以及下一轮建议。原始名单、整篇稿件与全部对话留在专项会话。
