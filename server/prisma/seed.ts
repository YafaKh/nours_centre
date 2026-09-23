import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'password123';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const klass = await prisma.class.upsert({
    where: { name: '10A' },
    update: {},
    create: { name: '10A' },
  });

  const student = await prisma.user.upsert({
    where: { username: '1001' },
    update: {},
    create: {
      username: '1001',
      passwordHash,
      role: 'STUDENT',
      nameAr: 'سارة أحمد',
      nameEn: 'Sara Ahmad',
      student: {
        create: {
          studentId: '1001',
          classId: klass.id,
        },
      },
    },
  });

  const teacher = await prisma.user.upsert({
    where: { username: 'teacher@nourscentre.test' },
    update: {},
    create: {
      username: 'teacher@nourscentre.test',
      passwordHash,
      role: 'TEACHER',
      nameAr: 'محمد خالد',
      nameEn: 'Mohammad Khaled',
      teacher: {
        create: { email: 'teacher@nourscentre.test' },
      },
    },
  });

  const admin = await prisma.user.upsert({
    where: { username: 'nour@nourscentre.test' },
    update: {},
    create: {
      username: 'nour@nourscentre.test',
      passwordHash,
      role: 'ADMIN',
      nameAr: 'نور',
      nameEn: 'Nour',
    },
  });

  console.log('Seeded sample users (password for all: "password123"):');
  console.log(`  student: ${student.username}`);
  console.log(`  teacher: ${teacher.username}`);
  console.log(`  admin:   ${admin.username}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
