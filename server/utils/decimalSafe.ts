/**
 * DecimalSafe: Authoritative, Decimal-Safe Arithmetic Utility for FINEXJ Financial Accounting
 * Prevents IEEE-754 binary floating-point round-off errors (e.g. 0.1 + 0.2 !== 0.3)
 * Operates at high fixed precision (8 decimal places internal, 4 decimal places canonical currency)
 */

export class DecimalSafe {
  private static readonly SCALE = 8;
  private static readonly MULTIPLIER = BigInt(10 ** DecimalSafe.SCALE);

  private readonly value: bigint;

  constructor(value: bigint | number | string | DecimalSafe = 0) {
    if (value instanceof DecimalSafe) {
      this.value = value.value;
    } else if (typeof value === 'bigint') {
      this.value = value;
    } else if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        this.value = 0n;
      } else {
        this.value = DecimalSafe.parseToScaledBigInt(value.toFixed(DecimalSafe.SCALE));
      }
    } else if (typeof value === 'string') {
      this.value = DecimalSafe.parseToScaledBigInt(value);
    } else {
      this.value = 0n;
    }
  }

  private static parseToScaledBigInt(input: string): bigint {
    const trimmed = input.trim();
    if (!trimmed || trimmed === 'NaN' || trimmed === 'null' || trimmed === 'undefined') {
      return 0n;
    }

    const isNegative = trimmed.startsWith('-');
    const cleanStr = isNegative ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

    const parts = cleanStr.split('.');
    const integerPart = parts[0].replace(/\D/g, '') || '0';
    let fractionPart = (parts[1] || '').replace(/\D/g, '');

    if (fractionPart.length > DecimalSafe.SCALE) {
      fractionPart = fractionPart.slice(0, DecimalSafe.SCALE);
    } else {
      fractionPart = fractionPart.padEnd(DecimalSafe.SCALE, '0');
    }

    const combinedStr = integerPart + fractionPart;
    const unsignedBig = BigInt(combinedStr);
    return isNegative ? -unsignedBig : unsignedBig;
  }

  public static from(val: bigint | number | string | DecimalSafe | null | undefined): DecimalSafe {
    if (val === null || val === undefined) return new DecimalSafe(0n);
    return new DecimalSafe(val);
  }

  public static zero(): DecimalSafe {
    return new DecimalSafe(0n);
  }

  public add(other: bigint | number | string | DecimalSafe): DecimalSafe {
    const b = DecimalSafe.from(other);
    return new DecimalSafe(this.value + b.value);
  }

  public sub(other: bigint | number | string | DecimalSafe): DecimalSafe {
    const b = DecimalSafe.from(other);
    return new DecimalSafe(this.value - b.value);
  }

  public mul(other: bigint | number | string | DecimalSafe): DecimalSafe {
    const b = DecimalSafe.from(other);
    // (a * b) / MULTIPLIER
    const raw = (this.value * b.value) / DecimalSafe.MULTIPLIER;
    return new DecimalSafe(raw);
  }

  public div(other: bigint | number | string | DecimalSafe): DecimalSafe {
    const b = DecimalSafe.from(other);
    if (b.value === 0n) {
      throw new Error('DecimalSafe division by zero');
    }
    // (a * MULTIPLIER) / b
    const raw = (this.value * DecimalSafe.MULTIPLIER) / b.value;
    return new DecimalSafe(raw);
  }

  public abs(): DecimalSafe {
    return new DecimalSafe(this.value < 0n ? -this.value : this.value);
  }

  public compare(other: bigint | number | string | DecimalSafe): number {
    const b = DecimalSafe.from(other);
    if (this.value > b.value) return 1;
    if (this.value < b.value) return -1;
    return 0;
  }

  public gte(other: bigint | number | string | DecimalSafe): boolean {
    return this.compare(other) >= 0;
  }

  public gt(other: bigint | number | string | DecimalSafe): boolean {
    return this.compare(other) > 0;
  }

  public lte(other: bigint | number | string | DecimalSafe): boolean {
    return this.compare(other) <= 0;
  }

  public lt(other: bigint | number | string | DecimalSafe): boolean {
    return this.compare(other) < 0;
  }

  public eq(other: bigint | number | string | DecimalSafe): boolean {
    return this.compare(other) === 0;
  }

  public isZero(): boolean {
    return this.value === 0n;
  }

  public toFixed(digits = 4): string {
    const isNeg = this.value < 0n;
    const absVal = isNeg ? -this.value : this.value;
    const str = absVal.toString().padStart(DecimalSafe.SCALE + 1, '0');
    const intPart = str.slice(0, str.length - DecimalSafe.SCALE) || '0';
    const fracPart = str.slice(str.length - DecimalSafe.SCALE);

    if (digits <= 0) {
      return (isNeg ? '-' : '') + intPart;
    }

    const roundedFrac = fracPart.slice(0, digits).padEnd(digits, '0');
    return (isNeg ? '-' : '') + `${intPart}.${roundedFrac}`;
  }

  public toNumber(digits = 4): number {
    return parseFloat(this.toFixed(digits));
  }

  public toString(): string {
    return this.toFixed(4);
  }
}
