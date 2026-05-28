import type { UIElement } from '@humanhands/shared-types';
import type { UIGraph } from './UIGraph.js';

export type TraversalVisitor = (element: UIElement, depth: number) => boolean | void;

export class UIGraphTraversal {
  private readonly graph: UIGraph;

  constructor(graph: UIGraph) {
    this.graph = graph;
  }

  /**
   * Depth-first traversal from root elements.
   * Visitor returning `false` prunes that subtree.
   */
  depthFirst(visitor: TraversalVisitor): void {
    const rootElements = this.graph
      .toJSON()
      .rootIds.map((id) => this.graph.getElementById(id))
      .filter((el): el is UIElement => el !== undefined);

    for (const root of rootElements) {
      this.dfsVisit(root, visitor, 0);
    }
  }

  /**
   * Breadth-first traversal from root elements.
   */
  breadthFirst(visitor: TraversalVisitor): void {
    const queue: Array<{ element: UIElement; depth: number }> = this.graph
      .toJSON()
      .rootIds.map((id) => this.graph.getElementById(id))
      .filter((el): el is UIElement => el !== undefined)
      .map((el) => ({ element: el, depth: 0 }));

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;

      const { element, depth } = item;
      const continueTraversal = visitor(element, depth);
      if (continueTraversal === false) continue;

      const children = this.graph.getChildren(element.id);
      for (const child of children) {
        queue.push({ element: child, depth: depth + 1 });
      }
    }
  }

  findFirst(predicate: (el: UIElement) => boolean): UIElement | undefined {
    let found: UIElement | undefined;
    this.breadthFirst((el) => {
      if (predicate(el)) {
        found = el;
        return false;
      }
      return undefined;
    });
    return found;
  }

  findAll(predicate: (el: UIElement) => boolean): UIElement[] {
    const results: UIElement[] = [];
    this.breadthFirst((el) => {
      if (predicate(el)) results.push(el);
      return undefined;
    });
    return results;
  }

  getAncestors(elementId: string): UIElement[] {
    const ancestors: UIElement[] = [];
    let current = this.graph.getElementById(elementId);

    while (current?.parentId) {
      const parent = this.graph.getElementById(current.parentId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }

    return ancestors;
  }

  getPath(elementId: string): UIElement[] {
    return [...this.getAncestors(elementId).reverse(), this.graph.getElementById(elementId)].filter(
      (el): el is UIElement => el !== undefined,
    );
  }

  private dfsVisit(element: UIElement, visitor: TraversalVisitor, depth: number): void {
    const result = visitor(element, depth);
    if (result === false) return;

    for (const child of this.graph.getChildren(element.id)) {
      this.dfsVisit(child, visitor, depth + 1);
    }
  }
}
