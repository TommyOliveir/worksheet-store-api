import { IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class UpdateWorksheetDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsUrl()
  fileUrl?: string;
}
