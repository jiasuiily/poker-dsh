import { pgTable, text, integer, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  username: text('username').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const inviteCodes = pgTable('invite_codes', {
  code: text('code').primaryKey(),
  remaining: integer('remaining').notNull(),
});

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(),
    refId: text('ref_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('txn_type_ref').on(t.type, t.refId)],
);

export const ledgerEntries = pgTable('ledger_entries', {
  id: serial('id').primaryKey(),
  transactionId: integer('transaction_id')
    .notNull()
    .references(() => transactions.id),
  accountId: text('account_id').notNull(),
  amount: integer('amount').notNull(),
});
