import fs from 'node:fs';
import assert from 'node:assert/strict';

// Synthetic fixture: only public USB/model identifiers, no local capture or log.
const info = new Array(56).fill(0);
info[4] = 0x45; info[5] = 0x0c; info[6] = 0x0b; info[7] = 0x80; info[14] = 35;
const original = [11, 255, 255, 255, 0, 0, 0, 0, 1, 3, 4, 0, 0, 0, 0, 0];
let responses = [], lastRead = 0, packets = [], model = 35, fail = false, prefixed = false;
let effect = original.slice(), frame = new Array(512).fill(0), now = 10000;
Date.now = () => now;
globalThis.LightingMode = 'Canvas';
globalThis.forcedColor = '#ff0000';
globalThis.frameRate = 20;
globalThis.device = {
    color(x, y) { return [x * 3, y * 7, (x + y) * 2]; },
    write(packet, length) {
        assert.equal(length, 65);
        assert.equal(packet.length, 65);
        assert.equal(packet[0], 0);
        assert.equal(packet[1], 0xaa);
        const [, , command, size, lo, hi, reserved, final] = packet;
        assert.ok([0x10, 0x13, 0x23, 0x32].includes(command), 'Only query/volatile RGB/restore commands allowed');
        assert.ok(size <= 56);
        assert.equal(reserved, 0);
        packets.push(packet.slice());
        if (fail) return 65;
        const address = lo | hi << 8;
        const reply = new Array(64).fill(0);
        reply.splice(0, 8, 0x55, command, size, lo, hi, 0, final, 0);
        let data;
        if (command === 0x10) {
            data = info.slice(); data[14] = model;
        } else if (command === 0x13) data = effect;
        else if (command === 0x23) effect = packet.slice(9, 25);
        else frame.splice(address, size, ...packet.slice(9, 9 + size));
        if (data) reply.splice(8, size, ...data.slice(address, address + size));
        responses.push(prefixed ? [0, ...reply] : reply);
        return 65;
    },
    read() { const result = responses.shift() || []; lastRead = result.length; return result; },
    getLastReadSize() { return lastRead; }
};

const plugin = await import(new URL('../EPOMAKER_TH80_V2_PRO.js', import.meta.url));
assert.equal(plugin.Validate({interface: 2, usage_page: 0xff68, usage: 0x61}), true);
assert.equal(plugin.Validate({interface: 3, usage_page: 0xff67, usage: 0x61}), false);
assert.equal(plugin.LedNames().length, 78);
assert.equal(plugin.LedPositions().length, 78);
assert.ok(plugin.LedPositions().every(([x,y]) => x >= 0 && x < 64 && y >= 0 && y < 24));

plugin.Initialize();
plugin.Render();
assert.equal(packets.filter(p => p[2] === 0x32).length, 10);
const layout = JSON.parse(fs.readFileSync(new URL('./layout.json', import.meta.url), 'utf8'));
for (let index = 0; index < layout.length; index++) {
    const [x, y] = plugin.LedPositions()[index];
    assert.deepEqual(frame.slice(layout[index].id * 4 + 1, layout[index].id * 4 + 4), device.color(x,y));
}
const countBefore = packets.length;
plugin.Render();
assert.equal(packets.length, countBefore, 'Frame rate limiter');

globalThis.LightingMode = 'Forced';
prefixed = true;
now += 60;
plugin.Render();
const controlled = [...layout.map(k => k.id), 97, 98, 103];
for (const id of controlled) assert.deepEqual(frame.slice(id*4+1,id*4+4), [255,0,0]);
for (let id = 0; id < 128; id++) if (!controlled.includes(id)) assert.deepEqual(frame.slice(id*4+1,id*4+4), [0,0,0]);
plugin.Shutdown();
assert.deepEqual(effect, original, 'Hardware effect restoration');

model = 8;
packets = [];
plugin.Initialize();
now += 60;
plugin.Render();
assert.deepEqual(packets.map(p => p[2]), [0x10], 'Refuse shared VID/PID belonging to another internal model');

model = 35;
plugin.Initialize();
fail = true;
for (let i = 0; i < 3; i++) { now += 60; plugin.Render(); }
const stoppedCount = packets.length;
now += 100;
plugin.Render();
assert.equal(packets.length, stoppedCount, 'Stops after 3 failed frames');
console.log('PASS: endpoint/model guards, all 78 key mappings, auxiliary colors, packet bounds, frame pacing, both reply formats, effect restoration and failure stop.');
