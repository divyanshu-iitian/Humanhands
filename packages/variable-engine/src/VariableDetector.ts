import type { DetectedVariable, VariableType } from '@humanhands/shared-types';
import { VALUE_PATTERNS, FIELD_LABEL_TO_VARIABLE, normalizeLabel, toVariableName } from './patterns.js';

export interface DetectionInput {
  value: string;
  fieldLabel?: string;
  fieldName?: string;
  fieldType?: string;
  placeholder?: string;
  contextUrl?: string;
}

export interface DetectionResult {
  variable: DetectedVariable;
  rawValue: string;
  isVariable: boolean;
}

/**
 * Classifies a typed value and determines whether it should be
 * abstracted into a workflow variable.
 *
 * Decision algorithm:
 * 1. Always-variable: email, phone, invoice-number, url, currency, date, id → ALWAYS extract
 * 2. Field-name guided: use ARIA label to name the variable
 * 3. Confidence threshold: values with confidence < 0.5 are treated as string literals
 *    unless the field label provides strong signal
 * 4. Short literals (< 3 chars) or single keywords are usually NOT variables
 */
export class VariableDetector {
  private static readonly ALWAYS_VARIABLE_TYPES: VariableType[] = [
    'email',
    'phone',
    'invoice-number',
    'order-number',
    'currency',
    'date',
    'datetime',
    'url',
    'id',
    'postal-code',
  ];

  private static readonly MIN_VALUE_LENGTH = 2;
  private static readonly HIGH_CONFIDENCE_THRESHOLD = 0.75;

  detect(input: DetectionInput): DetectionResult {
    const { value, fieldLabel, fieldName, fieldType, placeholder } = input;

    // Skip empty, very short, or non-typeable values
    if (!value || value.length < VariableDetector.MIN_VALUE_LENGTH) {
      return this.literal(value);
    }

    // Skip password fields - never variable
    if (fieldType === 'password' || normalizeLabel(fieldLabel ?? '') === 'password') {
      return this.literal(value);
    }

    // 1. Try pattern-based type detection
    const patternMatch = this.matchPattern(value);

    // 2. Determine variable name from field context
    const variableName = this.resolveVariableName(fieldLabel, fieldName, placeholder, patternMatch?.type);

    // 3. Determine if this value should become a variable
    const shouldExtract = this.shouldExtract(value, patternMatch, fieldLabel, fieldType);

    if (!shouldExtract) {
      return this.literal(value);
    }

    const type = patternMatch?.type ?? 'string';
    const confidence = patternMatch?.confidence ?? 0.6;

    const variable: DetectedVariable = {
      name: variableName,
      type,
      placeholder: `{{${variableName}}}`,
      sampleValue: value,
      confidence,
      sourceField: fieldLabel ?? fieldName,
      sourceLabel: fieldLabel,
      occurrences: 1,
      validation: this.buildValidation(type, value),
      description: this.buildDescription(variableName, type, fieldLabel),
    };

    return { variable, rawValue: value, isVariable: true };
  }

  /**
   * Batch-detect variables from a sequence of (value, context) pairs.
   * Deduplicates by variable name and merges occurrence counts.
   */
  detectBatch(inputs: DetectionInput[]): Map<string, DetectedVariable> {
    const variableMap = new Map<string, DetectedVariable>();

    for (const input of inputs) {
      if (!input.value) continue;
      const result = this.detect(input);
      if (!result.isVariable) continue;

      const existing = variableMap.get(result.variable.name);
      if (existing) {
        existing.occurrences++;
        // Increase confidence on repeated detection
        existing.confidence = Math.min(1.0, existing.confidence + 0.05);
      } else {
        variableMap.set(result.variable.name, { ...result.variable });
      }
    }

    return variableMap;
  }

  /**
   * Given a detected variable map, substitute raw values in a string
   * with their {{placeholder}} forms.
   *
   * e.g., "Divyanshu Mishra" → "{{customer_name}}"
   */
  substitute(value: string, variables: Map<string, DetectedVariable>): string {
    for (const variable of variables.values()) {
      if (variable.sampleValue === value) {
        return variable.placeholder;
      }
    }
    return value;
  }

  private matchPattern(value: string): { type: VariableType; confidence: number } | null {
    for (const entry of VALUE_PATTERNS) {
      if (entry.pattern.test(value.trim())) {
        return { type: entry.type, confidence: entry.confidence };
      }
    }
    return null;
  }

  private resolveVariableName(
    fieldLabel: string | undefined,
    fieldName: string | undefined,
    placeholder: string | undefined,
    detectedType: VariableType | undefined,
  ): string {
    // Priority: aria-label > field name attr > placeholder text > type-based default
    const sources = [fieldLabel, fieldName, placeholder].filter(Boolean) as string[];

    for (const source of sources) {
      const normalized = normalizeLabel(source);
      const mapped = FIELD_LABEL_TO_VARIABLE[normalized];
      if (mapped) return mapped;

      // Try partial matches
      for (const [key, varName] of Object.entries(FIELD_LABEL_TO_VARIABLE)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          return varName;
        }
      }
    }

    // Fall back to cleaned field label
    for (const source of sources) {
      const cleaned = toVariableName(source);
      if (cleaned.length >= 2) return cleaned;
    }

    // Fall back to type-based name
    return this.typeDefaultName(detectedType ?? 'string');
  }

  private shouldExtract(
    value: string,
    patternMatch: { type: VariableType; confidence: number } | null,
    fieldLabel: string | undefined,
    fieldType: string | undefined,
  ): boolean {
    // Password fields: never
    if (fieldType === 'password') return false;

    // Checkbox/radio values (e.g., "on", "yes", "true"): not variables
    if (['on', 'off', 'yes', 'no', 'true', 'false', '1', '0'].includes(value.toLowerCase())) {
      return false;
    }

    // Static navigational values (URLs like "/" or "/dashboard")
    if (value.match(/^\/[a-z-/]*$/) && !patternMatch) return false;

    // If it's a high-confidence structured type → always extract
    if (
      patternMatch &&
      VariableDetector.ALWAYS_VARIABLE_TYPES.includes(patternMatch.type) &&
      patternMatch.confidence >= VariableDetector.HIGH_CONFIDENCE_THRESHOLD
    ) {
      return true;
    }

    // If field label maps to known variable type → extract
    if (fieldLabel) {
      const normalized = normalizeLabel(fieldLabel);
      if (FIELD_LABEL_TO_VARIABLE[normalized]) return true;
    }

    // Common UI action words are never variables
    const COMMON_NON_VARIABLES = new Set([
      'submit', 'save', 'cancel', 'continue', 'next', 'back', 'ok', 'done',
      'close', 'delete', 'confirm', 'new', 'create', 'edit', 'update', 'add',
      'login', 'logout', 'signup', 'register', 'proceed', 'finish', 'skip',
      'apply', 'reset', 'clear', 'search', 'filter', 'export', 'import',
    ]);
    if (COMMON_NON_VARIABLES.has(value.toLowerCase())) return false;

    // Multi-word strings that aren't in the common list are almost always data
    if (value.length >= 4 && /\s/.test(value)) {
      return true;
    }

    // String >= 8 chars with mixed case or digits → likely dynamic data
    if (value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value)) {
      return true;
    }

    return false;
  }

  private buildValidation(
    type: VariableType,
    sampleValue: string,
  ): DetectedVariable['validation'] {
    const v: DetectedVariable['validation'] = { required: true };

    switch (type) {
      case 'email':
        v.pattern = '^[^@]+@[^@]+\\.[^@]+$';
        break;
      case 'phone':
        v.pattern = '^[\\d\\s\\-\\.\\+\\(\\)]{7,20}$';
        break;
      case 'currency':
        v.pattern = '^\\$?[\\d,]+(\\.\\d{2})?$';
        break;
      case 'date':
        v.pattern = '^\\d{4}-\\d{2}-\\d{2}$';
        break;
      case 'number':
        v.min = 0;
        break;
      case 'string':
        v.minLength = 1;
        v.maxLength = Math.max(sampleValue.length * 3, 256);
        break;
      default:
        break;
    }

    return v;
  }

  private buildDescription(name: string, type: VariableType, fieldLabel?: string): string {
    const readableName = name.replace(/_/g, ' ');
    if (fieldLabel) return `${fieldLabel} (${type})`;
    return `${readableName} (${type})`;
  }

  private typeDefaultName(type: VariableType): string {
    const defaults: Record<VariableType, string> = {
      string: 'text_value',
      number: 'number_value',
      boolean: 'flag',
      email: 'email',
      phone: 'phone_number',
      date: 'date',
      datetime: 'datetime',
      currency: 'amount',
      url: 'url',
      enum: 'option',
      'invoice-number': 'invoice_number',
      'order-number': 'order_number',
      'postal-code': 'postal_code',
      username: 'username',
      id: 'id',
      unknown: 'value',
    };
    return defaults[type] ?? 'value';
  }

  private literal(value: string): DetectionResult {
    return {
      variable: {
        name: 'literal',
        type: 'string',
        placeholder: value,
        sampleValue: value,
        confidence: 0,
        occurrences: 1,
      },
      rawValue: value,
      isVariable: false,
    };
  }
}
