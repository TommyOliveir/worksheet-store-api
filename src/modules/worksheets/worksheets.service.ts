import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { Worksheet, Role } from '@prisma/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class WorksheetsService {
  private s3Client: S3Client;

  constructor(private readonly prisma: PrismaService) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'eu-north-1';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are missing from environment variables.',
      );
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async create(authorId: string, dto: CreateWorksheetDto): Promise<Worksheet> {
    return this.prisma.worksheet.create({
      data: {
        ...dto,
        authorId,
      },
    });
  }

  async findAll(): Promise<Worksheet[]> {
    return this.prisma.worksheet.findMany({
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async findOne(id: string): Promise<Worksheet> {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!worksheet) {
      throw new NotFoundException(`Worksheet with ID ${id} not found`);
    }

    return worksheet;
  }

  async update(
    id: string,
    userId: string,
    userRole: Role,
    dto: UpdateWorksheetDto,
  ): Promise<Worksheet> {
    const worksheet = await this.findOne(id);

    if (worksheet.authorId !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only update your own worksheets');
    }

    return this.prisma.worksheet.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string, userRole: Role): Promise<Worksheet> {
    const worksheet = await this.findOne(id);

    if (worksheet.authorId !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only delete your own worksheets');
    }

    return this.prisma.worksheet.delete({
      where: { id },
    });
  }

  async generateDownloadUrl(userId: string, worksheetId: string) {
    // 1. Verify payment in Neon database
    const purchase = await this.prisma.orderItem.findFirst({
      where: {
        worksheetId,
        order: {
          userId,
          status: 'COMPLETED',
        },
      },
      include: { worksheet: true },
    });

    console.log('DEBUG ARGS:', { userId, worksheetId });
    console.log('DEBUG PURCHASE RESULT:', purchase);

    if (!purchase) {
      throw new ForbiddenException('Purchase required before downloading.');
    }

    // // 2. Prepare the command using the s3Key from Neon
    // const command = new GetObjectCommand({
    //   Bucket: process.env.AWS_S3_BUCKET_NAME,
    //   Key: purchase.worksheet.s3Key, // e.g. "worksheets/grade-5-math.pdf"
    // });

    // // 3. THIS IS WHERE THE DOWNLOAD URL IS CREATED:
    // // Generates a secure, temporary HTTPS link valid for 15 minutes (900 seconds)
    // const downloadUrl = await getSignedUrl(this.s3Client, command, {
    //   expiresIn: 900,
    // });

    // return { downloadUrl };

    // worksheets.service.ts

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: purchase.worksheet.s3Key, // e.g. "bg.jpeg"
      // Tells the browser to download the file directly with a specific filename
      ResponseContentDisposition: `attachment; filename="${purchase.worksheet.title || 'worksheet'}.jpeg"`,
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    return { downloadUrl };
  }
}
