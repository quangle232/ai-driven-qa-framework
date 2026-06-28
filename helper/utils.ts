

export function splitArray(array: any, size: number) {
  const result: any[] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function randomDigits(digits: number = 4): string {
  if (digits <= 0) {
    throw new Error("Digits must be greater than 0");
  }

  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;

  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

export function getEnumKeyByValue(enumObj: any, value: string): string | undefined {
  return Object.entries(enumObj).find(([_, v]) => v === value)?.[0];
}

export function mapEnumBySourceValue<
  TSourceEnum extends Record<string, string>,
  TTargetEnum extends Record<string, string>
>(
  sourceValue: string,
  sourceEnum: TSourceEnum,
  targetEnum: TTargetEnum,
  errorContext: string
): string {
  const key = Object.keys(sourceEnum).find(
    (k) => sourceEnum[k as keyof TSourceEnum] === sourceValue
  );

  if (!key) {
    throw new Error(`Cannot map ${errorContext}: ${sourceValue}`);
  }

  return targetEnum[key as keyof TTargetEnum];
}

export function enumIndexToValue<
  O extends Record<string, string>,
  V extends Record<string, string>
>(
  index: string,
  optionEnum: O,
  valueEnum: V
): string {
  return mapEnumBySourceValue(index, optionEnum, valueEnum, "index");
}