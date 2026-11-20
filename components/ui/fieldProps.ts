export interface FieldProps {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function mergeDescribedBy(
  ...ids: Array<string | undefined>
): string | undefined {
  return ids.filter(Boolean).join(' ') || undefined;
}
