/* global __dirname, module, require */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest 29 loads custom resolvers as CommonJS; this imports only Node path.
const path = require('node:path');

const packageSources = [
  path.resolve(__dirname, '../../packages/money/src'),
  path.resolve(__dirname, '../../packages/synthetic/src'),
];

function isInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

module.exports = (request, options) => {
  if (request === '@subtrack/money' || request === '@subtrack/synthetic') {
    return options.defaultResolver(request, {
      ...options,
      conditions: [...new Set([...(options.conditions ?? []), 'import'])],
    });
  }

  try {
    return options.defaultResolver(request, options);
  } catch (error) {
    if (!request.endsWith('.js') || (!request.startsWith('./') && !request.startsWith('../'))) {
      throw error;
    }
    const basedir = path.resolve(options.basedir);
    if (!packageSources.some((source) => isInside(source, basedir))) throw error;
    return options.defaultResolver(`${request.slice(0, -3)}.ts`, options);
  }
};
