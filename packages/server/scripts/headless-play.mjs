// 无头端到端测试：连上 Colyseus 房间，人类自动行动，验证能完整打完一手牌。
import { Client } from 'colyseus.js';

const client = new Client('ws://localhost:2568');
const room = await client.joinOrCreate('table', { difficulty: process.env.DIFF ?? 'advanced' });

let done = false;
let humanActed = 0;

room.onMessage('private', (p) => {
  console.log(`[private] 我的底牌 = [${p.holeCards.join(', ')}]`);
});

room.onMessage('chat', (c) => {
  console.log(`[chat] 座位${c.seat}: ${c.line}`);
});

room.onMessage('state', (s) => {
  console.log(
    `[state] street=${s.street} seat=${s.currentSeat} phase=${s.phase} pot=${s.pot} board=[${s.board.join(',')}]`,
  );
  if (s.phase === 'complete') {
    console.log('✅ 一手牌打完，winners =', JSON.stringify(s.winners));
    console.log('结算后玩家筹码 =', JSON.stringify(s.players.map((p) => [p.seat, p.stack])));
    done = true;
    room.leave();
    process.exit(0);
  }
  if (s.phase === 'betting' && s.currentSeat === 0) {
    const me = s.players[0];
    const toCall = s.highestBet - me.streetBet;
    const action =
      toCall === 0 ? { type: 'check' } : Math.random() < 0.25 ? { type: 'fold' } : { type: 'call' };
    humanActed++;
    setTimeout(() => room.send('act', action), 200);
  }
});

setTimeout(() => {
  if (!done) {
    console.error('❌ 超时未打完一手牌');
    process.exit(1);
  }
}, 90000);
