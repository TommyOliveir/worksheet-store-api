export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'worksheet';
}

export function buildUniqueSlug(
  value: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value);

  const resolve = async (attempt: number): Promise<string> => {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    return (await isTaken(candidate)) ? resolve(attempt + 1) : candidate;
  };

  return resolve(0);
}
