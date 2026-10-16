import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

const BUCKET_NAME =
  process.env.AWS_S3_BUCKET_NAME ||
  'worksheet-bucket-133775959966-eu-north-1-an';
const REGION = process.env.AWS_REGION || 'eu-north-1';

const coverKey = 'previews/cover-bg.jpeg';
const publicFileUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${coverKey}`;

async function main() {
  // Hash the test password properly so bcrypt.compare works
  const RAW_PASSWORD = 'password123';
  const hashedPassword = await bcrypt.hash(RAW_PASSWORD, 10);

  // 1. Create dummy user with valid bcrypt hash
  const user = await prisma.user.create({
    data: {
      email: 'testuser@example.com',
      fullName: 'Test User',
      password: hashedPassword, // Store the actual bcrypt hash
    },
  });

  // 2. Create dummy worksheet
  const worksheet = await prisma.worksheet.create({
    data: {
      title: 'Sample Grade 5 Math Worksheet',
      description: 'Practice test for fractions',
      price: 9.99,
      gradeLevel: 'Grade 5',
      subject: 'Math',
      fileUrl: publicFileUrl,
      s3Key: 'bg.jpeg',
      authorId: user.id,
    },
  });

  // 3. Create completed order
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: 'COMPLETED',
      totalAmount: worksheet.price,
    },
  });

  // 4. Create order item
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      worksheetId: worksheet.id,
      price: worksheet.price,
    },
  });

  console.log('--- TEST DATA CREATED ---');
  console.log(`Email: testuser@example.com`);
  console.log(`Password: ${RAW_PASSWORD}`);
  console.log(`UserId: ${user.id}`);
  console.log(`WorksheetId: ${worksheet.id}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
