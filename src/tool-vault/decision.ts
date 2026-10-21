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

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { jsonMatches, redactJson, type Matcher } from './redact.ts'

/** Feedback used when redaction itself fails: the result is withheld, never passed through. */
export const WITHHELD: ContentBlock[] = [{ type: 'text', text: '[tool result withheld: it may contain a stored secret, and redaction failed]' }]

/**
 * Redact one post-execute decision.
 * @param decision - the decision from the listeners inside this one.
 * @param result - the dispatch outcome they decided on.
 * @param matcher - current vault matcher.
 * @returns the decision to pass outward, unchanged when nothing matched.
 */
export function redactDecision(decision: PostToolDecision, result: Readonly<ToolExecutionResult>, matcher: Matcher): PostToolDecision {
  if (matcher.empty) return decision
  const contexts = decision.additionalContexts
  const redactedContexts = contexts === undefined ? {} : { additionalContexts: redactJson(contexts, matcher) }

  if (decision.kind === 'block') {
    if (!jsonMatches(decision.feedback, matcher) && !jsonMatches(contexts, matcher)) return decision
    return { kind: 'block', feedback: redactJson(decision.feedback, matcher), ...redactedContexts }
  }

  const replacesValue = Object.hasOwn(decision, 'value')
  const replacesContent = !replacesValue && decision.content !== undefined
  const content = replacesContent ? decision.content ?? [] : result.content
  const value = replacesValue ? decision.value : result.isError ? undefined : result.value
  const bodyContexts = result.additionalContexts

  const leaks = {
    content: jsonMatches(content, matcher),
    value: jsonMatches(value, matcher),
    meta: !replacesValue && jsonMatches(result.meta, matcher),
    contexts: jsonMatches(contexts, matcher),
    body: jsonMatches(bodyContexts, matcher),
  }
  if (!leaks.content && !leaks.value && !leaks.meta && !leaks.contexts && !leaks.body) return decision

  // Accepting keeps the body's own contexts, and a failure cannot take a new
  // value: both cases block, carrying the redacted content as the feedback.
  const mustBlock = leaks.body || result.isError || (replacesContent && leaks.meta)
  if (mustBlock) {
    const carried = [...bodyContexts ?? [], ...contexts ?? []]
    return {
      kind: 'block',
      feedback: redactJson(content, matcher),
      ...carried.length > 0 ? { additionalContexts: redactJson(carried, matcher) } : {},
    }
  }
  if (replacesContent) return { kind: 'accept', content: redactJson(content, matcher), ...redactedContexts }
  return { kind: 'accept', value: redactJson(value ?? null, matcher), ...redactedContexts }
}
