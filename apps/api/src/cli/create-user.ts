import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { DatabaseService } from '../database/database.service.ts';
import { runMigrations } from '../database/migrations.ts';
import { createAuth } from '../auth/auth.service.ts';

async function main() {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const db = new DatabaseService();
  try {
    const email = process.env.ADMIN_EMAIL ?? await rl.question('Email: ');
    const name = process.env.ADMIN_NAME ?? await rl.question('Nome: ');
    const password = process.env.ADMIN_PASSWORD ?? await askPassword(rl);
    if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    runMigrations(db);
    const auth = createAuth(db, { allowProvisioning: true });
    const result = await auth.api.signUpEmail({ body: { email, name, password } });
    console.log(`Usuário criado: ${result.user.email} (${result.user.id})`);
  } finally { rl.close(); db.close(); }
}

async function askPassword(rl: ReturnType<typeof createInterface>): Promise<string> {
  stdout.write('Senha (mínimo 8 caracteres): ');
  stdin.setRawMode?.(true);
  let password = '';
  try {
    for await (const chunk of stdin) {
      for (const char of chunk.toString()) {
        if (char === '\n' || char === '\r') {
          stdout.write('\n');
          return password;
        }
        if (char === '\u0003') throw new Error('Operação cancelada.');
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else password += char;
      }
    }
    return password;
  } finally {
    stdin.setRawMode?.(false);
  }
}

main().catch((e: unknown) => { console.error('Falha ao provisionar usuário:', e); process.exitCode = 1; });
