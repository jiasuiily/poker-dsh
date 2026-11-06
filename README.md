# 德州扑克网页版（poker-dsh）

支持电脑与手机的网页版德州扑克，单桌人机对战 + 牌谱回放 + 复盘分析。虚拟货币，按国际比赛现金局规则结算。

## 功能

- **多人登录**：用户名 + 密码 + 邀请码（`@poker/auth`，scrypt 哈希，HS256 JWT 会话）
- **电脑玩家**：初级 / 高级 / 顶级三档难度，每种含五种风格（紧凶 / 松凶 / 岩石 / 跟注站 / 疯子）
- **牌谱回放**：每手完整牌序 + 公开动作日志，可逐步回放，观战者看不到任何底牌，摊牌后只亮已亮牌
- **复盘分析**：近似 GTO 决策评估（翻前查表 + 翻后 EV），标出失误（EV 损失 bb），可接入大模型生成中文解说
- **虚拟货币**：钱包复式记账 + 桌面托管（买入/结算/每日赠送）

## 架构（pnpm monorepo）

| 包 | 职责 |
|---|---|
| `@poker/core` | 引擎：GameState、动作、发牌/摊牌、侧池、投影视图、回放帧 |
| `@poker/strategy` | 近似 GTO：169 起手类别、范围解析、位置、翻前表、蒙特卡洛胜率、决策评估 |
| `@poker/ai` | 电脑玩家：五种风格 + 初级（风格缩放）+ 高级（策略驱动）+ 顶级（对手建模） |
| `@poker/wallet` | 复式记账 + 托管（纯领域逻辑） |
| `@poker/auth` | 注册/登录（纯领域逻辑，scrypt + 邀请码） |
| `@poker/llm` | LLM Provider + 人格层（台词/解说，含底牌过滤） |
| `@poker/storage` | node:sqlite 持久层（钱包账本，历史遗留） |
| `@poker/server` | Colyseus 牌桌 + Drizzle/PGlite 存储 + HTTP API |
| `@poker/web` | React 前端（登录、牌桌、牌谱回放、复盘分析） |

## 数据流

- 事件溯源：一手牌 = 完整初始牌序（`initialDeck`，52 张）+ 公开动作日志（`log`）
- 回放：`buildReplayFrames(config, initialDeck, log, viewerSeat)` 逐步重放，投影到观看者视角
- 分析：`analyzeHand(...)` 提取主角决策点，`evaluateDecision` 按翻前表 / 翻后 EV 给出判定
- 持久化：`hands` 表存 config/initialDeck/log/result（jsonb），`hand_analyses` 缓存判定 + 解说

## 快速开始

```bash
# 依赖（Node ≥ 20，pnpm 11）
pnpm install

# 启动服务端（Colyseus ws://localhost:2568 + HTTP API :8081 + 静态站点 :8080）
pnpm --filter @poker/server start

# 开发模式前端（Vite :5173）
pnpm --filter @poker/web dev

# 生产前端构建（构建产物由服务端 :8080 托管）
pnpm --filter @poker/web build
```

浏览器打开 `http://localhost:5173`（开发）或 `http://localhost:8080`（生产）。默认邀请码 `POKER-DEMO`（无限次）。

## 测试与验收

```bash
pnpm test            # 全仓单元测试（约 118 项）
pnpm typecheck       # 全仓类型检查
pnpm sim:ai 20000    # 高级 vs 初级 2 万手，bb/100 + 95% 置信区间
```

## 多实例（本机同时跑两个互不干扰的实例）

每个实例独占一组端口和一个数据目录；前端地址可用环境变量覆盖。

| 实例 | 游戏 WS | HTTP API | 前端 | 数据目录 |
|---|---|---|---|---|
| 手动测试 | 2568 | 8081 | 5173 | `packages/server/data/pglite` |
| agent 测试 | 2578 | 8088 | 5176 | `packages/server/data/pglite-agent` |

```bash
# 手动测试
pnpm --filter @poker/server start
pnpm --filter @poker/web dev            # http://localhost:5173

# agent 测试（与上互不干扰）
PORT=2578 API_PORT=8088 PGLITE_DIR=data/pglite-agent pnpm --filter @poker/server start
VITE_API_URL=http://localhost:8088 VITE_WS_URL=ws://localhost:2578 pnpm --filter @poker/web dev --port 5176
```

服务端对 PGlite 数据目录有启动锁：同一目录被两个进程打开时，后启动者会报「数据库目录正被进程 N 使用」并退出，避免写坏数据。

## 环境变量（服务端）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `2568` | Colyseus WebSocket 端口 |
| `API_PORT` | `8081` | HTTP API 端口（认证 + 牌谱） |
| `WEB_PORT` | `8080` | 静态站点端口 |
| `PGLITE_DIR` | `data/pglite` | PGlite 数据目录（未设 `DATABASE_URL` 时） |
| `DATABASE_URL` | — | 设置后改用 PostgreSQL（pg） |
| `JWT_SECRET` | `dev-secret` | 登录会话签名密钥 |
| `LLM_API_KEY` | — | 设置后用真实大模型做解说（OpenAI 兼容） |
| `LLM_BASE_URL` | DeepSeek | 大模型接口地址 |
| `LLM_MODEL` | `deepseek-chat` | 模型名 |

## 环境变量（前端）

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_API_URL` | `http://<host>:8081` | HTTP API 地址 |
| `VITE_WS_URL` | `ws://<host>:2568` | Colyseus WebSocket 地址 |
