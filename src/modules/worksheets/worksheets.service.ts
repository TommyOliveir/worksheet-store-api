import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { extname } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { Worksheet, Role } from '@prisma/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildUniqueSlug } from '../../common/utils/slug.util';
import { toPublicWorksheet } from './worksheets.mapper';
import { PublicWorksheet } from './types/worksheet.types';

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

  async create(
    authorId: string,
    dto: CreateWorksheetDto,
  ): Promise<PublicWorksheet> {
    const slug = await buildUniqueSlug(dto.title, async (candidate) => {
      const existing = await this.prisma.worksheet.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });

    const worksheet = await this.prisma.worksheet.create({
      data: {
        ...dto,
        slug,
        authorId,
      },
      include: { author: { select: { id: true, fullName: true } } },
    });

    return toPublicWorksheet(worksheet);
  }

  async findAll(): Promise<PublicWorksheet[]> {
    const worksheets = await this.prisma.worksheet.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true } },
      },
    });

    return worksheets.map(toPublicWorksheet);
  }

  async findOne(id: string): Promise<PublicWorksheet> {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, fullName: true } },
      },
    });

    if (!worksheet) {
      throw new NotFoundException(`Worksheet with ID ${id} not found`);
    }

    return toPublicWorksheet(worksheet);
  }

  async findBySlug(slug: string): Promise<PublicWorksheet> {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, fullName: true } },
      },
    });

    if (!worksheet) {
      throw new NotFoundException(`Worksheet "${slug}" not found`);
    }

    return toPublicWorksheet(worksheet);
  }

  async update(
    id: string,
    userId: string,
    userRole: Role,
    dto: UpdateWorksheetDto,
  ): Promise<PublicWorksheet> {
    await this.assertCanManage(id, userId, userRole, 'update');

    const worksheet = await this.prisma.worksheet.update({
      where: { id },
      data: dto,
      include: { author: { select: { id: true, fullName: true } } },
    });

    return toPublicWorksheet(worksheet);
  }

  async remove(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicWorksheet> {
    await this.assertCanManage(id, userId, userRole, 'delete');

    const worksheet = await this.prisma.worksheet.delete({
      where: { id },
      include: { author: { select: { id: true, fullName: true } } },
    });

    return toPublicWorksheet(worksheet);
  }

  private async assertCanManage(
    id: string,
    userId: string,
    userRole: Role,
    action: 'update' | 'delete',
  ): Promise<void> {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!worksheet) {
      throw new NotFoundException(`Worksheet with ID ${id} not found`);
    }

    if (worksheet.authorId !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenException(
        `You can only ${action} your own worksheets`,
      );
    }
  }

  async generateDownloadUrl(userId: string, worksheetId: string) {
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

    if (!purchase) {
      throw new ForbiddenException('Purchase required before downloading.');
    }

    return { downloadUrl: await this.presignWorksheet(purchase.worksheet) };
  }

  private async presignWorksheet(worksheet: Worksheet): Promise<string> {
    const extension = extname(worksheet.s3Key) || '.pdf';
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: worksheet.s3Key,
      ResponseContentDisposition: `attachment; filename="${worksheet.title || 'worksheet'}${extension}"`,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 900 });
  }
}
