import type { Bot, BotLevel } from './types';
import { makeBeginnerBot } from './beginner';
import { makeAdvancedBot } from './advanced';
import { BOT_STYLES, type StyleId } from './styles';

const botCache = new Map<string, Bot>();

export function getBot(level: BotLevel, style: StyleId): Bot {
  const key = `${level}:${style}`;
  let bot = botCache.get(key);
  if (!bot) {
    bot = level === 'beginner' ? makeBeginnerBot(BOT_STYLES[style]) : makeAdvancedBot(BOT_STYLES[style]);
    botCache.set(key, bot);
  }
  return bot;
}

// 兼容旧调用：beginnerBot = makeBeginnerBot(tag)
export const beginnerBot = makeBeginnerBot(BOT_STYLES.tag);
export const decideBeginner = beginnerBot.decide;

export * from './types';
export * from './styles';
export * from './stats';
export * from './beginner';
export * from './advanced';
export * from './top';
