// Guardrail for Notification.type (see implementation plan, Q3).
//
// Every notify()/notifyMany() call in controllers/*.js passes a literal
// `type: '...'`. Because utils/notify.js deliberately swallows errors, a type
// missing from Notification's strict enum fails SILENTLY (no crash, no log -
// the notification is just never created). This script asserts every literal
// type used in a notify call is present in the schema enum, so the failure
// mode is caught before merge instead of by a future audit.
//
// Usage: npm run check:notifications
// Exit 0 = clean. Exit 1 = at least one unregistered type.
const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'controllers');
const Notification = require('../models/Notification');

const registered = new Set(Notification.schema.path('type').enumValues);

// Extract the full `notify(...)` / `notifyMany(...)` call spans from source
// via paren-depth matching, then read the literal `type: '...'` inside each.
const extractNotifyTypes = (source, filename) => {
  const found = [];
  const dynamic = [];
  const callRe = /\bnotify(?:Many)?\s*\(/g;
  let m;
  while ((m = callRe.exec(source)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1; // position of '('
    let inStr = null;
    let escaped = false;
    let span = '';
    for (; i < source.length; i++) {
      const ch = source[i];
      span += ch;
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const literal = span.match(/type\s*:\s*['"]([A-Za-z_]+)['"]/);
    if (literal) {
      found.push({ type: literal[1], filename });
      continue;
    }
    const tmpl = span.match(/type\s*:\s*`([^`]+)`/);
    if (tmpl) dynamic.push({ type: tmpl[1], filename });
  }
  return { found, dynamic };
};

const main = () => {
  const files = fs.readdirSync(controllersDir).filter((f) => f.endsWith('.js'));
  const used = new Map(); // type -> [filenames]
  const dynamic = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(controllersDir, file), 'utf8');
    const { found, dynamic: dyn } = extractNotifyTypes(source, file);
    for (const { type, filename } of found) {
      if (!used.has(type)) used.set(type, []);
      used.get(type).push(filename);
    }
    dynamic.push(...dyn);
  }

  let failed = false;
  for (const [type, filenames] of [...used.entries()].sort()) {
    if (!registered.has(type)) {
      failed = true;
      console.error(`UNREGISTERED notification type '${type}' used in: ${[...new Set(filenames)].join(', ')}`);
    }
  }
  for (const { type, filename } of dynamic) {
    console.warn(`NOTE: dynamic notification type \`${type}\` in ${filename} cannot be checked statically - verify manually.`);
  }

  if (failed) {
    console.error('\ncheck-notification-types: FAILED - add the missing value(s) to Notification.type enum.');
    process.exit(1);
  }
  console.log(`check-notification-types: OK - ${used.size} literal type(s) used, all registered.`);
};

main();
