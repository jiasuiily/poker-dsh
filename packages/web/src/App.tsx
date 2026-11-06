import { useEffect, useRef, useState } from 'react';
import { Client, type Room } from 'colyseus.js';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];
function cardName(c: number) {
  return RANKS[c % 13] + SUITS[Math.floor(c / 13)];
}

function actionText(a: { kind: string; to?: number; allIn?: boolean }): string {
  if (a.allIn) return `全下${a.to !== undefined ? ` ${a.to}` : ''}`;
  switch (a.kind) {
    case 'fold':
      return '弃牌';
    case 'check':
      return '过牌';
    case 'call':
      return '跟注';
    case 'bet':
      return `下注 ${a.to}`;
    case 'raise':
      return `加注到 ${a.to}`;
    default:
      return a.kind;
  }
}

interface PubPlayer {
  seat: number;
  id: string;
  stack: number;
  streetBet: number;
  committed: number;
  status: string;
}
interface PubState {
  handId: string;
  street: string;
  board: number[];
  pot: number;
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  currentSeat: number;
  highestBet: number;
  minRaiseIncrement: number;
  phase: string;
  wallet: number;
  winners: { seat: number; amount: number }[];
  showdown: { seat: number; holeCards: number[]; rank: { category: number; tiebreakers: number[] } }[] | null;
  players: PubPlayer[];
  history: { seq: number; street: string; seat: number; kind: string; to: number; allIn: boolean }[];
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function App() {
  const [state, setState] = useState<PubState | null>(null);
  const [mine, setMine] = useState<{ seat: number; holeCards: number[] } | null>(null);
  const [status, setStatus] = useState('连接中…');
  const [chat, setChat] = useState<{ seat: number; line: string } | null>(null);
  const [difficulty, setDifficulty] = useState<'beginner' | 'advanced' | 'top'>('advanced');
  const [betAmount, setBetAmount] = useState(0);
  const [autoAction, setAutoAction] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const autoActionRef = useRef(autoAction);
  autoActionRef.current = autoAction;
  const mineRef = useRef(mine);
  mineRef.current = mine;

  useEffect(() => {
    let disposed = false;
    const client = new Client(`ws://${window.location.hostname}:2568`);
    (async () => {
      try {
        const room = await client.joinOrCreate('table', { difficulty });
        if (disposed) {
          room.leave();
          return;
        }
        roomRef.current = room;
        setStatus('已连接');
        room.onMessage('state', (sRaw) => {
          const s = sRaw as PubState;
          setState(s);
          const m = mineRef.current;
          if (autoActionRef.current && s.phase === 'betting' && m && s.currentSeat === m.seat) {
            const me = s.players.find((p) => p.seat === m.seat)!;
            const toCall = s.highestBet - me.streetBet;
            room.send('act', toCall === 0 ? { type: 'check' } : { type: 'fold' });
          }
        });
        room.onMessage('private', (p) => setMine(p as { seat: number; holeCards: number[] }));
        room.onMessage('chat', (c) => setChat(c as { seat: number; line: string }));
        room.onLeave(() => setStatus('已断开'));
      } catch (e) {
        setStatus(`连接失败：${(e as Error).message}`);
      }
    })();
    return () => {
      disposed = true;
      roomRef.current?.leave();
    };
  }, [difficulty]);

  const me = state && mine ? state.players.find((p) => p.seat === mine.seat) : null;
  const toCall = state && me ? state.highestBet - me.streetBet : 0;
  const myTurn = !!state && state.phase === 'betting' && state.currentSeat === mine?.seat;

  const send = (action: unknown) => roomRef.current?.send('act', action);

  // 下注/加注范围
  const minAmount = me
    ? toCall === 0
      ? Math.min(state!.bigBlind, me.stack)
      : state!.highestBet + state!.minRaiseIncrement
    : 0;
  const maxAmount = me ? (toCall === 0 ? me.stack : me.stack + me.streetBet) : 0;

  const potFraction = (frac: number) => {
    if (!me || !state) return;
    const base = Math.floor(state.pot * frac);
    const v = toCall === 0 ? base : state.highestBet + base;
    setBetAmount(clamp(v, minAmount, maxAmount));
  };

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <h1 style={{ margin: 0, fontSize: 18 }}>德州扑克 · 单桌人机对战</h1>
        <div style={styles.controls}>
          <label>
            AI 难度：
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'beginner' | 'advanced' | 'top')}
            >
              <option value="beginner">初级</option>
              <option value="advanced">高级</option>
              <option value="top">顶级</option>
            </select>
          </label>
          <label style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={autoAction} onChange={(e) => setAutoAction(e.target.checked)} />
            自动过牌/弃牌
          </label>
        </div>
        <div style={{ color: '#666', fontSize: 12 }}>
          状态：{status}
          {state && <span style={{ marginLeft: 8, fontWeight: 'bold' }}>钱包余额：{state.wallet}</span>}
        </div>
        {chat && (
          <div style={styles.chat}>💬 座位{chat.seat}：{chat.line}</div>
        )}
      </header>

      {state && (
        <main>
          <div style={styles.boardRow}>
            <div style={styles.info}>
              阶段 <b>{state.street}</b> · 底池 <b>{state.pot}</b> · 盲注 {state.smallBlind}/{state.bigBlind}
            </div>
            <div style={styles.board}>
              {state.board.length === 0 ? '（未发公共牌）' : state.board.map((c, i) => <Card key={i} c={c} />)}
            </div>
          </div>

          {mine && (
            <div style={styles.mine}>
              我的底牌：{mine.holeCards.map((c, i) => <Card key={i} c={c} />)}
              {toCall > 0 && <span style={{ marginLeft: 8, fontWeight: 'bold' }}>需跟注 {toCall}</span>}
            </div>
          )}

          <div style={styles.players}>
            {state.players.map((p) => {
              const isTurn = p.seat === state.currentSeat && state.phase === 'betting';
              return (
                <div
                  key={p.seat}
                  style={{ ...styles.player, background: isTurn ? '#fff3c4' : '#f7f7f7' }}
                >
                  <span>
                    座位 {p.seat}
                    {p.seat === mine?.seat ? '（我）' : ''}
                    {p.seat === state.buttonSeat ? ' Ⓓ' : ''}
                  </span>
                  <span>{p.status === 'folded' ? '已弃牌' : `${p.stack} 筹码`}</span>
                  <span>{p.streetBet > 0 ? `本街 ${p.streetBet}` : ''}</span>
                </div>
              );
            })}
          </div>

          {state.phase === 'complete' && (
            <div style={styles.result}>
              <b>本手结束</b> · 赢家：{state.winners.map((w) => `座位${w.seat} +${w.amount}`).join('，')}
              {state.showdown && (
                <div style={{ marginTop: 4, fontSize: 14 }}>
                  {state.showdown.map((s) => (
                    <div key={s.seat}>
                      座位 {s.seat}：{s.holeCards.map(cardName).join(' ')}
                    </div>
                  ))}
                </div>
              )}
              <button style={styles.btn} onClick={() => roomRef.current?.send('new_hand')}>
                再来一手
              </button>
            </div>
          )}

          {state.history && state.history.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14 }}>牌谱（{state.history.length} 手动作）</summary>
              <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13, background: '#fafafa', padding: 8, borderRadius: 6 }}>
                {state.history.map((h, i) => (
                  <div key={i}>
                    [{h.street}] 座位{h.seat}：{actionText(h)}
                  </div>
                ))}
              </div>
            </details>
          )}

          {myTurn && me && state && (
            <div style={styles.actions}>
              <div style={{ width: '100%', marginBottom: 4 }}>
                <input
                  type="range"
                  min={minAmount}
                  max={maxAmount}
                  step={1}
                  value={clamp(betAmount || minAmount, minAmount, maxAmount)}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, textAlign: 'center' }}>
                  下注额：{clamp(betAmount || minAmount, minAmount, maxAmount)}
                </div>
              </div>

              <div style={styles.btnRow}>
                <button style={styles.btn} onClick={() => send({ type: 'fold' })}>弃牌</button>
                {toCall === 0 ? (
                  <button style={styles.btn} onClick={() => send({ type: 'check' })}>过牌</button>
                ) : (
                  <button style={styles.btn} onClick={() => send({ type: 'call' })}>
                    跟注 {Math.min(toCall, me.stack)}
                  </button>
                )}
              </div>

              <div style={styles.btnRow}>
                {[0.5, 2 / 3, 1].map((f) => (
                  <button key={f} style={styles.btnSm} onClick={() => potFraction(f)}>
                    {f === 0.5 ? '1/2池' : f === 1 ? '满池' : '2/3池'}
                  </button>
                ))}
                <button style={styles.btnSm} onClick={() => setBetAmount(maxAmount)}>全下</button>
              </div>

              <div style={styles.btnRow}>
                {toCall === 0 ? (
                  <button
                    style={{ ...styles.btn, flex: 1 }}
                    disabled={me.stack < minAmount}
                    onClick={() => send({ type: 'bet', amount: clamp(betAmount || minAmount, minAmount, maxAmount) })}
                  >
                    下注
                  </button>
                ) : (
                  <button
                    style={{ ...styles.btn, flex: 1 }}
                    disabled={me.stack + me.streetBet < minAmount}
                    onClick={() => send({ type: 'raise', amount: clamp(betAmount || minAmount, minAmount, maxAmount) })}
                  >
                    加注到 {clamp(betAmount || minAmount, minAmount, maxAmount)}
                  </button>
                )}
                <button style={styles.btn} onClick={() => send({ type: 'allin' })}>全下</button>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 560,
    margin: '0 auto',
    padding: '12px 12px 24px',
    color: '#222',
  },
  header: { marginBottom: 12 },
  controls: { margin: '6px 0', fontSize: 14 },
  chat: {
    marginTop: 6,
    padding: '8px 10px',
    background: '#fffbe6',
    borderRadius: 6,
    fontSize: 14,
  },
  boardRow: { marginBottom: 12 },
  info: { fontSize: 14, marginBottom: 4 },
  board: { minHeight: 34, fontSize: 20 },
  mine: { marginBottom: 12, fontSize: 18 },
  players: { display: 'flex', flexDirection: 'column', gap: 6 },
  player: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 15,
  },
  result: { marginTop: 14, padding: 10, background: '#eafbea', borderRadius: 6, fontSize: 15 },
  actions: {
    position: 'sticky',
    bottom: 0,
    marginTop: 14,
    padding: 12,
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
  },
  btnRow: { display: 'flex', gap: 8, marginBottom: 8 },
  btn: {
    flex: 1,
    padding: '12px 0',
    fontSize: 16,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  },
  btnSm: {
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fafafa',
    cursor: 'pointer',
  },
};

function Card({ c }: { c: number }) {
  return <span style={{ fontSize: 24, margin: 2 }}>{cardName(c)}</span>;
}
