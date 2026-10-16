import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../EPOMAKER_TH80_V2_PRO_Wireless.js', import.meta.url), 'utf8').replaceAll('export function ', 'function ');
const layout = JSON.parse(fs.readFileSync(new URL('./layout.json', import.meta.url), 'utf8'));
// Independent protocol-order fixture: manufacturer order cross-checked against
// unique-color hardware readback for all 78 keys, rather than uniform colors.
const order = JSON.parse(fs.readFileSync(new URL('./wireless-order.json', import.meta.url), 'utf8'));
const original = [11, 255, 255, 255, 0, 0, 0, 0, 1, 3, 4, 0, 0, 0, 0, 0];

function harness() {
    const h = {now: 10000, model: 35, mode: 2, vendor: 0x0c45, product: 0x800b, packets: [], responses: [], effect: original.slice(), offline: false, prefix: true, truncate: false, stale: false, failIndex: -1, colors: new Array(280).fill(0)};
    let lastRead = 0;
    const context = vm.createContext({console: {log() {}}, Date: {now: () => h.now}, LightingMode: 'Canvas', forcedColor: '#ff0000', frameRate: 5, device: {
        color(x, y) { return [x * 3, y * 7, (x + y) * 2]; },
        write(packet, length) {
            assert.equal(length, 33); assert.equal(packet.length, 33);
            assert.equal(packet[0], 0); assert.equal(packet[1], 0xaa);
            const cmd = packet[2];
            assert.ok([0x10, 0x13, 0x23, 0x35].includes(cmd), 'No persistent RGB, firmware or keymap writes');
            h.packets.push(Array.from(packet));
            if (h.offline) return 33;
            const reply = new Array(32).fill(0);
            reply[0] = 0x55; reply[1] = cmd;
            if (cmd === 0x35) {
                const index = packet[3];
                assert.ok(index >= 0 && index <= 9);
                assert.equal(packet[4], 0);
                if (index === h.failIndex) return 33;
                h.colors.splice(index * 28, 28, ...packet.slice(5));
                reply[2] = index;
                if (h.stale) h.responses.push([0x55, 0x35, (index + 1) % 10, ...new Array(29).fill(0)]);
            } else {
                const size = packet[3], address = packet[4] | packet[5] << 8;
                assert.ok(size <= 24); assert.equal(packet[6], 0);
                reply.splice(2, 6, size, packet[4], packet[5], 0, packet[7], 0);
                let data;
                if (cmd === 0x10) {
                    data = new Array(56).fill(0);
                    data[4] = h.vendor & 255; data[5] = h.vendor >> 8;
                    data[6] = h.product & 255; data[7] = h.product >> 8;
                    data[14] = h.model; data[16] = h.mode;
                } else if (cmd === 0x13) data = h.effect;
                else h.effect = Array.from(packet.slice(9, 25));
                if (data) reply.splice(8, size, ...data.slice(address, address + size));
            }
            h.responses.push(h.truncate ? reply.slice(0, 7) : h.prefix ? [0, ...reply] : reply);
            return 33;
        },
        read(_data, length, timeout) {
            assert.equal(length, 33); assert.ok(timeout === 0 || timeout === 30);
            const r = h.responses.shift() || []; lastRead = r.length; return r;
        },
        getLastReadSize() { return lastRead; }
    }});
    vm.runInContext(source, context);
    h.context = context;
    h.run = name => vm.runInContext(name + '()', context);
    h.frame = () => { h.now += 200; h.run('Render'); };
    return h;
}

const h = harness();
assert.equal(vm.runInContext('Validate({interface:3,usage_page:0xff60,usage:0x61})', h.context), true);
assert.equal(vm.runInContext('Validate({interface:4,usage_page:0xff59,usage:0x61})', h.context), false);
assert.equal(vm.runInContext('Validate({interface:2,usage_page:0xff68,usage:0x61})', h.context), false);
assert.equal(vm.runInContext('LedNames().length', h.context), 78);
h.run('Initialize'); h.run('Render');
assert.deepEqual(h.packets.slice(0, 3).map(p => p.slice(1, 9)), [
    [0xaa, 0x10, 24, 0, 0, 0, 0, 0],
    [0xaa, 0x10, 24, 24, 0, 0, 0, 0],
    [0xaa, 0x10, 8, 48, 0, 0, 1, 0]
]);
assert.equal(h.packets.filter(p => p[2] === 0x35).length, 6);
const positions = vm.runInContext('LedPositions()', h.context);
for (const [i, key] of layout.entries()) {
    const [x, y] = positions[i];
    const packed = ((x * 3 & 248) << 8) | ((y * 7 & 252) << 3) | (((x + y) * 2 & 248) >> 3);
    const slot = order.indexOf(key.id);
    assert.ok(slot >= 0);
    assert.deepEqual(h.colors.slice(slot * 2, slot * 2 + 2), [packed >> 8, packed & 255]);
}
let before = h.packets.length; h.run('Render'); assert.equal(h.packets.length, before);
h.context.LightingMode = 'Forced'; h.prefix = true; h.stale = true;
h.frame();
for (const id of [...layout.map(k => k.id), 103]) {
    const slot = order.indexOf(id);
    assert.deepEqual(h.colors.slice(slot * 2, slot * 2 + 2), [0xf8, 0]);
}
assert.ok(h.colors.slice(order.length * 2).every(v => v === 0), 'Last packet is zero padded');
h.run('Shutdown'); assert.deepEqual(h.effect, original);
const unnumbered = harness(); unnumbered.prefix = false; unnumbered.run('Initialize'); unnumbered.run('Render');
assert.equal(unnumbered.packets.filter(p => p[2] === 0x35).length, 6, 'Also accepts unnumbered HID replies');

for (const [property, value] of [['model', 8], ['mode', 1], ['vendor', 0x1234], ['product', 0x1234]]) {
    const other = harness(); other[property] = value;
    other.run('Initialize'); other.now += 60000; other.run('Render'); other.run('Shutdown');
    assert.ok(other.packets.every(p => p[2] === 0x10), 'Shared receiver identity rejected before any lighting write');
}

const sleep = harness(); sleep.run('Initialize'); sleep.run('Render'); sleep.effect = [254, ...original.slice(1)]; sleep.offline = true;
for (let i = 0; i < 3; i++) sleep.frame();
before = sleep.packets.length; sleep.frame(); assert.equal(sleep.packets.length, before, 'Pause after three failures');
sleep.now += 3000; sleep.run('Render'); before = sleep.packets.length;
sleep.now += 2999; sleep.run('Render'); assert.equal(sleep.packets.length, before, 'Backoff avoids busy polling');
sleep.offline = false; sleep.now += 1; sleep.run('Render'); sleep.frame();
assert.ok(sleep.packets.slice(before).some(p => p[2] === 0x35), 'Streaming resumes after receiver wake');
sleep.run('Shutdown'); assert.deepEqual(sleep.effect, original, 'Recovery preserves the original pre-stream effect');

const partial = harness(); partial.run('Initialize'); partial.failIndex = 3; partial.run('Render');
assert.deepEqual(partial.packets.filter(p => p[2] === 0x35).map(p => p[3]), [0,1,2,3], 'Abort frame at missing chunk ACK');
const short = harness(); short.truncate = true; short.run('Initialize'); short.run('Render');
assert.ok(short.packets.every(p => p[2] === 0x10), 'Truncated identity replies cannot enable streaming');
const swapped = harness(); swapped.run('Initialize'); swapped.model = 8; swapped.run('Shutdown');
assert.ok(swapped.packets.every(p => p[2] !== 0x23), 'Never restore an effect onto a different paired keyboard');
const modeSwitch = harness(); modeSwitch.run('Initialize'); modeSwitch.run('Render');
modeSwitch.mode = 1; modeSwitch.now += 5000; before = modeSwitch.packets.length; modeSwitch.run('Render');
assert.ok(modeSwitch.packets.slice(before).every(p => p[2] === 0x10), 'Periodic identity check pauses RGB even if the receiver still ACKs');
modeSwitch.mode = 2; modeSwitch.now += 3000; modeSwitch.run('Render'); before = modeSwitch.packets.length; modeSwitch.frame();
assert.ok(modeSwitch.packets.slice(before).some(p => p[2] === 0x35), 'Recover after switching back from Bluetooth');
const zones = harness(); zones.context.device.color = x => x < 32 ? [255,0,0] : [0,0,255];
zones.run('Initialize'); zones.run('Render');
for (const [id, rgb565] of [[6,[0xf8,0]], [7,[0,0x1f]], [39,[0xf8,0]], [40,[0,0x1f]], [55,[0xf8,0]], [56,[0,0x1f]], [70,[0xf8,0]], [71,[0,0x1f]]]) {
    const slot = order.indexOf(id);
    assert.deepEqual(zones.colors.slice(slot*2,slot*2+2), rgb565, 'Physical midpoint regression: F6/F7, U/I, J/K, N/M');
}
zones.run('Shutdown');
console.log('PASS: wireless packet fixtures, RGB565 for all 78 keys, identity guards, frame pacing, stale/prefixed/truncated replies, partial-frame failure, sleep/wake backoff and original-effect restoration.');

// Long periods in USB mode must not grow receiver-switch latency to 30 seconds.
const longUsb = harness(); longUsb.offline = true; longUsb.run('Initialize');
let probes = 1;
for (let i = 0; i < 20; i++) {
    const beforeProbe = longUsb.packets.length;
    longUsb.now += 2999; longUsb.run('Render');
    assert.equal(longUsb.packets.length, beforeProbe, 'No probing before the 3-second interval');
    longUsb.now += 1; longUsb.run('Render'); probes++;
    assert.equal(longUsb.packets.length, probes, 'Still probes once every 3 seconds after prolonged absence');
}
assert.ok(longUsb.packets.every(p => p[2] === 0x10), 'No lighting writes while the receiver cannot identify the keyboard');
longUsb.now += 1; longUsb.offline = false;
longUsb.now += 2998; longUsb.run('Render');
assert.ok(longUsb.packets.every(p => p[2] === 0x10), 'Wait until scheduled probe');
longUsb.now += 1; longUsb.run('Render'); longUsb.frame();
assert.equal(longUsb.packets.filter(p => p[2] === 0x35).length, 6, 'Wireless streaming resumes within next 3-second probe plus frame');
longUsb.run('Shutdown'); assert.deepEqual(longUsb.effect, original);
console.log('PASS: long USB/inactive-receiver wait remains capped at 3 seconds, query pacing and guarded resume.');
