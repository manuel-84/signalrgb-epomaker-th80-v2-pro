import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../EPOMAKER_TH80_V2_PRO.js', import.meta.url), 'utf8').replaceAll('export function ', 'function ');
const original = [11,255,255,255,0,0,0,0,1,3,4,0,0,0,0,0];
function harness() {
    const h = {now:10000, mode:0, model:35, offline:false, truncated:false, prefix:true, packets:[], replies:[], logs:[], effect:original.slice(), frame:new Array(512).fill(0)};
    let readSize = 0;
    const context = vm.createContext({Date:{now:()=>h.now}, console:{log(){}}, LightingMode:'Canvas', forcedColor:'#ff0000', frameRate:20, device:{
        color(x,y) { return [x*3,y*7,(x+y)*2]; },
        log(line) { h.logs.push(line); },
        write(p,length) {
            assert.equal(length,65); assert.equal(p.length,65); assert.equal(p[0],0); assert.equal(p[1],0xaa);
            const cmd = p[2], count = p[3], address = p[4] | p[5]<<8;
            assert.ok([0x10,0x13,0x23,0x32].includes(cmd));
            assert.ok(count <= 56); h.packets.push(Array.from(p));
            if (h.offline) return 65;
            let data;
            if (cmd===0x10) {
                data = new Array(56).fill(0);
                data[4]=0x45; data[5]=0x0c; data[6]=0x0b; data[7]=0x80;
                data[14]=h.model; data[16]=h.mode;
            } else if (cmd===0x13) data=h.effect;
            else if (cmd===0x23) h.effect=Array.from(p.slice(9,25));
            else h.frame.splice(address,count,...p.slice(9,9+count));
            const reply = new Array(64).fill(0);
            reply.splice(0,8,0x55,cmd,count,p[4],p[5],0,p[7],0);
            if (data) reply.splice(8,count,...data.slice(address,address+count));
            h.replies.push(h.truncated ? reply.slice(0,8) : h.prefix ? [0,...reply] : reply);
            return 65;
        },
        read(_p,length) {
            assert.equal(length,65,'Reserve report ID for full Windows HID reads');
            const r=h.replies.shift()||[]; readSize=r.length; return r;
        },
        getLastReadSize() { return readSize; }
    }});
    vm.runInContext(source,context);
    h.positions=vm.runInContext('LedPositions()',context);
    h.run = name => vm.runInContext(name+'()',context);
    h.step = (ms=60) => {h.now+=ms;h.run('Render');};
    h.commands = cmd=>h.packets.filter(p=>p[2]===cmd);
    return h;
}

const h=harness(); h.run('Initialize'); h.run('Render');
assert.equal(h.commands(0x32).length,10);
const layout=JSON.parse(fs.readFileSync(new URL('./layout.json',import.meta.url),'utf8'));
for(const [i,key] of layout.entries()) {const [x,y]=h.positions[i];assert.deepEqual(h.frame.slice(key.id*4+1,key.id*4+4),[x*3,y*7,(x+y)*2]);}
const before=h.packets.length;h.run('Render');assert.equal(h.packets.length,before);
h.offline=true;for(let i=0;i<3;i++)h.step();
assert.equal(h.commands(0x23).length,0,'Transient failures must not request native lighting');
const paused=h.packets.length;h.step(999);assert.equal(h.packets.length,paused);
h.offline=false;h.step(1);h.step();
assert.equal(h.commands(0x32).length,23,'Full frame after recovery, with no permanent stop');
assert.equal(h.commands(0x13).length,1,'Preserve pre-stream effect across retries');
h.run('Shutdown');assert.deepEqual(h.effect,original);assert.equal(h.commands(0x23).length,1);

const start=harness();start.offline=true;start.run('Initialize');start.offline=false;
start.step(1000);start.step();assert.equal(start.commands(0x32).length,10,'Recover failed initialization');

const mode=harness();mode.mode=2;mode.run('Initialize');mode.run('Render');
assert.equal(mode.commands(0x32).length,0,'Do not stream USB while keyboard uses receiver');
mode.mode=0;mode.step(1000);mode.step();assert.equal(mode.commands(0x32).length,10);
mode.mode=2;mode.step(5000);assert.equal(mode.commands(0x32).length,10,'Pause on mode change');
mode.run('Shutdown');assert.equal(mode.commands(0x23).length,0,'Do not restore USB effect into another connection mode');

const bad=harness();bad.model=8;bad.run('Initialize');bad.model=35;bad.step(60000);
assert.deepEqual(bad.packets.map(p=>p[2]),[0x10],'Reject unrelated model without retrying writes');

const short=harness();short.truncated=true;short.run('Initialize');assert.equal(short.commands(0x13).length,0,'Reject truncated identity');
short.truncated=false;short.step(1000);short.step();assert.equal(short.commands(0x32).length,10);

const unprefixed=harness();unprefixed.prefix=false;unprefixed.run('Initialize');unprefixed.run('Render');assert.equal(unprefixed.commands(0x32).length,10);
const backoff=harness();backoff.offline=true;backoff.run('Initialize');
let queries=1;for(const delay of [1000,2000,4000,8000,16000,30000,30000]) {backoff.step(delay-1);assert.equal(backoff.packets.length,queries);backoff.step(1);queries++;assert.equal(backoff.packets.length,queries);}
console.log('PASS USB: initialization recovery, three-failure recovery, no transient restore, USB/receiver mode guard, guarded shutdown, identity rejection, truncated/prefixed reports, bounded backoff, pacing and all 78 key colors.');
