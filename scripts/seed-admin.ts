// Creates the first Admin account — there's no self-service signup by
// design (only an existing admin, or this script, should be able to
// create one). Run with:
//   npx tsx -r dotenv/config scripts/seed-admin.ts <email> <password>
// If the admin already exists, add --reset to set a new password for it:
//   npx tsx -r dotenv/config scripts/seed-admin.ts <email> <password> --reset
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/admin-session";
import { AdminRole } from "../app/generated/prisma/enums";

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const [email, password] = args.filter((a) => a !== "--reset");
  if (!email || !password) {
    console.error("Usage: npx tsx -r dotenv/config scripts/seed-admin.ts <email> <password> [--reset]");
    process.exit(1);
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    if (!reset) {
      console.log(`Admin ${email} already exists — not overwriting. Pass --reset to set a new password.`);
      return;
    }
    await prisma.admin.update({ where: { email }, data: { passwordHash: await hashPassword(password) } });
    console.log(`Password reset for ${email}.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.admin.create({
    data: { email, passwordHash, role: AdminRole.OWNER },
  });
  console.log(`Created admin ${admin.email} (${admin.role}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
