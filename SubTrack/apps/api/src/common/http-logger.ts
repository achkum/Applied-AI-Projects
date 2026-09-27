import pinoHttp, { type Options } from 'pino-http';

export const httpLoggerOptions: Options = {
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.set-cookie',
      'req.headers.x-api-key',
      'req.body',
      'res.headers.set-cookie',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req(request) {
      const req = request as typeof request & { route?: { path?: string } };
      return {
        id: request.id,
        method: request.method,
        route: req.route?.path,
      };
    },
    res(response) {
      return { statusCode: response.statusCode };
    },
  },
  customProps: () => ({ component: 'api' }),
  quietReqLogger: true,
  autoLogging: true,
};

export const httpLogger = pinoHttp(httpLoggerOptions);
