// Test-only plugin: records feedback after the first turn ends, appending the
// same feedback/record event the Web feedback dialog and /feedback command append.
export const name = 'otr-test-record-feedback'

export function apply(ctx) {
  let recorded = false
  ctx.on('session/event', (session, event) => {
    if (recorded || event.type !== 'turn/end') return
    recorded = true
    // A session/event listener runs inside an append; appending again must wait a tick.
    setImmediate(() => { session.append('feedback/record', { text: 'otr boot test' }) })
  })
}
