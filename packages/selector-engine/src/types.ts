export interface SelectorCandidate {
  selector: string;
  strategy: SelectorStrategy;
  confidence: number;
  stable: boolean;
}

export type SelectorStrategy =
  | 'id'
  | 'data-testid'
  | 'aria-label'
  | 'name'
  | 'text-content'
  | 'css-class'
  | 'css-structural'
  | 'xpath'
  | 'combined';

export interface GeneratedSelector {
  primary: string;
  fallbacks: string[];
  xpath?: string;
  semantic?: string;
  dataTestId?: string;
  candidates: SelectorCandidate[];
  generatedAt: number;
}

export interface SelectorValidationResult {
  selector: string;
  valid: boolean;
  matchCount: number;
  uniqueMatch: boolean;
  error?: string;
}

export interface ElementFingerprint {
  tagName: string;
  id?: string;
  classes: string[];
  ariaLabel?: string;
  ariaRole?: string;
  dataTestId?: string;
  name?: string;
  type?: string;
  textContent?: string;
  depth: number;
  childIndex: number;
}
