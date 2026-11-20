# 本地自动化运行说明

这是一个可运行的 Python 3.11+ 标准库程序，不需要模型 API key。它负责导入证据、读取已启用的公开 RSS/Atom、持久化去重、线索排序、生成规则草稿，以及导出三个独立待审队列。**没有发送私信、发邮件、购买广告或发布社媒的代码。** `mark --status sent` 只登记你已经完成的外部动作。

## 运行

在仓库根目录执行；所有真实业务数据默认只进入 `.local/`。

```sh
python -m venv .venv
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local ingest --file .local/seed.json
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local collect --config config/sources.json
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local daily
PYTHONPATH=src .venv/bin/python -m marketing_ops --data-dir .local report
```

`daily` 和 `report` 可传 `--date YYYY-MM-DD`；默认按 America/New_York 的当天。首次演示可使用 `examples/seed.json` 并指定 `daily --date 2026-11-20`。示例是虚构数据，不能当作已找到的线索。

输出为 `.local/reports/YYYY-MM-DD/review.json`、`review.md`、`review.csv`。数据库为 `.local/marketing.sqlite3`。同一个 data-dir 有排他锁；并发第二次运行会明确报错，不会同时写入。单批导入先全部验证，再执行事务；无效记录不会留下半批数据。

## 导入格式

顶层是 `{ "items": [], "source_checks": [] }`，两个数组都可省略。完整示例见 `examples/seed.json`。

| 字段 | 规则 |
|---|---|
| `kind` | `content` / `prospect` / `reply` |
| `platform` | 非空，例如 `website`、`rss`、`linkedin_manual` |
| `url` | 来源 HTTPS URL，不带登录凭据 |
| `title`、`text` | 非空；必须来自已收集证据，不能编造 |
| `observed_at` | 带时区的 ISO 时间，例如 `2026-11-20T10:00:00-05:00` |
| `published_at` | 可选带时区时间；新闻以它判断新旧，不能把旧文重抓当新新闻 |
| `signal_at` | 可选的真实事件时间；仅在 evidence 能支持事件日期时填写，不能用重新抓取日期代替 |
| `evidence` | prospect/reply 必填非空数组，每项 `{url, claim, observed_at}` |
| `entity_key` | 强烈建议提供同一机构/联系人的稳定键；默认是规范化来源 URL |
| `language` | `zh` 或 `en`，默认中文 |
| `segment` | 可选的画像标签；只能依据公开业务信号 |
| `offer_hypothesis` | 可选的合作设想；不是已确认能交付的承诺 |
| `fit` | 0–35，业务匹配人工/上游研究判断 |
| `signal` | 0–30，公开需求信号强弱判断 |
| `contactability` | 0–15，公开合作入口是否可用的判断 |
| `contact_url` | 可选公开 HTTPS 联系入口 |
| `incoming_text` | 可选回复原文，保存在本地；规则回复仍是起草提示 |

来源检查项为 `{source_id,url,status,checked_at,detail}`。`status` 仅可为 `ok`、`failed`、`pending`。网络失败、身份待确认、缺少字幕或适配器，应明确记录；不能解释成“今天没有更新”。

上游研究者负责核实事实与评分依据；程序只能验证结构，**不能证明 URL 的事实真实性**。不得用姓名、国籍、语言或族裔推断移民身份、宗教、健康等私人敏感属性；不得把“某国背景”当成个人法律需求。

## 去重、评分和待审状态

- 相同 `kind + platform + 规范化URL + text内容哈希` 只导入一次；追踪参数和 URL fragment 不参与身份。新文本作为新版本保留。
- 同文再次导入，只有显式提供比已存值更晚的 `observed_at`，且记录未发送、未拒联时，才刷新核验元数据：更新 `observed_at`，按规范化 URL + claim 合并 evidence，同一证据保留更新的核验时间。其余字段全部保留，包括 `signal_at`、评分、实体键、首次创建时间和原有状态；不覆盖已有草稿或人工 `reviewed` 状态。旧的 `new` 线索因此可以在重新核验后解除90天过期暂存。相同/更早核验时间不更新；`sent`/`suppressed` 记录始终不更新或重开。导入返回的 `refreshed` 是 `duplicates` 中实际刷新元数据的数量。
- 用 `entity_key` 合并同一线索不同 URL 的接触控制；同一机构只保留一个活跃 cold prospect 草稿。
- 总分 = fit 35 + signal 30 + contactability 15 + recency 20。recency 只看有证据的 `signal_at` 事件日期：距当天 0–7 天加20，8–30天加12，31–90天加4，更旧或未来为0。没有 `signal_at` 时 recency=0，`signal_freshness=unknown`；刚抓到的静态业务页不能当成新需求。`observed_at` 仅用于记录核验时间和90天待复核控制。分值是优先级假设，不证明对方有购买意愿。
- 新闻超过7天、线索/回复超过90天或记录来自未来，暂不生成新草稿；保留 `new` 等待复核。过时的已生成草稿仍在待审队列显示草稿日期与停留天数，发送者应检查时效。
- 生成的草稿只在本地更新为 `draft`；已审为 `reviewed`，已完成外部发送可登记 `sent`。已发送 prospect 的新版本不会重新开启冷触达。
- 无 LLM 接入时，content 是摘要与结构提示；reply 是需结合完整对话重写的 starter；不能把这两者称为已完成的公众号长文或高质量个性化回复。

```sh
PYTHONPATH=src python -m marketing_ops --data-dir .local mark --item-id ITEM_ID --status reviewed
PYTHONPATH=src python -m marketing_ops --data-dir .local mark --item-id ITEM_ID --status sent
PYTHONPATH=src python -m marketing_ops --data-dir .local suppress --entity-key COMPANY_KEY --reason '对方要求不再联系'
```

`suppress` 是持久化 do-not-contact：现有草稿退出报告，以后同一 entity_key 的新内容也受抑制。不提供自动解除抑制入口。收到拒绝联系应立即登记；这版程序不接收任何真实平台 inbox。

## RSS/Atom 收集

config 格式：`{"sources":[{"id":"stable-id","type":"rss","url":"https://...","platform":"rss","enabled":true}]}`。示例 `examples/sources.json` 默认关闭。仅显式启用的 `rss`/`atom` 会联网；未启用来源及其他类型记 `pending`。请求超时20秒，响应限4 MiB，最多处理50条，源正文只作短摘要输入。来源需要有可访问的 HTTPS 文章链接。XML实体声明被拒绝；只接受含 channel 的 RSS 根节点或标准命名空间的 Atom feed，HTML 登录页即使是合法 XML 也记录为采集失败；合法空 feed 可以记录读取成功且0条。公开 URL 不接受本机/私网 IP；跳转会再次检查 URL；此简单收集器不是任意不可信 URL 的通用抓取服务，只配置已核实来源。

collect 的 JSON 结果包含 `failed` 和 `pending` 数量，即使某个来源失败，其他来源可以继续。失败细节写入来源覆盖报告。每个来源最多保留本次50条候选并不表示完整历史覆盖。公众号、X、Threads、YouTube 的搜索、授权字幕和平台 API 需要另外的真实连接器；不能把 RSS 模块当成已经接上所有平台。

## 自动调度与验证

本模块不自建常驻进程，也不声称机器休眠后仍会运行。实际每日执行需要在持久调度器中设置命令，或由 Codex 定时任务收集已核实数据后调用 CLI。调度器应先采集/导入，再 `daily`，最后交付 review 报告；失败记录也要交付。不要把业务数据库、回复原文、访问令牌或会议纪要提交公开 GitHub。

```sh
PYTHONPATH=src python -m unittest discover -s tests -v
```

GitHub CI 只运行离线测试，没有定时采集、发送或发布行为。调度启用与未来执行成功必须由实际调度器返回值验证。
