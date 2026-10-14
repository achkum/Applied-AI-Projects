// Expo SDK51 --localhost advertises localhost but does not supply a listen host.
// This preload exists only in the owned proof Metro process, never app bundles.
import process from 'node:process';
import { Server } from 'node:net';
if (process.env.SUBTRACK_PRIVATE_DEVICE_PROOF !== 'true')
  throw new Error('Private loopback preload requires explicit proof mode');
const originalListen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === 'object' && Number(args[0].port) === 8081) {
    args[0] = { ...args[0], host: '127.0.0.1' };
  } else if (Number(args[0]) === 8081) {
    if (typeof args[1] === 'function') args.splice(1, 0, '127.0.0.1');
    else args[1] = '127.0.0.1';
  }
  return originalListen.apply(this, args);
};
