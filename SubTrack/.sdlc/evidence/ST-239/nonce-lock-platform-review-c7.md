# C7 nonce lock platform review — source APPROVE, qualified proof pending

- Reviewed exact SQL012 `7c8530ff55e307e83dd08220daf9064e07df83f283ce3a5428beaefe90d714e2`, launcher `6a1dee41ba72fa8fbd43cce393386972a2fc70e36e9049ccbbb880d619c82bad`, integration `9d8573efe6f24d90d08e6644de690d0ce2a7aa85ef5a63f449fa081cefc96e53` (SHA256).
- SQL012 adds only executor `UPDATE(nonce_h)` and nonce UPDATE RLS `USING (true) WITH CHECK (false)`; existing `FOR UPDATE` in `issue_login` and `login_material`, nonce consume, function grants, and SQL001–011 remain intact.
- Launcher pins the amended SQL hash, exact 48-policy catalog roster including false nonce check, and only the nonce_h UPDATE column ACL; schema/role behavior otherwise unchanged.
- Qualified PG test now requires executor nonce lock, denies no-op nonce UPDATE with 42501, denies runtime/producer UPDATE, witnesses both material call sites and successful redemption, then retains one-use, replay, rollback, burn, and concurrent redeem cases.
- Author reports focused API tsc, ESLint, launcher node syntax, and scoped diff checks PASS; local PG unavailable, so no qualified runtime PASS or denied-object proof yet.
- Source review APPROVE for the private Type 2a candidate only. Security review and qualified PG16 plus natural four-variant browser proof remain release gates; C6 marker alone remains a candidate diagnosis.
