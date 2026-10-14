import { IsNotEmpty, IsNumber, IsString, IsUrl, Min } from 'class-validator';

export class CreateWorksheetDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @IsNotEmpty()
  gradeLevel!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsUrl()
  @IsNotEmpty()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  s3Key!: string;
}
