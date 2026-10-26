// Sentinel 3D licence format — shared by the app (checks keys) and the private key generator (signs keys).
// A key is:  S3D1.<payload>.<signature>   payload = base64url(JSON), signature = Ed25519 over the payload text.
// Only the holder of the secret signing key can make a valid signature; the app carries just the public check code.
'use strict';
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');

const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I to avoid confusion when reading out codes
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function base32(buf, n) { let bits = 0, val = 0, out = ''; for (const byte of buf) { val = (val << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } if (out.length >= n) break; } return out.slice(0, n); }
function group(s) { return s.match(/.{1,4}/g).join('-'); }

// ---- machine identity (stays the same across app reinstalls; changes if Windows/macOS is reinstalled or the board is replaced)
function rawMachineId() {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 8000 });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/); if (m) return 'mac:' + m[1];
    } else if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/); if (m) return 'win:' + m[1].toLowerCase();
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { const v = fs.readFileSync(f, 'utf8').trim(); if (v) return 'lnx:' + v; } catch (_) {} }
    }
  } catch (_) {}
  return null;
}
function machineCode(raw) {
  raw = raw || rawMachineId(); if (!raw) return null;
  const h = crypto.createHmac('sha256', 'sentinel3d-machine-v1').update(raw).digest();
  const body = base32(h, 20); // 100 bits
  const chk = base32(crypto.createHash('sha256').update(body).digest(), 2);
  return group(body + chk); // 22 chars in groups of 4, last 2 are a typo check
}
function normCode(s) { const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/I/g, '1'); return c; }
function validCode(s) {
  const c = normCode(s); if (c.length !== 22) return false; if ([...c].some(ch => !ALPHA.includes(ch))) return false;
  return base32(crypto.createHash('sha256').update(c.slice(0, 20)).digest(), 2) === c.slice(20);
}
function prettyCode(s) { return group(normCode(s)); }

// ---- public check code <-> key object
function pubToCheckCode(pubKeyObj) { const der = pubKeyObj.export({ format: 'der', type: 'spki' }); return 'S3DPUB-' + b64u(der.subarray(SPKI_PREFIX.length)); }
function checkCodeToPub(code) {
  const m = String(code || '').trim().match(/^S3DPUB-([A-Za-z0-9_-]{43})$/); if (!m) return null;
  const raw = ub64u(m[1]); if (raw.length !== 32) return null;
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

// ---- signing (key generator only) and checking (app)
function signLicence(privKeyObj, data) {
  const payload = {
    v: 1,
    id: data.id,                           // serial, e.g. S3D-2026-0001
    m: normCode(data.machine),             // machine code without dashes
    n: String(data.name || '').slice(0, 80),
    c: String(data.company || '').slice(0, 80),
    ed: data.edition || 'Commercial',
    i: data.issued || new Date().toISOString().slice(0, 10),
    x: data.expiry || null                 // 'YYYY-MM-DD' or null for lifetime
  };
  const p = b64u(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(p), privKeyObj);
  return 'S3D1.' + p + '.' + b64u(sig);
}
function cleanKey(text) { return String(text || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''); }
// returns {ok:true, lic} or {ok:false, why}
function checkLicence(keyText, pubKeyObj, myCode, now) {
  const k = cleanKey(keyText);
  const parts = k.split('.');
  if (parts.length !== 3 || parts[0] !== 'S3D1') return { ok: false, why: 'format' };
  let good = false;
  try { good = crypto.verify(null, Buffer.from(parts[1]), pubKeyObj, ub64u(parts[2])); } catch (_) { good = false; }
  if (!good) return { ok: false, why: 'signature' };
  let lic; try { lic = JSON.parse(ub64u(parts[1]).toString('utf8')); } catch (_) { return { ok: false, why: 'format' }; }
  if (lic.v !== 1) return { ok: false, why: 'format' };
  if (normCode(myCode) !== lic.m) return { ok: false, why: 'machine', lic };
  if (lic.x) { const end = new Date(lic.x + 'T23:59:59'); if ((now || new Date()) > end) return { ok: false, why: 'expired', lic }; }
  return { ok: true, lic, key: k };
}

module.exports = { machineCode, rawMachineId, validCode, normCode, prettyCode, pubToCheckCode, checkCodeToPub, signLicence, checkLicence, cleanKey, b64u, ub64u };
