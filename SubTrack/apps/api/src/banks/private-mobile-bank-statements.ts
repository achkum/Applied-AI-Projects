/** Frozen ST248 trusted purge statements: exact name, text and owner parameters only. */
export const PRIVATE_BANK_PURGE_STATEMENTS = Object.freeze({
  bankPurgeTransactions: `DELETE FROM public.raw_transaction AS rt
USING public.bank_account AS ba,
      public.bank_connection AS bc,
      st248_bank.generation AS bg
WHERE rt.identity_id = $1::uuid
  AND ba.identity_id = $1::uuid
  AND bc.identity_id = $1::uuid
  AND bg.identity_id = $1::uuid
  AND rt.account_id = ba.id
  AND ba.connection_id = bc.id
  AND bg.connection_id = bc.id
  AND bc.id = $2::uuid
  AND bc.provider = 'SYNTHETIC'::public.bank_provider
  AND bc.institution_id = 'synthetic-demo-v1'
  AND bc.status = 'REVOKED'::public.bank_connection_status
  AND bc.revoked_at IS NOT NULL
  AND bg.fixture_version = 'solberg-v1'
  AND bg.purged_at IS NULL
  AND bc.identity_id::text = pg_catalog.current_setting('app.user_id', true)
  AND bc.identity_id::text = pg_catalog.current_setting('app.current_user_id', true)
RETURNING rt.id::text AS id`,
  bankPurgeAccounts: `DELETE FROM public.bank_account AS ba
USING public.bank_connection AS bc,
      st248_bank.generation AS bg
WHERE ba.identity_id = $1::uuid
  AND bc.identity_id = $1::uuid
  AND bg.identity_id = $1::uuid
  AND ba.connection_id = bc.id
  AND bg.connection_id = bc.id
  AND bc.id = $2::uuid
  AND bc.provider = 'SYNTHETIC'::public.bank_provider
  AND bc.institution_id = 'synthetic-demo-v1'
  AND bc.status = 'REVOKED'::public.bank_connection_status
  AND bc.revoked_at IS NOT NULL
  AND bg.fixture_version = 'solberg-v1'
  AND bg.purged_at IS NULL
  AND bc.identity_id::text = pg_catalog.current_setting('app.user_id', true)
  AND bc.identity_id::text = pg_catalog.current_setting('app.current_user_id', true)
RETURNING ba.id::text AS id`,
});

const COLUMNS = `bc.id::text AS connection_id, bc.status::text AS status, bg.purged_at,
 bc.last_synced_at, bc.identity_id::text AS identity_id, bg.fixture_version,
 (SELECT count(*)::int4 FROM public.bank_account ba WHERE ba.connection_id=bc.id AND ba.identity_id=$1::uuid) AS account_count,
 (SELECT count(*)::int4 FROM public.raw_transaction rt JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id WHERE ba.connection_id=bc.id AND rt.identity_id=$1::uuid) AS transaction_count`;
export const PRIVATE_MOBILE_BANK_STATEMENTS = Object.freeze({
 ...PRIVATE_BANK_PURGE_STATEMENTS,
 bankRead: `SELECT ${COLUMNS} FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id WHERE bc.identity_id=$1::uuid AND bc.provider=$2::public.bank_provider AND bc.institution_id=$3::text AND bg.purged_at IS NULL ORDER BY bc.created_at DESC,bc.id DESC LIMIT 51`,
 bankLock: `SELECT ${COLUMNS} FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id WHERE bc.identity_id=$1::uuid AND bc.id=$2::uuid AND bc.provider=$3::public.bank_provider AND bc.institution_id=$4::text FOR UPDATE OF bc,bg`,
 bankActive: `SELECT bc.id::text AS connection_id FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id WHERE bc.identity_id=$1::uuid AND bc.provider=$2::public.bank_provider AND bc.institution_id=$3::text AND bc.status=$4::public.bank_connection_status AND bg.purged_at IS NULL FOR UPDATE OF bc,bg`,
 bankConnect: `INSERT INTO public.bank_connection(id,identity_id,provider,institution_id,institution_name,status,updated_at) VALUES($2::uuid,$1::uuid,$3::public.bank_provider,$4::text,$5::text,$6::public.bank_connection_status,pg_catalog.clock_timestamp()) RETURNING id::text AS id`,
 bankGeneration: `INSERT INTO st248_bank.generation(connection_id,identity_id,fixture_version) VALUES($2::uuid,$1::uuid,$3::text) RETURNING connection_id::text AS id`,
 bankAccountInsert: `INSERT INTO public.bank_account(id,connection_id,identity_id,provider_account_id,name,type,currency,updated_at) VALUES($3::uuid,$2::uuid,$1::uuid,$4::text,$5::text,$6::public.account_type,$7::char(3),pg_catalog.clock_timestamp()) RETURNING id::text AS id`,
 bankAccounts: `SELECT id::text AS id,provider_account_id,name,type::text AS type,currency FROM public.bank_account WHERE identity_id=$1::uuid AND connection_id=$2::uuid ORDER BY id`,
 bankTransactions: `SELECT provider_transaction_id,transaction_date::text,raw_description,amount_minor::text,currency,status::text FROM public.raw_transaction WHERE identity_id=$1::uuid AND account_id=$2::uuid ORDER BY provider_transaction_id`,
 bankTransactionUpsert: `INSERT INTO public.raw_transaction(account_id,identity_id,provider_transaction_id,amount_minor,currency,transaction_date,status,raw_description,is_refund,dedupe_hash,updated_at) VALUES($2::uuid,$1::uuid,$3::text,$4::bigint,$5::char(3),$6::date,$7::public.transaction_status,$8::text,$9::boolean,$10::varchar(64),pg_catalog.clock_timestamp()) ON CONFLICT(account_id,provider_transaction_id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,transaction_date=EXCLUDED.transaction_date,status=EXCLUDED.status,raw_description=EXCLUDED.raw_description,dedupe_hash=EXCLUDED.dedupe_hash,updated_at=EXCLUDED.updated_at WHERE public.raw_transaction.identity_id=$1::uuid RETURNING id::text AS id`,
 bankSynced: `UPDATE public.bank_connection SET last_synced_at=$3::timestamptz,updated_at=pg_catalog.clock_timestamp() WHERE identity_id=$1::uuid AND id=$2::uuid AND status=$4::public.bank_connection_status RETURNING id::text AS id`,
 bankRevoke: `UPDATE public.bank_connection SET status=$3::public.bank_connection_status,revoked_at=COALESCE(revoked_at,pg_catalog.clock_timestamp()),updated_at=pg_catalog.clock_timestamp() WHERE identity_id=$1::uuid AND id=$2::uuid RETURNING id::text AS id`,
 bankPurged: `UPDATE st248_bank.generation SET purged_at=pg_catalog.clock_timestamp() WHERE identity_id=$1::uuid AND connection_id=$2::uuid AND purged_at IS NULL RETURNING connection_id::text AS id`,
 bankReceiptRead: `SELECT request_h,operation,connection_id::text AS connection_id,status,disposition,account_count,transaction_count,last_sync_at FROM st248_bank.receipt WHERE identity_id=$1::uuid AND key_h=$2::bytea`,
 bankReceiptInsert: `INSERT INTO st248_bank.receipt(identity_id,key_h,request_h,operation,connection_id,status,disposition,account_count,transaction_count,last_sync_at) VALUES($1::uuid,$2::bytea,$3::bytea,$4::text,$5::uuid,$6::text,$7::text,$8::int4,$9::int4,$10::timestamptz) RETURNING connection_id::text AS id`,
});
