import { DynamicModule, Module } from '@nestjs/common';
import { BrowserNonceHttpController, BrowserNonceHttpService } from './browser-nonce-http.js';

export type BrowserNonceHttpConfig = Readonly<{
  origins: readonly string[]; cookieName: string; cookiePath: string; allowLoopbackHttp: boolean;
  idempotencyKey: Uint8Array; originKey: Uint8Array;
}>;

@Module({})
export class BrowserNonceHttpModule {
  static register(config: BrowserNonceHttpConfig): DynamicModule {
    return { module: BrowserNonceHttpModule, controllers: [BrowserNonceHttpController], providers: [{ provide: BrowserNonceHttpService, useValue: new BrowserNonceHttpService(config) }] };
  }
}
