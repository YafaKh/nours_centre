import { prisma } from '../src/db.js';
import { seedDatabase } from './seedData.js';

seedDatabase()
  .then((summary) => {
    console.log('Seeded sample data:');
    console.log(`  ${summary.studentsImported} students, ${summary.teachersImported} teachers imported`);
    console.log('Sample logins (password is the same for all three):');
    console.log(`  admin:   ${summary.admin.username}  /  ${summary.admin.password}`);
    console.log(`  teacher: ${summary.documentedTeacher.username}  /  ${summary.documentedTeacher.password}`);
    console.log(`  student: ${summary.documentedStudent.username}  /  ${summary.documentedStudent.password}`);
    console.log('See server/sample-data/students.csv and teachers.csv for every other seeded login (all use a generated password shown only during import — reset via the admin UI to issue a new one).');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
