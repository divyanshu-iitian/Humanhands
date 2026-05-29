import { describe, it, expect } from 'vitest';
import { VariableDetector } from '../VariableDetector.js';

const detector = new VariableDetector();

describe('VariableDetector', () => {
  describe('email detection', () => {
    it('detects standard email', () => {
      const r = detector.detect({ value: 'divyanshu@gmail.com', fieldLabel: 'Email' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('email');
      expect(r.variable.name).toBe('email');
      expect(r.variable.placeholder).toBe('{{email}}');
    });

    it('detects email with complex domain', () => {
      const r = detector.detect({ value: 'user.name+tag@company.co.uk' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('email');
    });
  });

  describe('invoice number detection', () => {
    it('detects INV- prefix', () => {
      const r = detector.detect({ value: 'INV-2026-001', fieldLabel: 'Invoice Number' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('invoice-number');
      expect(r.variable.name).toBe('invoice_number');
    });

    it('detects various invoice prefixes', () => {
      const cases = ['INV001', 'INVOICE-2024-01', 'BILL-5678', 'REC-99'];
      for (const val of cases) {
        const r = detector.detect({ value: val });
        expect(r.variable.type).toBe('invoice-number');
      }
    });
  });

  describe('phone number detection', () => {
    it('detects US formatted phone', () => {
      const r = detector.detect({ value: '(555) 867-5309', fieldLabel: 'Phone Number' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('phone');
      expect(r.variable.name).toBe('phone_number');
    });

    it('detects 10-digit phone', () => {
      const r = detector.detect({ value: '9876543210', fieldLabel: 'Mobile' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('phone');
    });

    it('detects international phone', () => {
      const r = detector.detect({ value: '+91-9876543210' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('phone');
    });
  });

  describe('currency detection', () => {
    it('detects USD amount', () => {
      const r = detector.detect({ value: '$1,234.56', fieldLabel: 'Amount' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('currency');
      expect(r.variable.name).toBe('amount');
    });

    it('detects plain decimal', () => {
      const r = detector.detect({ value: '99.99', fieldLabel: 'Price' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.name).toBe('price');
    });
  });

  describe('date detection', () => {
    it('detects ISO date', () => {
      const r = detector.detect({ value: '2026-05-29', fieldLabel: 'Due Date' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('date');
      expect(r.variable.name).toBe('due_date');
    });

    it('detects MM/DD/YYYY format', () => {
      const r = detector.detect({ value: '05/29/2026' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.type).toBe('date');
    });
  });

  describe('name detection via field label', () => {
    it('detects customer name via label', () => {
      const r = detector.detect({ value: 'Divyanshu Mishra', fieldLabel: 'Customer Name' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.name).toBe('customer_name');
    });

    it('detects company name', () => {
      const r = detector.detect({ value: 'Acme Corp', fieldLabel: 'Company' });
      expect(r.isVariable).toBe(true);
      expect(r.variable.name).toBe('company_name');
    });
  });

  describe('non-variables (literals)', () => {
    it('does not extract submit button text', () => {
      const r = detector.detect({ value: 'Submit' });
      expect(r.isVariable).toBe(false);
    });

    it('does not extract very short values', () => {
      const r = detector.detect({ value: 'OK' });
      expect(r.isVariable).toBe(false);
    });

    it('does not extract boolean-like values', () => {
      for (const val of ['true', 'false', 'on', 'off', 'yes', 'no']) {
        const r = detector.detect({ value: val });
        expect(r.isVariable).toBe(false);
      }
    });

    it('does not extract password field value', () => {
      const r = detector.detect({ value: 'MySecretP@ssword123', fieldType: 'password' });
      expect(r.isVariable).toBe(false);
    });
  });

  describe('batch detection', () => {
    it('deduplicates variables by name', () => {
      const inputs = [
        { value: 'user@example.com', fieldLabel: 'Email' },
        { value: 'user2@example.com', fieldLabel: 'Email' },
        { value: 'Acme Corp', fieldLabel: 'Company Name' },
      ];
      const map = detector.detectBatch(inputs);
      expect(map.has('email')).toBe(true);
      expect(map.get('email')?.occurrences).toBe(2);
      expect(map.has('company_name')).toBe(true);
    });
  });

  describe('substitution', () => {
    it('replaces sample values with placeholders', () => {
      const result = detector.detect({ value: 'user@test.com', fieldLabel: 'Email' });
      const varMap = new Map([[result.variable.name, result.variable]]);
      expect(detector.substitute('user@test.com', varMap)).toBe('{{email}}');
    });
  });
});
