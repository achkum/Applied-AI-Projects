import {createServer} from 'node:http';
import {Pool} from 'pg';
import {loadSandboxConfig} from './sandbox-config.js';
import {SandboxToken} from './sandbox-token.js';
import {SandboxAuthority} from './sandbox-authority.js';
import {SandboxSession} from './sandbox-session.js';
import {createSandboxHttp} from './sandbox-http.js';
export async function startSandbox(){const config=await loadSandboxConfig(process.env),pool=new Pool(config.database);pool.on('error',()=>{/* Pool discards broken idle clients; never print database error details. */});try{const tokens=new SandboxToken(config.privateKey,config.publicKey,Date.now),authority=new SandboxAuthority(pool,tokens,config);await authority.verifyStartup();const http=createSandboxHttp(authority,new SandboxSession(authority)),server=createServer({maxHeaderSize:8192},(request,response)=>{void http.handle(request,response);});server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=32;await new Promise<void>((ok,no)=>{server.once('error',no);server.listen(4000,'0.0.0.0',()=>{server.removeListener('error',no);ok();});});return Object.freeze({close:async()=>{await new Promise<void>((ok,no)=>server.close(error=>error?no(error):ok()));await pool.end();}});}catch(error){await pool.end();throw error;}}
if(require.main===module)void startSandbox().catch(()=>{process.stderr.write('Sandbox startup unavailable\n');process.exitCode=1;});
