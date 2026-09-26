import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, createSession, sessionDigest } from "../src/auth/credentials.js";
import { MockBankProvider } from "../src/providers/mock-bank-provider.js";
import { AuditService, type AuditEvent } from "../src/domain/audit.js";
import { ConsentService, type ConsentRecord } from "../src/domain/consent.js";

test("password and opaque session primitives", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  const secret = "x".repeat(32), session = createSession(secret);
  assert.equal(sessionDigest(session.token, secret), session.digest);
  assert.notEqual(session.token, session.digest);
});
test("mock bank fixtures are deterministic and date filtered", async () => {
  const provider = new MockBankProvider();
  const connection = await provider.connect({ userId: "u1", authorizationCode: "fixture" });
  const [account] = await provider.listAccounts(connection.id);
  assert.ok(account);
  const rows = await provider.listTransactions(connection.id, { accountId: account.id, from: "2025-02-01", to: "2025-02-28T23:59:59Z" });
  assert.deepEqual(rows.map(row => row.id), ["txn-netflix-feb", "txn-spotify-feb"]);
  rows[0]!.description = "mutated";
  const again = await provider.listTransactions(connection.id, { accountId: account.id, from: "2025-02-01", to: "2025-02-28T23:59:59Z" });
  assert.equal(again[0]!.description, "NETFLIX.COM");
});
test("audit chain and consent history are append-only through services", async () => {
  const audits: AuditEvent[] = [];
  const audit = new AuditService({ last: async () => audits.at(-1), append: async e => { audits.push(e); } }, () => new Date("2025-01-01T00:00:00Z"));
  const first = await audit.record({ actorId: "u1", action: "consent.granted", subjectType: "consent", subjectId: "c1" });
  const second = await audit.record({ actorId: "u1", action: "bank.connected", subjectType: "connection", subjectId: "b1" });
  assert.equal(second.previousHash, first.hash);
  const consents: ConsentRecord[] = [];
  const service = new ConsentService({ append: async r => { consents.push(r); }, latest: async (u, p) => consents.filter(c => c.userId === u && c.purpose === p).at(-1) }, () => new Date("2025-01-01T00:00:00Z"));
  await service.grant("u1", "bank_data_read", "v1");
  await service.revoke("u1", "bank_data_read");
  assert.equal(consents.length, 2); assert.ok(consents[1]!.revokedAt);
});
