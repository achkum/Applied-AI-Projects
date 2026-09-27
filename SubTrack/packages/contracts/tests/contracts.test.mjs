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

test('production contract contains exactly the approved Ops routes and response schemas', () => {
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
    assert.deepEqual(routes.sort(), [
      'GET /healthz',
      'GET /readyz',
      'GET /v1/version',
    ]);
    assert.deepEqual(Object.keys(document.components?.schemas ?? {}).sort(), [
      'HealthResponse',
      'Problem',
      'ReadinessResponse',
      'VersionResponse',
    ]);
    assert.deepEqual(Object.keys(document.components?.responses ?? {}), ['Problem']);
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
    assert.deepEqual(document.components.responses.Problem.content?.['application/problem+json']?.schema, {
      $ref: '#/components/schemas/Problem',
    });
    assert.deepEqual(document.components.schemas.Problem.required, ['type', 'title', 'status']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
