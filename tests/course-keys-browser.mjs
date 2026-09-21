/**
 * Exercise the built course-key pages against the real API with in-memory mail
 * and importer adapters. No SMTP messages, production accounts or SSH calls.
 *
 * node tests/course-keys-browser.mjs [path/to/vitepress/dist]
 * Optional: COURSE_KEYS_PLAYWRIGHT_MODULE, COURSE_KEYS_BROWSER_EXECUTABLE,
 * COURSE_KEYS_BROWSER_ARTIFACTS. Requires Playwright and a Chromium browser.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApp } from '../services/course-keys/src/app.js';
import { loadConfig } from '../services/course-keys/src/config.js';

const require = createRequire(import.meta.url);
const serviceRequire = createRequire(new URL('../services/course-keys/package.json', import.meta.url));
function loadPlaywright() {
  if (process.env.COURSE_KEYS_PLAYWRIGHT_MODULE) return require(process.env.COURSE_KEYS_PLAYWRIGHT_MODULE);
  const candidates = [
    'playwright', 'playwright-core',
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('Playwright is unavailable. Install playwright or set COURSE_KEYS_PLAYWRIGHT_MODULE to its module path.');
}
const { chromium } = loadPlaywright();
function discoverBrowser() {
  if (process.env.COURSE_KEYS_BROWSER_EXECUTABLE) {
    if (!fs.existsSync(process.env.COURSE_KEYS_BROWSER_EXECUTABLE)) throw new Error('COURSE_KEYS_BROWSER_EXECUTABLE does not point to an existing browser.');
    return process.env.COURSE_KEYS_BROWSER_EXECUTABLE;
  }
  const candidates = [chromium.executablePath()];
  if (process.platform === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome');
  }
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('No Chromium browser found. Install the Playwright Chromium browser or set COURSE_KEYS_BROWSER_EXECUTABLE.');
  return found;
}
const ExcelJS = serviceRequire('exceljs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] || path.join(project, 'docs/.vitepress/dist'));
const artifacts = path.resolve(process.env.COURSE_KEYS_BROWSER_ARTIFACTS || path.join(project, 'artifacts/course-keys-browser'));
await fsp.access(path.join(dist, 'course/ssh-keys.html'));
await fsp.access(path.join(dist, 'course/ssh-keys-admin.html'));
await fsp.mkdir(artifacts, { recursive: true });

const adminEmail = 'course-admin@example.test';
const studentId = '0012345678';
const secondStudentId = '0012345679';
const thirdStudentId = '0012345680';
const rosterCsv = `学号,姓名,服务器号\n${studentId},张同学,190\n${secondStudentId},李同学,132\n${thirdStudentId},王同学,197\n`;
const targetKey = (id, serverId = '190') => `${serverId}:stu${id}`;
const studentEmail = `${studentId}@stu.pku.edu.cn`;
const inbox = new Map();
const accounts = new Map();
const jobs = new Map();
const generations = new Map();
const checks = [];
const pageErrors = [];
const browserErrors = [];
const config = loadConfig({
  NODE_ENV: 'test', COURSE_KEYS_DB: ':memory:', COURSE_KEYS_ORIGIN: 'http://127.0.0.1',
  COURSE_KEYS_ENROLLMENT_OPEN: 'true', COURSE_KEYS_ADMIN_EMAILS: adminEmail,
  COURSE_KEYS_SECRET: crypto.randomBytes(48).toString('hex'),
});
config.pollMs = 100;
const app = await createApp({
  config,
  mailer: { configured: true, async sendCode(mail) { inbox.set(mail.to, mail); } },
  importer: {
    async check(targets) {
      return { accounts: targets.map(target => {
        assert.equal(target.username, 'stu' + target.studentId);
        assert.ok(['132', '190', '197'].includes(target.serverId));
        const lookup = targetKey(target.studentId, target.serverId);
        return { ...target, status: accounts.get(lookup) || 'missing', message: accounts.has(lookup) ? null : '账号不存在，待创建' };
      }) };
    },
    async submit(payload) {
      if (jobs.has(payload.requestId)) return jobs.get(payload.requestId);
      const job = {
        id: payload.requestId, status: 'completed', createdAt: new Date().toISOString(),
        items: payload.items.map(item => {
          const lookup = targetKey(item.studentId, item.serverId);
          const generation = (generations.get(lookup) || 0) + 1;
          generations.set(lookup, generation);
          return { ...item, status: 'success', error: null, generation };
        }),
      };
      jobs.set(job.id, job);
      return job;
    },
    async get(id) { return jobs.get(id); },
  },
});

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf',
};
app.setNotFoundHandler(async (request, reply) => {
  if (!['GET', 'HEAD'].includes(request.method) || request.url.startsWith('/api/')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, config.origin).pathname); }
  catch { return reply.code(400).send('Bad path'); }
  const file = path.resolve(dist, `.${pathname}`);
  const relative = path.relative(dist, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return reply.code(404).send('Not found');
  const candidates = [file, `${file}.html`, path.join(file, 'index.html')];
  for (const candidate of candidates) {
    try {
      if (!(await fsp.stat(candidate)).isFile()) continue;
      reply.type(mime[path.extname(candidate)] || 'application/octet-stream');
      return reply.send(fs.createReadStream(candidate));
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  return reply.code(404).type('text/plain').send('Not found');
});

function keys() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url');
  const pack = value => { const length = Buffer.alloc(4); length.writeUInt32BE(value.length); return Buffer.concat([length, value]); };
  return {
    publicKey: `ssh-ed25519 ${Buffer.concat([pack(Buffer.from('ssh-ed25519')), pack(raw)]).toString('base64')}`,
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}
async function eventually(test, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = await test(); if (result) return result; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(message, { cause: lastError });
}
function watch(page, label) {
  page.on('pageerror', error => pageErrors.push({ page: label, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push({ page: label, message: message.text(), url: message.location().url || '' }); });
}
async function visible(page, text) { await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible' }); }
async function login(page, role, identity) {
  await page.getByLabel(role === 'admin' ? '管理员邮箱' : '学号', { exact: true }).fill(identity);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const email = role === 'admin' ? identity : `${identity}@stu.pku.edu.cn`;
  const mail = await eventually(() => inbox.get(email), `Mock OTP was not delivered for ${role}`);
  assert.equal(mail.role, role);
  await page.getByLabel('邮箱验证码', { exact: true }).fill(mail.code);
  await page.getByRole('button', { name: '验证并登录', exact: true }).click();
  await page.locator('.ck-session').getByText(email, { exact: true }).waitFor();
}
async function responseFor(page, suffix, action) {
  const response = page.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/course-keys${suffix}`);
  await action();
  return response;
}
async function noHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(result.document <= result.width + 1 && result.body <= result.width + 1, `${label} has page-level horizontal overflow: ${JSON.stringify(result)}`);
}
async function download(page, button, filename) {
  const waiting = page.waitForEvent('download');
  await button.click();
  const item = await waiting;
  assert.equal(await item.failure(), null);
  const destination = path.join(artifacts, filename);
  await item.saveAs(destination);
  return destination;
}
function record(name) { checks.push(name); console.log(`PASS ${name}`); }
async function checkEnrollmentModes(browser, origin) {
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await context.newPage();
  watch(page, 'enrollment');
  let enrollment = { enrollmentOpen: true, enrollmentMode: 'pilot' };
  await context.route('**/api/course-keys/health', route => route.fulfill({
    json: { ok: true, ...enrollment, mailConfigured: true, servers: config.servers.map(({ id, label }) => ({ id, label })) },
  }));
  await context.route('**/api/course-keys/auth/session', route => route.fulfill({
    json: { user: null, csrfToken: null, verifiedAt: null },
  }));
  const pilotNotice = '当前仅向指定测试学生开放，其他同学请等待课程通知。';
  try {
    await page.goto('/course/ssh-keys', { waitUntil: 'networkidle' });
    await visible(page, pilotNotice);
    await page.getByLabel('学号', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '发送验证码', exact: true }).isEnabled(), true);
    assert.equal(await page.getByText('学生公钥提交暂未开放。', { exact: false }).count(), 0);
    assert.doesNotMatch(await page.locator('.ck-alert').innerText(), /\d/);
    record('pilot students see a limited-access notice and an enabled login form without published student IDs');

    await page.goto('/course/ssh-keys-admin', { waitUntil: 'networkidle' });
    await visible(page, pilotNotice);
    await page.getByLabel('管理员邮箱', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '发送验证码', exact: true }).isEnabled(), true);
    record('administrator page describes pilot access and keeps administrator login available');

    enrollment = { enrollmentOpen: false, enrollmentMode: 'closed' };
    await page.goto('/course/ssh-keys', { waitUntil: 'networkidle' });
    await visible(page, '学生公钥提交暂未开放。助教可登录管理页面完成准备工作，开放时间以课程通知为准。');
    assert.equal(await page.locator('.ck-login').count(), 0);
    assert.equal(await page.getByText(pilotNotice, { exact: true }).count(), 0);
    record('closed enrollment continues to hide the student login form');

    enrollment = { enrollmentOpen: true };
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('学号', { exact: true }).waitFor();
    assert.equal(await page.locator('.ck-alert').count(), 0);
    enrollment = { enrollmentOpen: false };
    await page.reload({ waitUntil: 'networkidle' });
    await visible(page, '学生公钥提交暂未开放。助教可登录管理页面完成准备工作，开放时间以课程通知为准。');
    assert.equal(await page.locator('.ck-login').count(), 0);
    record('legacy health responses without enrollmentMode preserve open and closed behavior');
  } finally {
    await context.close();
  }
}

let browser;
let adminPage;
let studentPage;
const startedAt = new Date().toISOString();
try {
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  config.origin = origin;
  browser = await chromium.launch({ headless: true, executablePath: discoverBrowser() });
  await checkEnrollmentModes(browser, origin);
  const adminContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', acceptDownloads: true });
  const studentContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN', acceptDownloads: true });
  adminPage = await adminContext.newPage(); studentPage = await studentContext.newPage();
  watch(adminPage, 'admin'); watch(studentPage, 'student');

  await adminPage.goto('/course/ssh-keys-admin', { waitUntil: 'networkidle' });
  await login(adminPage, 'admin', adminEmail);
  await visible(adminPage, '还没有选课名单。请先展开上方“导入或更新选课名单”。');
  record('administrator authenticates through UI with an independent cookie session');

  await adminPage.locator('summary').filter({ hasText: '导入或更新选课名单' }).click();
  const template = await download(adminPage, adminPage.getByRole('button', { name: '下载 CSV 模板', exact: true }), 'roster-template.csv');
  assert.equal((await fsp.readFile(template, 'utf8')).replace(/^\uFEFF/, '').trim(), '学号,姓名,服务器号');
  await adminPage.getByLabel('选择名单文件', { exact: false }).setInputFiles({ name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from(rosterCsv) });
  let response = await responseFor(adminPage, '/admin/roster/preview', () => adminPage.getByRole('button', { name: '检查并预览名单', exact: true }).click());
  assert.equal(response.status(), 200);
  const rosterPreview = await response.json(); assert.deepEqual(rosterPreview.errors, []); assert.equal(rosterPreview.summary.added, 3);
  assert.equal(rosterPreview.rows[0].username, 'stu' + studentId);
  assert.equal(rosterPreview.rows[0].serverId, '190');
  assert.ok((await adminPage.locator('.ck-roster-preview').innerText()).includes('stu' + studentId));
  await adminPage.getByRole('button', { name: '确认保存名单', exact: true }).click();
  await visible(adminPage, '名单已保存，共处理 3 名学生。');
  assert.equal(await adminPage.locator('.ck-students-table tbody tr').count(), 3);
  record('three-column CSV template and explicit server assignment preserve IDs and derive stu usernames');
  for (const [serverId, id] of [['132', secondStudentId], ['190', studentId], ['197', thirdStudentId]]) {
    const server = config.servers.find(item => item.id === serverId);
    assert.ok(server);
    const card = adminPage.locator('.ck-server-stats > div').filter({ hasText: server.label });
    assert.equal((await card.locator('strong').innerText()).replace(/\s/g, ''), '1人');
    await adminPage.getByLabel('目标服务器', { exact: true }).selectOption(serverId);
    await eventually(async () => await adminPage.locator('.ck-students-table tbody tr').count() === 1, 'Server filter should show one assigned student');
    assert.ok((await adminPage.locator('.ck-students-table tbody tr').innerText()).includes(id));
  }
  await adminPage.getByLabel('目标服务器', { exact: true }).selectOption('all');
  assert.equal(app.db.prepare('SELECT server_id FROM students WHERE student_id=?').get(studentId).server_id, '190');
  record('three server counts and filters reflect roster assignment without redistributing students');

  await studentPage.goto('/course/ssh-keys', { waitUntil: 'networkidle' });
  await login(studentPage, 'student', studentId);
  await studentPage.getByRole('heading', { name: '张同学 · 0012345678', exact: true }).waitFor();
  await studentPage.getByText('不要上传不带', { exact: false }).waitFor();
  assert.ok((await studentPage.locator('.ck-student-meta').innerText()).includes(studentEmail));
  record('student authenticates to the roster-derived school email and account');

  const pair = keys();
  await studentPage.getByLabel('选择 .pub 文件', { exact: true }).setInputFiles({ name: 'private-disguised.pub', mimeType: 'application/octet-stream', buffer: Buffer.from(pair.privateKey) });
  response = await responseFor(studentPage, '/me/key', () => studentPage.getByRole('button', { name: '提交公钥', exact: true }).click());
  assert.equal(response.status(), 400);
  assert.equal((await response.json()).error.code, 'INVALID_KEY');
  await studentPage.locator('[role="alert"]').filter({ hasText: '不是有效的公钥文件' }).waitFor();
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM keys').get().n, 0);
  record('private key disguised as .pub is rejected by the real backend without persistence');

  await studentPage.getByLabel('选择 .pub 文件', { exact: true }).setInputFiles({ name: 'id_ed25519.pub', mimeType: 'application/octet-stream', buffer: Buffer.from(`${pair.publicKey} student-comment\r\n`) });
  response = await responseFor(studentPage, '/me/key', () => studentPage.getByRole('button', { name: '提交公钥', exact: true }).click());
  assert.equal(response.status(), 200);
  const accepted = await response.json(); assert.equal(accepted.student.latestKey.publicKey.trim(), pair.publicKey); assert.equal(accepted.student.username, 'stu' + studentId); assert.equal(accepted.student.serverId, '190');
  await visible(studentPage, '公钥校验通过并已保存，请等待助教审核导入。');
  assert.equal(jobs.size, 0);
  await noHorizontalOverflow(studentPage, '390px student submission');
  await studentPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await studentPage.screenshot({ path: path.join(artifacts, 'student-mobile-submitted.png'), fullPage: true, animations: 'disabled' });
  record('valid public key is normalized and saved without automatic installation; mobile layout fits 390px');

  await adminPage.getByRole('button', { name: '刷新', exact: true }).click();
  let studentRow = adminPage.locator('.ck-students-table tbody tr').filter({ hasText: studentId });
  await studentRow.getByText('✓ 已提交', { exact: true }).waitFor();
  await studentRow.getByRole('checkbox', { name: `选择学生 ${studentId}`, exact: true }).check();
  await adminPage.getByRole('button', { name: '预览导入', exact: true }).click();
  await adminPage.locator('.ck-review').getByText('账号不存在，待创建', { exact: true }).waitFor();
  assert.equal(await adminPage.getByRole('button', { name: '确认导入 0 人', exact: true }).isDisabled(), true);
  assert.equal(jobs.size, 0);
  await adminPage.getByRole('button', { name: '取消预览', exact: true }).click();
  accounts.set(targetKey(studentId), 'ready');
  await adminPage.getByRole('button', { name: '检查所选账号', exact: true }).click();
  await studentRow.getByText('已就绪', { exact: true }).waitFor();
  record('missing account blocks installation; subsequent account readiness needs no student re-upload');

  await adminPage.getByRole('button', { name: '预览导入', exact: true }).click();
  await adminPage.locator('.ck-review').getByText(accepted.student.latestKey.fingerprint, { exact: true }).waitFor();
  response = await responseFor(adminPage, '/admin/imports', () => adminPage.getByRole('button', { name: '确认导入 1 人', exact: true }).click());
  assert.equal(response.status(), 200);
  await studentRow.getByText('已导入', { exact: true }).waitFor();
  assert.equal(jobs.size, 1);
  assert.equal(app.db.prepare('SELECT installed_key_id FROM students WHERE student_id=?').get(studentId).installed_key_id, accepted.student.latestKey.id);
  record('administrator selection, account check, immutable preview and confirmation install the intended key');

  const exported = await download(adminPage, adminPage.getByRole('button', { name: '导出在册 Excel', exact: true }), 'course-keys-export.xlsx');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(exported);
  const sheet = workbook.worksheets[0];
  const headings = sheet.getRow(1).values;
  assert.equal(sheet.getCell(2, headings.indexOf('学号')).value, studentId);
  assert.equal(sheet.getCell(2, headings.indexOf('完整公钥')).value.trim(), pair.publicKey);
  assert.equal(sheet.getCell(2, headings.indexOf('导入状态')).value, 'installed');
  assert.equal(sheet.getCell(2, headings.indexOf('服务器账号')).value, 'stu' + studentId);
  assert.equal(String(sheet.getCell(2, headings.indexOf('服务器号')).value), '190');
  record('Excel download contains text student IDs, the full normalized key and installed status');

  await studentRow.getByRole('button', { name: '撤销', exact: true }).click();
  await adminPage.getByRole('heading', { name: '确认撤销课程公钥', exact: true }).waitFor();
  response = await responseFor(adminPage, '/admin/key-actions', () => adminPage.getByRole('button', { name: '确认撤销 1 人', exact: true }).click());
  assert.equal(response.status(), 200);
  await studentRow.getByText('已撤销', { exact: true }).waitFor();
  assert.equal(app.db.prepare('SELECT installed_key_id FROM students WHERE student_id=?').get(studentId).installed_key_id, null);
  record('explicit revoke preview removes only the managed course key');

  await studentRow.getByRole('button', { name: '历史公钥', exact: true }).click();
  await adminPage.getByRole('heading', { name: '张同学 · 0012345678 的公钥历史', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: '预览恢复此公钥', exact: true }).click();
  response = await responseFor(adminPage, '/admin/key-actions', () => adminPage.getByRole('button', { name: '确认恢复 1 人', exact: true }).click());
  assert.equal(response.status(), 200);
  await studentRow.getByText('已导入', { exact: true }).waitFor();
  assert.equal(jobs.size, 3);
  assert.equal(generations.get(targetKey(studentId)), 3);
  assert.equal(app.db.prepare('SELECT installed_key_id FROM students WHERE student_id=?').get(studentId).installed_key_id, accepted.student.latestKey.id);
  record('history restoration requires preview and confirmation and reinstalls the selected key');

  await adminPage.getByRole('button', { name: '关闭历史', exact: true }).click();
  await studentRow.getByRole('button', { name: '移除名单', exact: true }).click();
  await adminPage.getByRole('heading', { name: '确认移除名单', exact: true }).waitFor();
  assert.equal(await adminPage.getByRole('button', { name: '确认移除名单 0 人', exact: true }).isDisabled(), true);
  assert.match(await adminPage.locator('.ck-review tbody').innerText(), /撤销/);
  await adminPage.getByRole('button', { name: '取消预览', exact: true }).click();
  assert.equal(jobs.size, 3);
  record('roster removal blocks an installed key and directs the administrator to manual revocation');

  const secondRow = adminPage.locator('.ck-students-table tbody tr').filter({ hasText: secondStudentId });
  await secondRow.getByRole('button', { name: '移除名单', exact: true }).click();
  await adminPage.getByRole('button', { name: '确认移除名单 1 人', exact: true }).waitFor();
  await adminPage.locator('.ck-review').screenshot({ path: path.join(artifacts, 'admin-remove-preview.png'), animations: 'disabled' });
  response = await responseFor(adminPage, '/admin/students/remove-confirm', () => adminPage.getByRole('button', { name: '确认移除名单 1 人', exact: true }).click());
  assert.equal(response.status(), 200); assert.equal((await response.json()).count, 1);
  await eventually(async () => await secondRow.count() === 0, 'Removed student should disappear from the active list');
  assert.equal(await adminPage.locator('.ck-students-table tbody tr').count(), 2);
  const removed = app.db.prepare('SELECT * FROM students WHERE student_id=?').get(secondStudentId);
  assert.ok(removed.removed_at); assert.equal(removed.username, 'stu' + secondStudentId); assert.equal(removed.server_id, '132');
  const server132 = config.servers.find(item => item.id === '132');
  assert.equal((await adminPage.locator('.ck-server-stats > div').filter({ hasText: server132.label }).locator('strong').innerText()).replace(/\s/g, ''), '0人');
  record('preview-confirm removal hides a student from the active roster while preserving identity and server assignment');

  await adminPage.getByLabel('选择名单文件', { exact: false }).setInputFiles({ name: 'roster-again.csv', mimeType: 'text/csv', buffer: Buffer.from(rosterCsv) });
  response = await responseFor(adminPage, '/admin/roster/preview', () => adminPage.getByRole('button', { name: '检查并预览名单', exact: true }).click());
  assert.equal(response.status(), 200);
  const repeatedRoster = await response.json(); assert.equal(repeatedRoster.previewId, null); assert.ok(repeatedRoster.errors.some(issue => /移除/.test(issue.message)));
  assert.equal(await adminPage.getByRole('button', { name: '确认保存名单', exact: true }).isDisabled(), true);
  assert.ok(app.db.prepare('SELECT removed_at FROM students WHERE student_id=?').get(secondStudentId).removed_at);
  await adminPage.locator('.ck-roster-preview').getByRole('button', { name: '取消', exact: true }).click();
  record('re-importing an archived student reports a roster error and never silently restores access');

  await adminPage.getByLabel('名单范围', { exact: true }).selectOption('removed');
  await secondRow.getByRole('button', { name: '恢复名单', exact: true }).waitFor();
  assert.equal(await adminPage.locator('.ck-students-table tbody tr').count(), 1);
  await secondRow.getByRole('button', { name: '恢复名单', exact: true }).click();
  await adminPage.getByRole('button', { name: '确认恢复名单 1 人', exact: true }).waitFor();
  await adminPage.locator('.ck-review').screenshot({ path: path.join(artifacts, 'admin-restore-preview.png'), animations: 'disabled' });
  response = await responseFor(adminPage, '/admin/students/restore-confirm', () => adminPage.getByRole('button', { name: '确认恢复名单 1 人', exact: true }).click());
  assert.equal(response.status(), 200); assert.equal((await response.json()).count, 1);
  await eventually(async () => await adminPage.locator('.ck-students-table tbody tr').count() === 0, 'Restored student should leave the removed list');
  await adminPage.getByLabel('名单范围', { exact: true }).selectOption('active');
  await eventually(async () => await adminPage.locator('.ck-students-table tbody tr').count() === 3, 'Restored student should return to the active roster');
  assert.equal(app.db.prepare('SELECT removed_at FROM students WHERE student_id=?').get(secondStudentId).removed_at, null);
  assert.equal(jobs.size, 3, 'Restoring the roster must not install any key');
  assert.equal((await adminPage.locator('.ck-server-stats > div').filter({ hasText: server132.label }).locator('strong').innerText()).replace(/\s/g, ''), '1人');
  record('explicit roster restore returns the student to the assigned server without automatic key installation');
  await adminPage.locator('summary').filter({ hasText: '导入或更新选课名单' }).click();
  await adminPage.getByLabel('搜索学生', { exact: true }).fill(studentId);
  assert.equal(await adminPage.locator('.ck-students-table tbody tr').count(), 1);
  await adminPage.getByLabel('搜索学生', { exact: true }).fill('');
  await adminPage.getByLabel('筛选状态', { exact: true }).selectOption('missing_submission');
  await eventually(async () => (await adminPage.locator('.ck-students-table tbody').innerText()).includes(secondStudentId), 'Missing-submission filter did not select the unsubmitted student');
  await adminPage.getByLabel('筛选状态', { exact: true }).selectOption('all');
  await noHorizontalOverflow(adminPage, 'desktop administrator');
  await eventually(async () => { const states = await adminPage.locator('.ck-batch summary .ck-tag').allTextContents(); return states.length === 3 && states.every(state => state === '全部成功'); }, 'Batch polling did not display all three completed operations');
  record('automatic batch polling reaches completed results for install, revoke and restore');
  await adminPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await adminPage.screenshot({ path: path.join(artifacts, 'admin-desktop.png'), fullPage: true, animations: 'disabled' });
  record('administrator search, status filters and desktop layout are usable without page overflow');
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(adminPage, '390px administrator roster');
  await adminPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await adminPage.screenshot({ path: path.join(artifacts, 'admin-mobile.png'), fullPage: true, animations: 'disabled' });
  record('administrator statistics, filters and roster fit a 390px mobile viewport');

  await studentPage.getByRole('button', { name: '刷新状态', exact: true }).click();
  await visible(studentPage, '课程公钥已写入服务器。请使用这把公钥对应的本地私钥进行 SSH 登录验证。');
  await noHorizontalOverflow(studentPage, '390px student installed state');
  await studentPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await studentPage.screenshot({ path: path.join(artifacts, 'student-mobile-installed.png'), fullPage: true, animations: 'disabled' });
  // Real built UI + API with isolated mail/importer: auto first install and replacement.
  const autoCard = adminPage.locator('.ck-auto-import');
  await autoCard.getByText('已关闭', { exact: true }).waitFor();
  await autoCard.getByRole('button', { name: '启动自动导入公钥', exact: true }).click();
  assert.equal(jobs.size, 3, 'Opening confirmation cannot approve keys');
  let settingResponse = adminPage.waitForResponse(res => res.request().method() === 'PUT' && res.url().endsWith('/api/course-keys/admin/auto-import'));
  await autoCard.getByRole('button', { name: '确认启动自动导入', exact: true }).click();
  assert.equal((await settingResponse).status(), 200);
  await autoCard.getByText('已开启', { exact: true }).waitFor();
  assert.equal(jobs.size, 3, 'Enabling must not re-import existing submissions');
  await noHorizontalOverflow(adminPage, '390px automatic import settings');
  record('automatic import defaults off, requires explicit confirmation and preserves existing submissions');

  const autoContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const autoPage = await autoContext.newPage();
  autoPage.on('pageerror', error => pageErrors.push({ page: 'auto-student', message: error.message }));
  try {
    await autoPage.goto('/course/ssh-keys', { waitUntil: 'networkidle' });
    await login(autoPage, 'student', thirdStudentId);
    await autoPage.getByRole('heading', { name: '王同学 · ' + thirdStudentId, exact: true }).waitFor();
    const firstAutoKey = keys();
    await autoPage.getByLabel('选择 .pub 文件', { exact: true }).setInputFiles({ name: 'first.pub', mimeType: 'application/octet-stream', buffer: Buffer.from(firstAutoKey.publicKey) });
    response = await responseFor(autoPage, '/me/key', () => autoPage.getByRole('button', { name: '提交公钥', exact: true }).click());
    assert.equal(response.status(), 200);
    await eventually(async () => {
      await app.processAutoImports();
      return app.db.prepare('SELECT account_status FROM students WHERE student_id=?').get(thirdStudentId).account_status === 'missing';
    }, 'Missing auto account should be checked');
    await visible(autoPage, '账号不存在，待创建');
    assert.equal(jobs.size, 3);
    record('automatic submission remains saved while the assigned account is missing');
    accounts.set(targetKey(thirdStudentId, '197'), 'ready');
    app.db.prepare("UPDATE auto_import_candidates SET next_attempt_at=0 WHERE student_id=?").run(thirdStudentId);
    await app.processAutoImports(); await app.synchronize();
    await visible(autoPage, '课程公钥已写入服务器。请使用这把公钥对应的本地私钥进行 SSH 登录验证。');
    const firstAutoId = app.db.prepare('SELECT installed_key_id FROM students WHERE student_id=?').get(thirdStudentId).installed_key_id;
    assert.ok(firstAutoId); assert.equal(jobs.size, 4);
    record('ready account automatically receives saved key; student polling shows installed without another upload');
    const replacement = keys();
    await autoPage.getByLabel('选择 .pub 文件', { exact: true }).setInputFiles({ name: 'replacement.pub', mimeType: 'application/octet-stream', buffer: Buffer.from(replacement.publicKey) });
    response = await responseFor(autoPage, '/me/key', () => autoPage.getByRole('button', { name: '提交公钥', exact: true }).click());
    assert.equal(response.status(), 200);
    const replacementId = (await response.json()).student.latestKey.id;
    await app.processAutoImports(); await app.synchronize();
    await eventually(() => app.db.prepare('SELECT installed_key_id FROM students WHERE student_id=?').get(thirdStudentId).installed_key_id === replacementId, 'Replacement should install automatically');
    await visible(autoPage, '课程公钥已写入服务器。请使用这把公钥对应的本地私钥进行 SSH 登录验证。');
    assert.notEqual(firstAutoId, replacementId); assert.equal(jobs.size, 5);
    await noHorizontalOverflow(autoPage, '390px automatic student state');
    await autoPage.screenshot({ path: path.join(artifacts, 'student-auto-installed.png'), fullPage: true, animations: 'disabled' });
    await eventually(async () => (await adminPage.locator('.ck-batch summary').allTextContents()).filter(text => text.includes('自动导入')).length === 2, 'Administrator should discover automatic batches');
    record('replacement automatically installs and appears as automatic in administrator batch history');
  } finally { await autoContext.close(); }
  await autoCard.getByRole('button', { name: '停止自动导入', exact: true }).click();
  settingResponse = adminPage.waitForResponse(res => res.request().method() === 'PUT' && res.url().endsWith('/api/course-keys/admin/auto-import'));
  await autoCard.getByRole('button', { name: '确认停止自动导入', exact: true }).click();
  assert.equal((await settingResponse).status(), 200);
  await autoCard.getByText('已关闭', { exact: true }).waitFor();
  await adminPage.screenshot({ path: path.join(artifacts, 'admin-auto-settings.png'), fullPage: true, animations: 'disabled' });
  record('administrator can confirm stopping automatic import without revoking installed keys');
  assert.deepEqual(pageErrors, [], 'Unexpected browser JavaScript exceptions');
  assert.deepEqual(browserErrors.filter(entry => !(entry.page === 'student' && entry.message.includes('400 (Bad Request)') && entry.url.endsWith('/api/course-keys/me/key'))), [], 'Unexpected browser console errors');
  record('student sees installed state; no browser JavaScript exceptions');

  await fsp.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ success: true, startedAt, finishedAt: new Date().toISOString(), platform: os.platform(), checks, pageErrors, browserErrors, artifacts: ['student-mobile-submitted.png', 'student-mobile-installed.png', 'admin-desktop.png', 'admin-mobile.png', 'admin-remove-preview.png', 'admin-restore-preview.png', 'course-keys-export.xlsx', 'roster-template.csv'], note: 'Real API and built frontend; isolated in-memory mail, database and importer. No actual SMTP or SSH.' }, null, 2));
  console.log(`Browser acceptance passed (${checks.length} checks). Artifacts: ${artifacts}`);
} catch (error) {
  for (const [name, page] of [['admin', adminPage], ['student', studentPage]]) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, `${name}-failure.png`), fullPage: true }).catch(() => {});
  }
  await fsp.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ success: false, startedAt, finishedAt: new Date().toISOString(), checks, pageErrors, browserErrors, error: { message: error.message, stack: error.stack } }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await app.close();
}
