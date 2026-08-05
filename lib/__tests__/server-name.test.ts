import { describe, it, expect } from 'vitest'
import { normalizeServerName, humanizeServerName } from '../server-name'

describe('normalizeServerName', () => {
  it('fixes the case that shipped in 36k titles', () => {
    expect(normalizeServerName('Mcp Hn')).toBe('MCP HN')
  })

  it('fixes multi-acronym names', () => {
    expect(normalizeServerName('Mcp Server Sql Analyzer')).toBe('MCP Server SQL Analyzer')
    expect(normalizeServerName('Aws S3 Api Bridge')).toBe('AWS S3 API Bridge')
  })

  it('restores mixed-case product names title-casing breaks', () => {
    expect(normalizeServerName('Github Gitlab Npm Pypi K8s Oauth Jwt')).toBe(
      'GitHub GitLab npm PyPI K8s OAuth JWT',
    )
  })

  it('only rewrites whole tokens, never substrings', () => {
    // "Apian" contains "api"; "Aid" contains "ai"; "Dbase" contains "db".
    expect(normalizeServerName('Apian Aid Dbase')).toBe('Apian Aid Dbase')
  })

  it('keeps surrounding punctuation', () => {
    expect(normalizeServerName('Bridge (api) — sql,')).toBe('Bridge (API) — SQL,')
  })

  it('leaves ordinary words alone', () => {
    expect(normalizeServerName('Weather Forecast Server')).toBe('Weather Forecast Server')
  })

  it('leaves registry-style identifiers untouched', () => {
    expect(normalizeServerName('io.github.WarTech9/clawswap')).toBe('io.github.WarTech9/clawswap')
    expect(normalizeServerName('com.googleapis.developerknowledge/mcp')).toBe(
      'com.googleapis.developerknowledge/mcp',
    )
  })

  it('preserves internal whitespace exactly', () => {
    expect(normalizeServerName('Mcp   Hn')).toBe('MCP   HN')
  })

  it('handles null and empty input', () => {
    expect(normalizeServerName(null)).toBe('')
    expect(normalizeServerName(undefined)).toBe('')
    expect(normalizeServerName('')).toBe('')
  })
})

describe('humanizeServerName', () => {
  it('turns a package name into a display name with correct casing', () => {
    expect(humanizeServerName('mcp-hn')).toBe('MCP HN')
    expect(humanizeServerName('mcp-server-sql-analyzer')).toBe('MCP Server SQL Analyzer')
    expect(humanizeServerName('aws_s3_tools')).toBe('AWS S3 Tools')
  })

  it('collapses repeated separators', () => {
    expect(humanizeServerName('mcp--weather')).toBe('MCP Weather')
  })

  it('trims', () => {
    expect(humanizeServerName('  mcp-weather  ')).toBe('MCP Weather')
  })
})
