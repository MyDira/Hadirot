import { promises as fs } from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL('', import.meta.url).pathname), '..', '..');

interface PatternResult {
  count: number;
  files: Set<string>;
}

const patterns: Record<string, { regex: RegExp; result: PatternResult }> = {
  TEMP_ZEPTO_TOKEN: { regex: /TEMP_ZEPTO_TOKEN/g, result: { count: 0, files: new Set() } },
  'Zoho-enczapikey': { regex: /Zoho-enczapikey/g, result: { count: 0, files: new Set() } },
  RESEND_: { regex: /RESEND_/g, result: { count: 0, files: new Set() } },
  'resend.com': { regex: /resend\.com/g, result: { count: 0, files: new Set() } },
  'functions/v1/': { regex: /functions\/v1\//g, result: { count: 0, files: new Set() } },
};

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(res));
    } else {
      files.push(res);
    }
  }
  return files;
}

async function scanRepo() {
  const files = await walk(repoRoot);
  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    if (rel.startsWith(path.join('scripts', 'audit')) || rel.startsWith('docs')) continue;
    const content = await fs.readFile(file, 'utf8');
    for (const [name, { regex, result }] of Object.entries(patterns)) {
      const matches = content.match(regex);
      if (matches) {
        result.count += matches.length;
        result.files.add(rel);
      }
    }
  }
}

interface FunctionCheck {
  name: string;
  path: string;
  pass: boolean;
  notes: string[];
}

const functionNames = ['send-email', 'delete-user', 'send-password-reset'];

async function checkFunctions(): Promise<FunctionCheck[]> {
  const checks: FunctionCheck[] = [];
  for (const fn of functionNames) {
    const filePath = path.join(repoRoot, 'supabase/functions', fn, 'index.ts');
    let pass = true;
    const notes: string[] = [];
    try {
      const code = await fs.readFile(filePath, 'utf8');
      const hasCors = code.includes('_shared/cors.ts');
      if (!hasCors) { pass = false; notes.push('missing CORS import'); }
      const handlesOptions = code.includes('req.method === "OPTIONS"');
      if (!handlesOptions) { pass = false; notes.push('missing OPTIONS handler'); }
      const usesZepto = code.includes('https://api.zeptomail.com/v1.1/email') || code.includes('sendViaZepto');
      if (!usesZepto) { pass = false; notes.push('missing Zepto URL'); }
      const hasAuthHeader = code.includes('Zoho-enczapikey') || code.includes('sendViaZepto');
      if (!hasAuthHeader) { pass = false; notes.push('missing Authorization header'); }
      const envVars = ['ZEPTO_TOKEN','ZEPTO_FROM_ADDRESS','ZEPTO_FROM_NAME','ZEPTO_REPLY_TO','EMAIL_PROVIDER'];
      for (const v of envVars) {
        if (!code.includes(`Deno.env.get("${v}")`)) { pass = false; notes.push(`missing env ${v}`); }
      }
      const hasResend = /RESEND_|resend\.com|TEMP_ZEPTO_TOKEN/.test(code);
      if (hasResend) { pass = false; notes.push('contains Resend or temp token'); }
    } catch (err) {
      pass = false;
      notes.push('failed to read function');
    }
    checks.push({ name: fn, path: path.relative(repoRoot, filePath), pass, notes });
  }
  return checks;
}

async function checkFrontendFetches(): Promise<string[]> {
  const files = await walk(path.join(repoRoot, 'src'));
  const offenders: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const fetchMatch = content.match(/fetch\([^\n]*functions\/v1/);
    if (fetchMatch) {
      offenders.push(path.relative(repoRoot, file));
    }
  }
  return offenders;
}

async function checkVaultMigrations(): Promise<string[]> {
  const dir = path.join(repoRoot, 'supabase/migrations');
  let files: string[] = [];
  try { files = await walk(dir); } catch { return []; }
  return files.filter(asyncPath => false); // placeholder
}

async function getVaultMigrations(): Promise<string[]> {
  const dir = path.join(repoRoot, 'supabase/migrations');
  try {
    const files = await fs.readdir(dir);
    const hits: string[] = [];
    for (const f of files) {
      const p = path.join(dir, f);
      const content = await fs.readFile(p, 'utf8');
      if (content.includes('vault.create_secret')) {
        hits.push(path.relative(repoRoot, p));
      }
    }
    return hits;
  } catch {
    return [];
  }
}

function formatPatternCounts() {
  return Object.entries(patterns)
    .map(([name, { result }]) => {
      const files = Array.from(result.files).join(', ');
      return `- ${name}: ${result.count}${files ? ` (files: ${files})` : ''}`;
    })
    .join('\n');
}

function buildSummaryTable(checks: FunctionCheck[]) {
  const rows = checks
    .map(c => `| ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.notes.join('; ')} |`)
    .join('\n');
  return `| Function | Status | Notes |\n|---|---|---|\n${rows}`;
}

async function main() {
  await scanRepo();
  const fnChecks = await checkFunctions();
  const fetchOffenders = await checkFrontendFetches();
  const vaultMigrations = await getVaultMigrations();

  let report = '# ZeptoMail Migration Audit\n\n';
  report += '## Summary\n';
  report += buildSummaryTable(fnChecks) + '\n\n';
  report += '## Pattern counts\n' + formatPatternCounts() + '\n\n';
  report += '## Files needing fixes\n';
  if (fetchOffenders.length === 0 && fnChecks.every(c => c.pass)) {
    report += 'None\n\n';
  } else {
    const list = [...fetchOffenders, ...fnChecks.filter(c => !c.pass).map(c => c.path)];
    report += list.map(f => `- ${f}`).join('\n') + '\n\n';
  }
  report += '### Secrets vs Vault\n';
  report += 'Edge Function environment variables are not read from database vault secrets. Use the Dashboard or CLI to set them.\n\n';
  report += '### Edge Function Secrets to set\n';
  report += '- ZEPTO_TOKEN\n- ZEPTO_FROM_ADDRESS\n- ZEPTO_FROM_NAME\n- ZEPTO_REPLY_TO (optional)\n- EMAIL_PROVIDER=zepto (optional)\n\n';
  if (vaultMigrations.length) {
    report += 'Migration files using `vault.create_secret` detected:\n';
    report += vaultMigrations.map(f => `- ${f}`).join('\n') + '\n\n';
    report += 'Remember to replicate these secrets in Edge Function settings.\n\n';
  }
  report += '### curl tests\n';
  report += '```bash\n';
  report += '# Replace with your values\n';
  report += 'export SUPABASE_URL="https://<project>.supabase.co"\n';
  report += 'export SUPABASE_ANON_KEY="<anon>"\n\n';
  report += `# send-email test\n`;
  report += `curl -s -X POST "$SUPABASE_URL/functions/v1/send-email" \\\n+  -H "Content-Type: application/json" \\\n+  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \\\n+  -d '{"to":"you@example.com","subject":"Zepto audit test","html":"<p>hello from Zepto</p>"}' | jq\n\n`;
  report += `# delete-user test\n`;
  report += `curl -s -X POST "$SUPABASE_URL/functions/v1/delete-user" \\\n+  -H "Content-Type: application/json" \\\n+  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \\\n+  -d '{"userId":"00000000-0000-0000-0000-000000000000","reason":"audit"}' | jq\n\n`;
  report += `# send-password-reset test\n`;
  report += `curl -s -X POST "$SUPABASE_URL/functions/v1/send-password-reset" \\\n+  -H "Content-Type: application/json" \\\n+  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \\\n+  -d '{"to":"you@example.com"}' | jq\n`;
  report += '```\n';

  await fs.writeFile(path.join(repoRoot, 'docs', 'email-zepto-audit.md'), report);
}

main();
