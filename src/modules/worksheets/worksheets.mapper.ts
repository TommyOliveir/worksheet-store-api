import { Prisma } from '@prisma/client';
import { PublicWorksheet } from './types/worksheet.types';

type WorksheetWithAuthor = Prisma.WorksheetGetPayload<{
  include: { author: { select: { id: true; fullName: true } } };
}>;

export function toPublicWorksheet(
  worksheet: WorksheetWithAuthor,
): PublicWorksheet {
  return {
    id: worksheet.id,
    slug: worksheet.slug,
    title: worksheet.title,
    description: worksheet.description,
    // Decimal would serialize to a string over JSON, which breaks arithmetic
    // and toFixed() on the client.
    price: Number(worksheet.price),
    gradeLevel: worksheet.gradeLevel,
    subject: worksheet.subject,
    previewImageUrl: worksheet.fileUrl,
    author: worksheet.author,
    createdAt: worksheet.createdAt,
    updatedAt: worksheet.updatedAt,
  };
}
