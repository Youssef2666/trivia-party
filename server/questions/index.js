/**
 * Question bank loader — concatenates every .json file in this folder.
 *
 * Files are split by domain so each stays manageable:
 *   general.json  — non-football choice & true/false questions
 *   football.json — the football bank (the big one)
 *   guess.json    — numeric guess questions (all categories)
 *
 * To add a new pack, just drop another .json array in this folder —
 * it is picked up automatically at server start.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const all = [];

for (const file of fs.readdirSync(__dirname).sort()) {
  if (!file.endsWith('.json')) continue;
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  if (Array.isArray(arr)) all.push(...arr);
}

module.exports = all;
