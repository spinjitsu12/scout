if (process.platform !== 'linux') throw new Error('This fixture is Linux-only. Use the native Mac smoke script on Apple silicon.');
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const here=import.meta.dirname, output=path.resolve(here,'../qa301');
await fs.mkdir(output,{recursive:true});
const reopen=process.env.SCOUT_LINUX_QA_REOPEN==='1';
const profile=reopen?JSON.parse(await fs.readFile(path.join(output,'native-linux-profile.json'),'utf8')).profile:await fs.mkdtemp(path.join(os.tmpdir(),'scout301-native-linux-'));
if(!reopen)await fs.writeFile(path.join(output,'native-linux-profile.json'),JSON.stringify({profile},null,2));
const binary=path.resolve(here,'../../../../node_modules/electron/dist/electron');
const child=spawn(binary,[here,'--no-sandbox','--ozone-platform=headless','--use-angle=swiftshader','--enable-unsafe-swiftshader'],{env:{...process.env,SCOUT_LINUX_QA_PROFILE:profile},stdio:['ignore','pipe','pipe']});
const log=[]; let timedOut=false;
for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{const value=data.toString();log.push(value);process.stdout.write(value);});
const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),3000).unref();},240000);
const exit=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
clearTimeout(timer);await fs.writeFile(path.join(output,reopen?'native-linux-reopen-console.log':'native-linux-console.log'),log.join(''));
let report;try{report=JSON.parse(await fs.readFile(path.join(output,'native-linux-result.json'),'utf8'));}catch{}
if(timedOut||exit.code!==0||!report?.ok){console.error(JSON.stringify({exit,timedOut,stage:report?.stage,error:report?.error},null,2));process.exitCode=1;}else console.log(JSON.stringify({ok:true,checks:report.checks.length,profile,result:path.join(output,'native-linux-result.json')},null,2));
