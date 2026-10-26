import { makeDecoder } from '../../src/server/feed/sync';
const xml = '<?xml version="1.0" encoding="windows-1251"?><yml_catalog><shop><offers><offer id="1"><name>Кепка чоловіча</name></offer></offers></shop></yml_catalog>';
const map: Record<string, number> = {}; // encode to cp1251 manually for Cyrillic
const bytes = Buffer.from([...xml].map((ch) => { const c = ch.charCodeAt(0); if (c < 128) return c; if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0; if (c === 0x456) return 0xb3; if (c === 0x406) return 0xb2; return 63; }));
console.log(makeDecoder(bytes).decode(bytes).match(/<name>(.*)<\/name>/)![1]);
