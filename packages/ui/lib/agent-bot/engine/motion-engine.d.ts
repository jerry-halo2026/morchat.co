/**
 * Hand-written types for `motion-engine.js`.
 *
 * The engine is a byte-for-byte copy of the upstream study artifact (see
 * PROVENANCE.md), so its own TypeScript surface is deliberately narrow: the
 * three named exports the artifact guarantees. `GrokBot` accepts a large, half
 * documented prop bag; typing it loosely here keeps the copy untouched instead
 * of patching upstream bytes.
 */
import type * as React from "react";

export const GrokBot: React.ComponentType<any>;
export const STATES: string[];
export const SHAPES: string[];
