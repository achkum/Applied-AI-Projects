import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(packageRoot, 'node_modules', '.bin', name);

function run(name, args) {
  return spawnSync(bin(name), args, { cwd: packageRoot, encoding: 'utf8' });
}

function artifacts(directory) {
  const root = join(packageRoot, directory);
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.name.endsWith('.ts')) files.push(child);
    }
  }
  visit(root);
  return Object.fromEntries(
    files
      .sort()
      .map((file) => [
        relative(root, file),
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ]),
  );
}

test('production and fixture generation remain stable on a second run', () => {
  for (const [config, output] of [
    ['openapi-ts.config.mjs', 'generated'],
    ['openapi-ts.fixture.config.mjs', 'fixtures/generated'],
  ]) {
    const args = ['-f', `./${config}`, '--no-log-file'];
    const first = run('openapi-ts', args);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const snapshot = artifacts(output);
    assert.ok(
      Object.keys(snapshot).length > 0,
      `${output} must contain generated TypeScript`,
    );
    const second = run('openapi-ts', args);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(
      artifacts(output),
      snapshot,
      `${output} changed on repeat generation`,
    );
  }
});

test('validator accepts production source and rejects malformed OpenAPI with a diagnostic', () => {
  const valid = run('redocly', ['lint', 'openapi.yaml', '--extends=spec']);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  const directory = mkdtempSync(join(tmpdir(), 'st-006-invalid-'));
  try {
    const malformed = join(directory, 'malformed.yaml');
    writeFileSync(malformed, 'openapi: [invalid\npaths:\n');
    const invalid = run('redocly', ['lint', malformed, '--extends=spec']);
    assert.notEqual(
      invalid.status,
      0,
      'malformed OpenAPI must fail validation',
    );
    assert.match(
      `${invalid.stdout}\n${invalid.stderr}`,
      /error|invalid|unexpected|parse/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production contract preserves approved operational and privacy routes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'st-006-bundle-'));
  try {
    const bundled = join(directory, 'openapi.json');
    const result = run('redocly', [
      'bundle',
      'openapi.yaml',
      '--output',
      bundled,
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const document = JSON.parse(readFileSync(bundled, 'utf8'));
    const routes = Object.entries(document.paths ?? {}).flatMap(
      ([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );
    // Accepted deb58ea wire baseline plus reviewed ADR-0018 default availability exception.
    // Preserve the complete legacy semantic snapshot, including its availability documentation.
    const legacyNames = ["HealthResponse", "ReadinessResponse", "VersionResponse", "SetOpenBookBody", "ConsentSetting", "SubscriptionSummary", "ExportJobResponse", "DeleteAccountBody", "Problem"];
    const canonical = (value) => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value;
    const legacy = {
      paths: Object.fromEntries(Object.entries(document.paths).filter(([path]) => !path.startsWith('/v2/'))),
      schemas: Object.fromEntries(legacyNames.map((name) => [name, document.components.schemas[name]])),
      responses: { Problem: document.components.responses.Problem },
    };
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(legacy))).digest('hex'),
      '96279f7efc409e34fd221f072b1d8b342812ca455e1c9f5ad0b330ca3294adee',
      'accepted v1 and operational contracts plus ADR-0018 availability must remain semantically unchanged');

    assert.equal(document.info.version, '1.1.1');
    const availability = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item).filter(([, operation]) => operation && typeof operation === 'object'
        && Object.hasOwn(operation, 'x-runtime-availability'))
        .map(([method, operation]) => [`${method.toUpperCase()} ${path}`, operation['x-runtime-availability']]),
    );
    assert.deepEqual(availability.sort(([left], [right]) => left.localeCompare(right)), [
      ['DELETE /v1/data-rights/account', 'unavailable-default'],
      ['GET /v1/data-rights/export/{token}', 'unavailable-default'],
      ['GET /v1/privacy/preview-as/{householdId}', 'unavailable-default'],
      ['GET /v1/privacy/settings', 'unavailable-default'],
      ['PATCH /v1/privacy/open-book', 'unavailable-default'],
      ['POST /v1/data-rights/export', 'unavailable-default'],
    ]);

    assert.deepEqual(routes.filter((route) => !route.includes('/v2/')).sort(), [
      'DELETE /v1/data-rights/account',
      'GET /healthz',
      'GET /readyz',
      'GET /v1/data-rights/export/{token}',
      'GET /v1/privacy/preview-as/{householdId}',
      'GET /v1/privacy/settings',
      'GET /v1/version',
      'PATCH /v1/privacy/open-book',
      'POST /v1/data-rights/export',
    ]);
    assert.deepEqual(Object.keys(document.components?.schemas ?? {}).filter((name) => ['ConsentSetting', 'DeleteAccountBody', 'ExportJobResponse', 'HealthResponse', 'Problem', 'ReadinessResponse', 'SetOpenBookBody', 'SubscriptionSummary', 'VersionResponse'].includes(name)).sort(), [
      'ConsentSetting',
      'DeleteAccountBody',
      'ExportJobResponse',
      'HealthResponse',
      'Problem',
      'ReadinessResponse',
      'SetOpenBookBody',
      'SubscriptionSummary',
      'VersionResponse',
    ]);
    assert.deepEqual(Object.keys(document.components?.responses ?? {}).filter((name) => name === 'Problem'), ['Problem']);
    for (const [path, schema, status] of [
      ['/healthz', 'HealthResponse', 'ok'],
      ['/readyz', 'ReadinessResponse', 'ready'],
      ['/v1/version', 'VersionResponse', undefined],
    ]) {
      const responses = document.paths[path].get.responses;
      assert.deepEqual(Object.keys(responses), ['200', 'default']);
      assert.deepEqual(responses['200'].content?.['application/json']?.schema, {
        $ref: `#/components/schemas/${schema}`,
      });
      assert.deepEqual(responses.default, {
        $ref: '#/components/responses/Problem',
      });
      const responseSchema = document.components.schemas[schema];
      assert.deepEqual(responseSchema.required, [status ? 'status' : 'version']);
      assert.equal(responseSchema.additionalProperties, false);
      if (status) {
        assert.equal(responseSchema.properties.status.const, status);
      } else {
        assert.equal(responseSchema.properties.version.type, 'string');
      }
    }
    const jsonResponseSchema = (path, method, status = '200') =>
      document.paths[path][method].responses[status].content['application/json'].schema;
    assert.deepEqual(
      jsonResponseSchema('/v1/privacy/settings', 'get'),
      { type: 'array', items: { $ref: '#/components/schemas/ConsentSetting' } },
    );
    assert.deepEqual(
      jsonResponseSchema('/v1/privacy/open-book', 'patch'),
      { $ref: '#/components/schemas/ConsentSetting' },
    );
    assert.deepEqual(
      jsonResponseSchema('/v1/privacy/preview-as/{householdId}', 'get'),
      { type: 'array', items: { $ref: '#/components/schemas/SubscriptionSummary' } },
    );
    assert.deepEqual(
      document.components.schemas.SubscriptionSummary.properties.customName.type,
      ['string', 'null'],
    );
    assert.equal(
      document.components.schemas.SubscriptionSummary.required.includes('customName'),
      false,
      'customName remains optional while allowing an explicit null',
    );
    assert.deepEqual(
      jsonResponseSchema('/v1/data-rights/export', 'post', '202'),
      { $ref: '#/components/schemas/ExportJobResponse' },
    );
    assert.deepEqual(
      document.paths['/v1/data-rights/export/{token}'].get.responses['200'].content['application/zip'].schema,
      { type: 'string', format: 'binary' },
    );
    assert.deepEqual(
      Object.keys(document.paths['/v1/data-rights/account'].delete.responses),
      ['204', '400', '401', '403', '404', 'default'],
    );
    assert.deepEqual(document.components.responses.Problem.content?.['application/problem+json']?.schema, {
      $ref: '#/components/schemas/Problem',
    });
    assert.deepEqual(document.components.schemas.Problem.required, ['type', 'title', 'status']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
