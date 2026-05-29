import type { RecordedAction, VerificationRule } from '@humanhands/shared-types';

/**
 * Injects appropriate verification rules into each compiled step
 * based on the recorded action's post-state and action type.
 */
export class VerificationBuilder {
  build(action: RecordedAction): VerificationRule[] {
    const rules: VerificationRule[] = [];
    const post = action.postState;

    switch (action.actionType) {
      case 'navigate':
        rules.push({
          type: 'url-changed',
          urlPattern: post?.newUrl ?? action.url,
          timeout: 15000,
          required: true,
        });
        break;

      case 'type': {
        const value = action.value;
        if (value !== undefined) {
          rules.push({
            type: 'value-set',
            selector: action.target?.selector.primary,
            expectedValue: value,
            timeout: 3000,
            required: true,
          });
        }
        break;
      }

      case 'select':
        if (action.value !== undefined) {
          rules.push({
            type: 'value-set',
            selector: action.target?.selector.primary,
            expectedValue: action.value,
            timeout: 3000,
            required: true,
          });
        }
        break;

      case 'click': {
        if (post?.urlChanged && post.newUrl) {
          rules.push({
            type: 'url-contains',
            urlPattern: new URL(post.newUrl).pathname,
            timeout: 10000,
            required: true,
          });
        } else if (post?.modalOpened) {
          rules.push({
            type: 'modal-appeared',
            timeout: 5000,
            required: true,
          });
        } else if (post?.modalClosed) {
          rules.push({
            type: 'modal-dismissed',
            timeout: 5000,
            required: false,
          });
        } else {
          rules.push({
            type: 'loading-completed',
            timeout: 8000,
            required: false,
          });
        }
        break;
      }

      case 'submit':
        if (post?.urlChanged) {
          rules.push({
            type: 'url-changed',
            timeout: 15000,
            required: true,
          });
        } else {
          rules.push({
            type: 'loading-completed',
            timeout: 10000,
            required: true,
          });
        }
        break;

      case 'waitFor':
        if (action.target?.selector.primary) {
          rules.push({
            type: 'element-visible',
            selector: action.target.selector.primary,
            timeout: action.options?.timeout ?? 10000,
            required: true,
          });
        }
        break;

      default:
        break;
    }

    return rules;
  }
}
