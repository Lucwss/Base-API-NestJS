import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { UserEntity } from '../users/entities/user.entity';

const SALT_ROUNDS = 14;

function arg(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.split('=').slice(1).join('=');
}

/**
 * Bootstraps the first admin. Kept out of migrations deliberately: a seed
 * migration would bake a credential into version control and re-run it on
 * every fresh environment.
 */
async function main(): Promise<void> {
  const username = arg('user') ?? process.env.ADMIN_USER;
  const password = arg('pass') ?? process.env.ADMIN_PASS;
  const email = arg('email') ?? process.env.ADMIN_EMAIL;

  if (!username || !password) {
    throw new Error(
      'Usage: npm run admin:createsuperuser -- --user=<name> --pass=<password> [--email=<email>]',
    );
  }
  // Must match LoginDto, or this mints an account that can never log in.
  if (username.length < 6 || username.length > 39) {
    throw new Error('Username must be between 6 and 39 characters.');
  }
  if (password.length < 16 || password.length > 64) {
    throw new Error('Password must be between 16 and 64 characters.');
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(UserEntity);

  const existing = await repo.findOneBy({ username });
  if (existing) {
    // The password is always applied. Ignoring it here means someone who reran
    // this to fix a forgotten login would be told it worked, then still be
    // locked out with the old hash.
    await repo.update(existing.id, {
      isSuperuser: true,
      isActive: true,
      password: await bcrypt.hash(password, SALT_ROUNDS),
    });
    console.log(`Promoted existing user "${username}" and reset its password.`);
  } else {
    const user = repo.create({
      username,
      email: email ?? `${username}@example.com`,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      isSuperuser: true,
    });
    await repo.save(user);
    console.log(`Created superuser "${username}".`);
  }

  await AppDataSource.destroy();
}

main().catch(async (error: Error) => {
  console.error(error.message);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
