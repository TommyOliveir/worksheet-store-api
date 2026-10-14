import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Create dummy user
  const user = await prisma.user.create({
    data: {
      email: 'testuser@example.com',
      fullName: 'Test User',
      password: 'hashed_password_here',
    },
  });

  // 2. Create dummy worksheet with a valid S3 key
  const worksheet = await prisma.worksheet.create({
    data: {
      title: 'Sample Grade 5 Math Worksheet',
      description: 'Practice test for fractions',
      price: 9.99,
      gradeLevel: 'Grade 5',
      subject: 'Math',
      fileUrl: 'https://your-bucket.s3.eu-north-1.amazonaws.com/test-file.pdf',
      s3Key: 'bg.jpeg', // Must match an S3 object key
      authorId: user.id,
    },
  });

  // 3. Create completed order with totalAmount provided
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: 'COMPLETED',
      totalAmount: worksheet.price, // <--- Added required totalAmount
    },
  });

  // 4. Create order item linked to the order and worksheet
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      worksheetId: worksheet.id,
      price: worksheet.price,
    },
  });

  console.log('--- TEST DATA CREATED ---');
  console.log(`UserId: ${user.id}`);
  console.log(`WorksheetId: ${worksheet.id}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
