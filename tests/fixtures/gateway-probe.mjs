// Test-only plugin: calls offTheRecord Remote methods through the API Gateway's
// invoke path, as an owner Peer, the way a browser call arrives, and prints the
// outcomes on stderr. The calls come from OTR_PROBE_CALLS.
//
// Recomposition (including the one a settings write causes) re-applies this
// plugin. Every apply records its context as the latest live one; a single
// runner per process makes the calls through whichever context is live.
export const name = 'otr-test-gateway-probe'
export const inject = ['typertGateway', 'offTheRecord']

const state = globalThis.__otrProbe ??= { ctx: undefined, started: false }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function invoke(peerFor, request) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await state.ctx.typertGateway.invoke({ ...request, peer: await peerFor(state.ctx) })
    } catch (error) {
      // The context went inactive mid-recomposition: wait for the next apply.
      if (attempt < 50 && /inactive context|reading 'invoke'/.test(String(error))) { await sleep(100); continue }
      throw error
    }
  }
}

export function apply(ctx) {
  state.ctx = ctx
  if (state.started) return
  state.started = true
  void (async () => {
    // Let the rest of the tree, including the credential store, finish starting.
    await sleep(300)
    const { Peer } = await import(process.env.OTR_CONNECTION_URL)
    const peers = new WeakMap()
    const peerFor = (live) => {
      if (!peers.has(live.root)) peers.set(live.root, new Peer(live.root, { principal: { kind: 'owner' } }))
      return peers.get(live.root)
    }
    const results = []
    for (const [method, args, delayMs] of JSON.parse(process.env.OTR_PROBE_CALLS)) {
      if (delayMs) await sleep(delayMs)
      try {
        results.push({ method, ok: true, value: await invoke(peerFor, { namespace: 'offTheRecord', method, args }) })
      } catch (error) {
        results.push({ method, ok: false, error: String(error) })
      }
    }
    process.stderr.write(`OTR_PROBE ${JSON.stringify(results)}\n`)
  })()
}
