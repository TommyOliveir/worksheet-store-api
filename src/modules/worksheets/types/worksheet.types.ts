export interface PublicWorksheetAuthor {
  id: string;
  fullName: string;
}

// The catalog-facing shape. Deliberately omits s3Key, which addresses the
// private paid asset and must never leave the server.
export interface PublicWorksheet {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  gradeLevel: string;
  subject: string;
  previewImageUrl: string;
  author: PublicWorksheetAuthor;
  createdAt: Date;
  updatedAt: Date;
}
