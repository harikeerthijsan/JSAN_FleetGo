// Isolated Docker integration checks. Never connects to the developer's database.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const image = process.env.PRODUCTION_TEST_IMAGE || 'fleetgo:production-check';
const tag = 'fleetgo-check-' + Date.now(),
  network = tag + '-net',
  db = tag + '-db',
  app = tag + '-app',
  volume = tag + '-uploads';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetgo-production-'));
let checks = 0;
const check = (v, label) => {
  assert.ok(v, label);
  checks++;
  console.log('PASS', label);
};
function docker(args, expected = 0) {
  if (args[0] === 'exec' && args[1] === app)
    args = ['exec', '--user', '1000', ...args.slice(1)];
  const r = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (expected !== null && r.status !== expected)
    throw Error(
      'Docker ' +
        args.slice(0, 2).join(' ') +
        ' failed: ' +
        (r.stderr || r.stdout),
    );
  return r;
}
const secret = () => randomBytes(32).toString('hex');
const settings = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fleetgo:' + secret() + '@' + db + ':5432/fleetgo',
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  APP_PUBLIC_URL: 'https://fleetgo-check.example.com',
  STORAGE_LOCAL_PATH: '/data/storage',
  TRACKING_SIMULATION_ENABLED: 'false',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
  BOOTSTRAP_ADMIN_PASSWORD: 'Aa1-' + secret(),
  PORT: '4000',
  LOG_LEVEL: 'warn',
};
function envfile(name, values) {
  const file = path.join(scratch, name);
  fs.writeFileSync(
    file,
    Object.entries(values)
      .map(([k, v]) => k + '=' + v)
      .join('\n'),
    { mode: 0o600 },
  );
  return file;
}
const env = envfile('app.env', settings),
  dbEnv = envfile('db.env', {
    POSTGRES_USER: 'fleetgo',
    POSTGRES_PASSWORD: new URL(settings.DATABASE_URL).password,
    POSTGRES_DB: 'fleetgo',
  });
const runImage = (command, expected = 0, file = env) =>
  docker(
    [
      'run',
      '--rm',
      '--network',
      network,
      '--env-file',
      file,
      image,
      ...command,
    ],
    expected,
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready(fn, label) {
  for (let i = 0; i < 60; i++) {
    try {
      if (await fn()) return;
    } catch {}
    await pause(500);
  }
  throw Error('Timed out: ' + label);
}
let origin;
async function call(
  route,
  { body, token, method = 'GET', cookie, headers = {} } = {},
) {
  const res = await fetch(origin + route, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { res, data, raw };
}
async function main() {
  docker(['network', 'create', network]);
  docker(['volume', 'create', volume]);
  docker([
    'run',
    '-d',
    '--name',
    db,
    '--network',
    network,
    '--env-file',
    dbEnv,
    'postgres:16-alpine',
  ]);
  await ready(
    () =>
      docker(['exec', db, 'pg_isready', '-U', 'fleetgo', '-d', 'fleetgo'], null)
        .status === 0,
    'isolated Postgres',
  );
  const missing = envfile('missing.env', {
    ...settings,
    BOOTSTRAP_ADMIN_EMAIL: '',
    BOOTSTRAP_ADMIN_PASSWORD: '',
  });
  const invalid = runImage(
    ['node', '-e', "require('./dist/config')"],
    null,
    envfile('insecure.env', {
      ...settings,
      JWT_ACCESS_SECRET: 'short',
      COOKIE_SECURE: 'false',
    }),
  );
  check(
    invalid.status !== 0,
    'Production rejects weak secrets and insecure cookies',
  );
  check(
    runImage(['npm', 'run', 'production:release'], null, missing).status !== 0,
    'Empty database refuses bootstrap without explicit administrator credentials',
  );
  runImage(['npm', 'run', 'production:release']);
  check(
    true,
    'Fresh migrations and production bootstrap succeed without a mounted volume',
  );
  runImage(
    ['npm', 'run', 'production:release'],
    0,
    envfile('repeat.env', {
      ...settings,
      BOOTSTRAP_ADMIN_PASSWORD: 'Aa1-' + secret(),
    }),
  );
  check(
    true,
    'Repeated release/bootstrap is idempotent and retains the original password',
  );
  const sql = (s) =>
    docker([
      'exec',
      db,
      'psql',
      '-U',
      'fleetgo',
      '-d',
      'fleetgo',
      '-tAc',
      s,
    ]).stdout.trim();
  check(
    sql('SELECT count(*) FROM users') === '1',
    'Only the explicit production administrator is created',
  );
  check(
    sql('SELECT count(*) FROM vehicles') === '0' &&
      sql('SELECT count(*) FROM organizations') === '0' &&
      sql('SELECT count(*) FROM depots') === '0',
    'No synthetic vehicles, organizations or depots are seeded',
  );
  check(
    sql('SELECT count(*) FROM gps_providers') === '0',
    'Production creates no simulated GPS provider',
  );
  check(
    Number(sql('SELECT count(*) FROM ticket_type_configs')) === 9,
    'Required ticket defaults are installed',
  );
  check(
    runImage(
      ['node', '-e', "require('fs').accessSync('./prisma/seed.ts')"],
      null,
    ).status !== 0,
    'Demo seed is absent from runtime image',
  );
  check(
    runImage(['node', '-e', "require.resolve('typescript')"], null).status !==
      0,
    'Compiler/dev dependencies are absent from runtime image',
  );
  function start(file = env) {
    docker([
      'run',
      '-d',
      '--name',
      app,
      '--network',
      network,
      '--env-file',
      file,
      '-p',
      '127.0.0.1::4000',
      '--mount',
      'type=volume,src=' + volume + ',dst=/data',
      image,
    ]);
    const port = docker(['port', app, '4000/tcp'])
      .stdout.trim()
      .split(':')
      .pop();
    origin = 'http://127.0.0.1:' + port;
  }
  start();
  await ready(async () => {
    const r = await call('/api/v1/health');
    return r.res.status === 200;
  }, 'production web service');
  const health = await call('/api/v1/health');
  check(
    health.data.data.storage.status === 'writable' &&
      health.data.data.database.status === 'connected',
    'Health checks database and upload storage',
  );
  const uidProbe =
    "const f=require('fs');const pid=f.readFileSync('/proc/1/task/1/children','utf8').trim().split(' ')[0];console.log(f.readFileSync('/proc/'+pid+'/status','utf8').match(/^Uid:\\s+(\\d+)/m)[1]);";
  check(
    docker(['exec', app, 'node', '-e', uidProbe]).stdout.trim() === '1000',
    'Application runs as non-root after volume initialization',
  );
  const page = await call('/tracking/history');
  check(
    page.res.status === 200 && page.raw.includes('<div id="root">'),
    'SPA deep links are served by the same production origin',
  );
  check(
    page.res.headers.get('cache-control') === 'no-store',
    'SPA HTML cannot cache stale deployment assets',
  );
  check(
    page.res.headers
      .get('content-security-policy')
      ?.includes("script-src 'self'") && !page.res.headers.has('x-powered-by'),
    'Production CSP is enabled and framework fingerprint removed',
  );
  const asset = page.raw.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const assetRes = await call(asset);
  check(
    assetRes.res.status === 200 &&
      assetRes.res.headers.get('cache-control').includes('immutable'),
    'Hashed frontend assets have immutable caching',
  );
  check(
    (await call('/assets/missing.js')).res.status === 404,
    'Missing static assets do not return SPA HTML',
  );
  const absent = await call('/api/v1/not-a-route');
  check(
    absent.res.status === 404 && typeof absent.data === 'object',
    'Unknown API routes stay JSON 404s',
  );
  check(
    (
      await call('/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'broken', password: '' },
      })
    ).res.status === 422,
    'Patched validation returns field errors',
  );
  const login = await call('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: settings.BOOTSTRAP_ADMIN_EMAIL,
      password: settings.BOOTSTRAP_ADMIN_PASSWORD,
    },
  });
  check(
    login.res.status === 200,
    'Explicit production administrator can sign in',
  );
  const token = login.data.data.accessToken;
  const cookie = login.res.headers.get('set-cookie');
  check(
    cookie.includes('HttpOnly') &&
      cookie.includes('Secure') &&
      cookie.toLowerCase().includes('samesite=strict'),
    'Refresh cookie is HttpOnly, Secure and SameSite',
  );
  check(
    (
      await call('/api/v1/auth/refresh', {
        method: 'POST',
        cookie: cookie.split(';')[0],
      })
    ).res.status === 200,
    'Cookie refresh works behind production configuration',
  );
  check(
    (await call('/api/v1/auth/me', { token })).res.status === 200,
    'Authenticated user profile is available',
  );
  const cors = await call('/api/v1/health', {
    headers: { Origin: 'https://untrusted.example.com' },
  });
  check(
    !cors.res.headers.has('access-control-allow-origin'),
    'Untrusted origins do not receive credentialed CORS permission',
  );
  const settingsRes = await call('/api/v1/tracking/settings', { token });
  check(
    settingsRes.data.data.simulationEnabled === false,
    'GPS simulation is disabled in production',
  );
  await new Promise((resolve, reject) => {
    const { WebSocket } = require('ws');
    const ws = new WebSocket(
      origin.replace('http:', 'ws:') + '/api/v1/tracking/ws',
      { origin: settings.APP_PUBLIC_URL },
    );
    const timer = setTimeout(() => {
      ws.terminate();
      reject(Error('Production socket timeout'));
    }, 7000);
    ws.on('open', () =>
      ws.send(JSON.stringify({ type: 'auth', token, mode: 'REAL' })),
    );
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.data?.summary) {
        clearTimeout(timer);
        check(
          msg.data.mode === 'REAL',
          'Production WebSocket authenticates and streams scoped snapshots',
        );
        ws.close();
        resolve();
      }
    });
  });
  check(
    !JSON.stringify(settingsRes.data).includes(settings.JWT_ACCESS_SECRET),
    'Configuration responses do not expose server secrets',
  );
  const forgot = await call('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: { email: 'unknown@example.com' },
  });
  check(
    forgot.res.status === 503 && !forgot.raw.includes('devToken'),
    'Unconfigured password recovery reports unavailable and never exposes a token',
  );
  for (const route of [
    '/api/v1/inventory/dashboard',
    '/api/v1/tickets/dashboard',
    '/api/v1/allocations',
    '/api/v1/trips',
    '/api/v1/claims',
    '/api/v1/settings',
  ]) {
    const r = await call(route, { token });
    check(r.res.status === 200, 'Production module smoke check ' + route);
  }
  // Exercise the real storage abstraction under the same UID/mount as the API.
  const writer =
    "const {storage}=require('./dist/utils/storage');storage.save({buffer:Buffer.from('durable-evidence'),originalName:'check.txt',contentType:'text/plain',folder:'production-check'}).then(f=>console.log(f.key));";
  const key = docker(['exec', app, 'node', '-e', writer])
    .stdout.trim()
    .split('\n')
    .pop();
  docker(['restart', app]);
  origin =
    'http://127.0.0.1:' +
    docker(['port', app, '4000/tcp']).stdout.trim().split(':').pop();
  await ready(async () => {
    return (await call('/api/v1/health')).res.status === 200;
  }, 'restart');
  const reader =
    "const {storage}=require('./dist/utils/storage');storage.read(" +
    JSON.stringify(key) +
    ').then(b=>console.log(b.toString()));';
  check(
    docker(['exec', app, 'node', '-e', reader]).stdout.includes(
      'durable-evidence',
    ),
    'Uploaded bytes survive a container restart',
  );
  docker(['rm', '-f', app]);
  start();
  await ready(async () => {
    return (await call('/api/v1/health')).res.status === 200;
  }, 'container replacement');
  check(
    docker(['exec', app, 'node', '-e', reader]).stdout.includes(
      'durable-evidence',
    ),
    'Uploaded bytes survive replacement with a new container',
  );
  const traversal =
    "const {storage}=require('./dist/utils/storage');storage.read('../storage-sibling/private').then(()=>process.exit(1)).catch(e=>process.exit(e.message==='Invalid storage key'?0:2));";
  check(
    docker(['exec', app, 'node', '-e', traversal]).status === 0,
    'Storage rejects sibling-prefix directory traversal',
  );
  const excel =
    "const E=require('exceljs');(async()=>{const w=new E.Workbook();w.addWorksheet('check').addRow(['safe']);const bytes=await w.xlsx.writeBuffer();const r=new E.Workbook();await r.xlsx.load(bytes);if(r.worksheets[0].getCell('A1').value!=='safe')process.exit(1);})();";
  check(
    docker(['exec', app, 'node', '-e', excel]).status === 0,
    'Patched ExcelJS dependency still writes and reads XLSX',
  );
  const patch =
    "const {updateTicketSchema}=require('./dist/modules/tickets/tickets.validators');const p=updateTicketSchema.parse({subject:'Changed subject'});if(p.priority!==undefined)process.exit(1);const {updateSchema}=require('./dist/modules/claims/claims.validators');const c=updateSchema.parse({city:'New city'});if(c.policeComplaint!==undefined||c.thirdParties!==undefined)process.exit(1);";
  check(
    docker(['exec', app, 'node', '-e', patch]).status === 0,
    'Zod upgrade preserves omitted fields in partial updates',
  );
  // Generic server errors must not contain database paths or exception text.
  const sanitized =
    "const {errorHandler}=require('./dist/middlewares/errorHandler');const res={status(){return this},json(v){if(v.error.message!=='Internal Server Error')process.exit(1)}};errorHandler(new Error('private-db-password'),{},res,()=>{});";
  check(
    docker(['exec', app, 'node', '-e', sanitized]).status === 0,
    'Unexpected server errors are sanitized',
  );
  const logProbe =
    "require('./dist/middlewares/requestLogger');const m=require('morgan');if(m['safe-path']({url:'/reset-password?token=private-fixture'})!=='/reset-password')process.exit(1);";
  check(
    docker(['exec', app, 'node', '-e', logProbe]).status === 0,
    'Production access logs omit reset tokens and query secrets',
  );
  const mail =
    "const n=require('nodemailer');const {config}=require('./dist/config');config.mail.host='smtp.example.com';config.mail.from='fleetgo@example.com';n.createTransport=o=>({sendMail:async m=>{if(!o.requireTLS||!m.text.includes('https://fleetgo-check.example.com/reset-password?token=fixture-token'))throw Error('Invalid reset message')},close(){}});require('./dist/utils/mail').sendPasswordReset('user@example.com','fixture-token').catch(()=>process.exit(1));";
  check(
    docker(['exec', app, 'node', '-e', mail]).status === 0,
    'Password reset mail uses TLS and the configured public origin',
  );
  const noVolume = envfile('no-volume.env', {
    ...settings,
    RAILWAY_ENVIRONMENT_ID: 'test-environment',
  });
  check(
    runImage(['node', 'dist/server.js'], null, noVolume).status !== 0,
    'Railway startup refuses to store uploads without a persistent mount',
  );
  console.log(
    JSON.stringify(
      { checks, result: 'Production container checks passed', image },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    console.error(docker(['logs', '--tail', '40', app], null).stderr);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const name of [app, db]) docker(['rm', '-f', name], null);
    docker(['volume', 'rm', volume], null);
    docker(['network', 'rm', network], null);
    for (const name of fs.readdirSync(scratch))
      fs.unlinkSync(path.join(scratch, name));
    fs.rmdirSync(scratch);
  });
