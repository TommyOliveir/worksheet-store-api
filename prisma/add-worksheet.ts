import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const BUCKET_NAME =
  process.env.AWS_S3_BUCKET_NAME ||
  'worksheet-bucket-133775959966-eu-north-1-an';
const REGION = process.env.AWS_REGION || 'eu-north-1';

// Public cover image stored in your S3 previews/ folder
const coverKey = 'previews/cover-bg.jpeg';
const publicFileUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${coverKey}`;

async function addWorksheet() {
  // 1. Fetch an existing user (e.g. test user or admin) to act as author
  const author = await prisma.user.findFirst();

  if (!author) {
    console.error(
      'No user found in DB to set as author. Run seed-test.ts first!',
    );
    return;
  }

  // 2. Add the new worksheet product
  const newWorksheet = await prisma.worksheet.create({
    data: {
      slug: `sample-grade-5-math-worksheet-${Date.now()}`,
      title: 'Sample Grade 5 Math Worksheet',
      description: 'Practice test for fractions',
      price: 9.99,
      gradeLevel: 'Grade 5',
      subject: 'Math',
      fileUrl: publicFileUrl, // Public URL for cover thumbnail
      s3Key: 'products/bg.jpeg', // Private S3 key for download
      authorId: author.id, // Dynamically uses an existing User UUID
    },
  });

  console.log('\n--- NEW WORKSHEET ADDED ---');
  console.log('Worksheet ID:', newWorksheet.id);
  console.log('Title:', newWorksheet.title);
  console.log('Public Cover URL:', newWorksheet.fileUrl);
  console.log('Private S3 Key:', newWorksheet.s3Key);
}

addWorksheet()
  .catch((e) => {
    console.error('Error adding worksheet:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
