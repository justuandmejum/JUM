// Creates the first Admin account — there's no self-service signup by
// design (only an existing admin, or this script, should be able to
// create one). Run with:
//   npx tsx -r dotenv/config scripts/seed-admin.ts <email> <password>
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/admin-session";
import { AdminRole } from "../app/generated/prisma/enums";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx -r dotenv/config scripts/seed-admin.ts <email> <password>");
    process.exit(1);
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists — not overwriting. Delete the row first to reseed.`);
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
