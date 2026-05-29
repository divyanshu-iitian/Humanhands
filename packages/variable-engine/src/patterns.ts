import type { VariableType } from '@humanhands/shared-types';

export interface PatternEntry {
  type: VariableType;
  pattern: RegExp;
  confidence: number;
  description: string;
}

/**
 * Ordered by specificity — most specific patterns first.
 * First match wins for type classification.
 */
export const VALUE_PATTERNS: PatternEntry[] = [
  // ── Highly structured identifiers ────────────────────────────────────────
  {
    type: 'email',
    pattern: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
    confidence: 0.99,
    description: 'Email address',
  },
  {
    type: 'invoice-number',
    pattern: /^(INV|INVOICE|ORD|ORDER|PO|QUOTE|QTE|BILL|REC|REF)[-\s#]?\d{2,}([-\s]\d{0,6})?$/i,
    confidence: 0.97,
    description: 'Invoice or order number',
  },
  {
    type: 'order-number',
    pattern: /^(ORD|ORDER|PO|SO|DO|WO|JOB)[-\s#]?\d{4,}$/i,
    confidence: 0.97,
    description: 'Order or purchase order number',
  },
  {
    type: 'url',
    pattern: /^https?:\/\/.{3,}/,
    confidence: 0.99,
    description: 'URL',
  },
  {
    type: 'datetime',
    pattern: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
    confidence: 0.98,
    description: 'ISO datetime',
  },
  {
    type: 'date',
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    confidence: 0.97,
    description: 'ISO date (YYYY-MM-DD)',
  },
  {
    type: 'date',
    pattern: /^(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-]\d{2,4}$/,
    confidence: 0.85,
    description: 'Date (MM/DD/YYYY or MM-DD-YYYY)',
  },
  {
    type: 'date',
    pattern: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{1,2}[\s,]+\d{4}$/i,
    confidence: 0.88,
    description: 'Human-readable date',
  },

  // ── Phone numbers ─────────────────────────────────────────────────────────
  {
    type: 'phone',
    pattern: /^\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
    confidence: 0.93,
    description: 'US/Canadian phone number',
  },
  {
    type: 'phone',
    pattern: /^\+\d{1,3}[-.\s]?\d{4,14}$/,
    confidence: 0.88,
    description: 'International phone number',
  },
  {
    type: 'phone',
    pattern: /^\d{10}$/,
    confidence: 0.72,
    description: '10-digit phone number (no formatting)',
  },

  // ── Currency and numbers ───────────────────────────────────────────────────
  {
    type: 'currency',
    pattern: /^[$€£¥₹]?\s?\d{1,3}(,\d{3})*(\.\d{2})?$|^\d+\.\d{2}$/,
    confidence: 0.88,
    description: 'Currency amount',
  },
  {
    type: 'number',
    pattern: /^-?\d+(\.\d+)?$/,
    confidence: 0.70,
    description: 'Numeric value',
  },

  // ── Postal codes ──────────────────────────────────────────────────────────
  {
    type: 'postal-code',
    pattern: /^\d{5}(-\d{4})?$/,
    confidence: 0.85,
    description: 'US ZIP code',
  },
  {
    type: 'postal-code',
    pattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    confidence: 0.90,
    description: 'Canadian postal code',
  },

  // ── Identifiers and names ─────────────────────────────────────────────────
  {
    type: 'id',
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    confidence: 0.99,
    description: 'UUID',
  },
  {
    type: 'id',
    pattern: /^[A-Z]{2,4}-\d{4,}(-[A-Z0-9]+)?$/,
    confidence: 0.82,
    description: 'Alphanumeric ID (e.g., CUST-1234)',
  },
  {
    type: 'username',
    pattern: /^@?[a-zA-Z][a-zA-Z0-9_.]{2,29}$/,
    confidence: 0.55,
    description: 'Username or handle',
  },
];

/**
 * Maps normalized field labels → variable names.
 * Used when value patterns alone aren't specific enough.
 */
export const FIELD_LABEL_TO_VARIABLE: Record<string, string> = {
  // Person names
  'first name': 'first_name',
  'firstname': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'full name': 'full_name',
  'fullname': 'full_name',
  'name': 'name',
  'your name': 'name',
  'contact name': 'contact_name',
  'customer name': 'customer_name',
  'customer': 'customer_name',
  'client name': 'client_name',
  'client': 'client_name',
  'recipient': 'recipient_name',
  // Business
  'company': 'company_name',
  'company name': 'company_name',
  'organization': 'organization_name',
  'business name': 'business_name',
  // Contact
  'email': 'email',
  'email address': 'email',
  'phone': 'phone_number',
  'phone number': 'phone_number',
  'telephone': 'phone_number',
  'mobile': 'mobile_number',
  'fax': 'fax_number',
  // Address
  'address': 'address',
  'street': 'street_address',
  'street address': 'street_address',
  'city': 'city',
  'state': 'state',
  'zip': 'zip_code',
  'zip code': 'zip_code',
  'postal code': 'postal_code',
  'country': 'country',
  // Financial
  'amount': 'amount',
  'total': 'total_amount',
  'total amount': 'total_amount',
  'price': 'price',
  'quantity': 'quantity',
  'qty': 'quantity',
  'discount': 'discount',
  'tax': 'tax_amount',
  // Documents
  'invoice number': 'invoice_number',
  'invoice #': 'invoice_number',
  'invoice': 'invoice_number',
  'order number': 'order_number',
  'order #': 'order_number',
  'order id': 'order_id',
  'po number': 'po_number',
  'reference': 'reference_number',
  'reference number': 'reference_number',
  'ref': 'reference_number',
  // Dates
  'date': 'date',
  'due date': 'due_date',
  'start date': 'start_date',
  'end date': 'end_date',
  'delivery date': 'delivery_date',
  'invoice date': 'invoice_date',
  'expiry date': 'expiry_date',
  // Auth
  'username': 'username',
  'user name': 'username',
  'password': 'password',
  'confirm password': 'confirm_password',
  // Content
  'subject': 'subject',
  'title': 'title',
  'description': 'description',
  'notes': 'notes',
  'comments': 'comments',
  'message': 'message',
  'search': 'search_query',
  'query': 'search_query',
  // Generic
  'id': 'id',
  'code': 'code',
  'status': 'status',
  'type': 'type',
  'category': 'category',
  'tag': 'tag',
};

export function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

export function toVariableName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^(\d)/, '_$1')
    .slice(0, 40);
}
