# 公众号原创编辑知识索引

这里是公开的规则索引，不存业务知识正文。

- 角色规则：`agents/02-wechat-editor/ROLE.md`
- 真实知识：`.local/knowledge/02-wechat-editor/`
- 实际反馈：`.local/knowledge/02-wechat-editor/feedback.jsonl`
- 出站交接：`.local/agents/02-wechat-editor/outbox/`
- 入站交接：`.local/agents/02-wechat-editor/inbox/`
- 共享事实：`.local/knowledge/shared/approved-facts.json`（只读）

每份资料记录来源、取得时间、允许用途、核验状态、版本和适用角色。使用检索资料与批准修改来改进输出；不要声称已训练模型。初始知识状态为未导入，不能因为目录存在就报告资料已入库。

反馈行格式：

```json
{"feedback_id":"feedback-001","artifact_id":"draft-001","created_at":"2026-11-20T08:00:00-05:00","decision":"revise","reason":"说明具体原因","approved_revision_ref":null,"rule_change":null}
```

拒绝/同意联系、审批人与真实业务结果只写私有记录。每周合并重复反馈；冲突反馈保留并请求负责人裁定，不让一条未确认建议覆盖既有事实。
