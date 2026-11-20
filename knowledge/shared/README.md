# 共享事实目录（公开规则）

此目录只保存公开的知识管理规则。实际品牌资料、产品功能清单、价格、客户证明、知识卡、真实对话与合作方案存放在 `.local/knowledge/shared/`；不要提交到公开 Git 仓库。

各 agent 可读取共享事实，不可自行修改事实的审批状态。建议文件：

- `approved-facts.json`：允许在外部文案使用的事实。
- `offers.json`：已经确认可交付的服务、合作形式和限制。
- `source-register.json`：已确认来源、入口、读取方式与覆盖缺口。
- `suppression.json`：可选导入/审阅镜像，不是运行器的权威名单；不在公开仓库保存真实名单。运行器以当前触达 data-dir 的 SQLite `suppression` 表为唯一权威，收到拒联后必须执行 `marketing_ops --data-dir .local/outreach suppress --entity-key KEY`，再同步镜像。不能只编辑 JSON 就声称已停止队列。

事实记录约定：

```json
{
  "fact_id": "fact-001",
  "claim": "准确、可独立核验的事实",
  "evidence_url": "https://example.org/evidence",
  "verified_at": "2026-11-20T08:00:00-05:00",
  "valid_until": null,
  "status": "draft",
  "approved_by": null,
  "approved_at": null,
  "allowed_channels": [],
  "limitations": "不能从产品构想推导已经上线的能力"
}
```

只有 `status=approved`、审批记录完整且仍有效的事实可作为确定承诺。`draft`、`unverified`、`expired` 只能作为待确认问题；不可用模糊措辞把它们包装为已实现能力。外部来源只能支持其实际陈述，不等于对商业效果的独立验证。

知识更新采用有版本的检索资料和人工反馈，不等于模型微调。相同仓库下的目录分工是逻辑隔离；若需要真正访问控制，应采用独立存储与权限，不依赖提示词。
