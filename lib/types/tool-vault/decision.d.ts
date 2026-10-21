/**
 * Applies redaction to a `tools/post-execute` outcome so no stored value
 * reaches the model, the session log, or a spill file.
 *
 * What the registry persists from a result is its content, `meta`, and
 * additional contexts; the canonical `value` is execution-local. A successful
 * result is redacted by replacing its `value`, from which the registry
 * re-renders content and recomputes `meta`. A failed result cannot take a new
 * value, so it is blocked with redacted feedback, which also drops its `meta`.
 * Contexts the tool body attached survive any `accept`, so a match there
 * blocks too.
 * @module dsh-off-the-record/tool-vault/decision
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { type Matcher } from './redact.ts';
/** Feedback used when redaction itself fails: the result is withheld, never passed through. */
export declare const WITHHELD: ContentBlock[];
/**
 * Redact one post-execute decision.
 * @param decision - the decision from the listeners inside this one.
 * @param result - the dispatch outcome they decided on.
 * @param matcher - current vault matcher.
 * @returns the decision to pass outward, unchanged when nothing matched.
 */
export declare function redactDecision(decision: PostToolDecision, result: Readonly<ToolExecutionResult>, matcher: Matcher): PostToolDecision;
