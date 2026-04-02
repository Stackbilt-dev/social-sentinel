/**
 * Lightweight contract definition utility.
 *
 * Mirrors the Stackbilt Contract Ontology Layer spec (design-philosophy.md)
 * using Zod + plain TypeScript. When @stackbilt/contracts ships, these
 * definitions migrate 1:1 into `defineContract()` calls.
 *
 * A contract declares:
 *   schema      — entity shape (Zod)
 *   operations  — valid actions with typed I/O
 *   states      — state machine transitions
 *   surfaces    — API route + DB table mapping
 *   authority   — role-based access rules
 *   invariants  — runtime business rules
 *   version     — semver for the contract
 */

import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────

export interface ContractOperation<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | 'self' = z.ZodType | 'self',
> {
  input: TInput;
  output: TOutput;
  transition?: { from: string | string[]; to: string };
  emits?: string[];
}

export interface ContractStates {
  field: string;
  initial: string;
  transitions: Record<string, Record<string, string | null>>;
}

export interface ContractSurface {
  api?: {
    basePath: string;
    routes: Record<string, { method: string; path: string }>;
  };
  db?: {
    table: string;
    indexes?: string[];
  };
}

export type AuthRequirement =
  | { requires: 'public' }
  | { requires: 'authenticated' }
  | { requires: 'owner'; ownerField: string }
  | { requires: 'role'; roles: string[] };

export interface ContractInvariant {
  name: string;
  description: string;
  check: (entity: unknown) => true | string;
  appliesTo: string[];
}

export interface ContractDefinition<
  TSchema extends z.ZodType = z.ZodType,
> {
  name: string;
  version: string;
  description: string;
  schema: TSchema;
  operations: Record<string, ContractOperation>;
  states?: ContractStates;
  surfaces: ContractSurface;
  authority: Record<string, AuthRequirement>;
  invariants?: ContractInvariant[];
}

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Define a domain contract. Pure declaration — no side effects.
 * Returns the definition with full type inference on the schema.
 */
export function defineContract<TSchema extends z.ZodType>(
  definition: ContractDefinition<TSchema>,
): ContractDefinition<TSchema> {
  return definition;
}

/**
 * Cross-contract reference. Declares a typed foreign key.
 * At runtime it's just a Zod schema; generators use the metadata
 * to produce JOIN clauses and referential integrity checks.
 */
export function ref<T extends ContractDefinition>(
  _contract: T,
  _field: string,
): z.ZodString {
  return z.string();
}
