// tsdown plugin: lowers standard decorators (the @Remote markers on Off the
// Record's Remote methods) with TypeScript, as the harness's own build does,
// because the bundler leaves them in place and Node cannot run them.
import ts from 'typescript'

const TYPESCRIPT_MODULE = /^[^?]*\.[cm]?tsx?(?:\?|$)/
const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

export function lowerDecorators() {
  return {
    name: 'otr-lower-decorators',
    transform: {
      filter: { id: TYPESCRIPT_MODULE },
      handler(code: string, id: string) {
        if (!DECORATOR_SYNTAX.test(code)) return undefined
        const fileName = id.replace(/\?.*$/su, '')
        const result = ts.transpileModule(code, {
          fileName,
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, sourceMap: true },
        })
        return { code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'), map: result.sourceMapText }
      },
    },
  }
}
