/**
 * Which workspace a tool call's secrets come from: the directory the root
 * session was created in, never the current working directory. The model can
 * change its working directory and start a subagent in any directory; neither
 * moves a session into another workspace's secrets.
 * @module dsh-off-the-record/tool-vault/scope
 */

import { workspaceDirectory, type WorkspaceDirectory } from '../vault/index.ts'

/** The parts of a session the scope reads. */
export interface ScopedSession {
  readonly header: { readonly id: string; readonly cwd?: string | undefined; readonly parentSession?: string | undefined }
}

/** Live-session lookup, as `ctx.sessions` provides it. */
export interface SessionLookup {
  get(id: never): ScopedSession | undefined
}

/**
 * Resolve the workspace directory for a session: follow live parents to the
 * root (subagents and forks), then take its recorded creation directory.
 * Child sessions record their parent's directory, so an unloaded parent falls
 * back to the session's own.
 * @param session - the calling session, if any.
 * @param sessions - live sessions, when the store is mounted.
 * @returns the canonical workspace directory, or undefined for global-only.
 */
export function sessionWorkspace(session: ScopedSession | undefined, sessions: SessionLookup | undefined): WorkspaceDirectory | undefined {
  let current = session
  const seen = new Set<string>()
  while (current !== undefined && current.header.parentSession !== undefined && !seen.has(current.header.id)) {
    seen.add(current.header.id)
    const parent = sessions?.get(current.header.parentSession as never)
    if (parent === undefined) break
    current = parent
  }
  const cwd = current?.header.cwd
  return cwd === undefined ? undefined : workspaceDirectory(cwd)
}
