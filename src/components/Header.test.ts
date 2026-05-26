import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const srcDir = join(process.cwd(), 'src')

function readSourceFiles(dir: string): string {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .map((path) => {
      const stat = statSync(path)
      if (stat.isDirectory()) return readSourceFiles(path)
      if (!/\.(ts|tsx)$/.test(path)) return ''
      return readFileSync(path, 'utf8')
    })
    .join('\n')
}

describe('Header update badge', () => {
  it('does not show or check for release updates', () => {
    const headerSource = readFileSync(join(srcDir, 'components/Header.tsx'), 'utf8')
    const allSource = readSourceFiles(srcDir)

    expect(headerSource).not.toContain('NEW')
    expect(allSource).not.toContain('useVersionCheck')
    expect(allSource).not.toContain('api.github.com/repos')
    expect(allSource).not.toContain('/releases/latest')
  })
})
