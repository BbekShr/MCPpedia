/**
 * Tracks bot runs in the bot_runs table.
 * Usage:
 *   const run = await BotRun.start('discover')
 *   // ... do work ...
 *   run.addProcessed(10)
 *   run.addUpdated(3)
 *   await run.finish()            // success
 *   await run.fail('some error')  // failure
 */

import { createAdminClient } from './supabase'

let _client: ReturnType<typeof createAdminClient> | null = null
function db() {
  if (!_client) _client = createAdminClient()
  return _client
}

export class BotRun {
  private id: string | null = null
  private botName: string
  private startTime: number
  private processed = 0
  private updated = 0
  private summary: Record<string, unknown> = {}

  private constructor(botName: string) {
    this.botName = botName
    this.startTime = Date.now()
  }

  static async start(botName: string): Promise<BotRun> {
    const run = new BotRun(botName)
    const { data, error } = await db()
      .from('bot_runs')
      .insert({ bot_name: botName, status: 'running' })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create bot_run:', error.message)
    } else {
      run.id = data.id
    }
    return run
  }

  addProcessed(n = 1) { this.processed += n }
  addUpdated(n = 1) { this.updated += n }
  setSummary(data: Record<string, unknown>) { this.summary = { ...this.summary, ...data } }

  async finish() {
    if (!this.id) return
    const duration = Date.now() - this.startTime
    await db().from('bot_runs').update({
      status: 'success',
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      servers_processed: this.processed,
      servers_updated: this.updated,
      summary: this.summary,
    }).eq('id', this.id)
  }

  async fail(error: string) {
    if (!this.id) return
    const duration = Date.now() - this.startTime
    await db().from('bot_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      duration_ms: duration,
      servers_processed: this.processed,
      servers_updated: this.updated,
      error_message: error.slice(0, 2000),
      summary: this.summary,
    }).eq('id', this.id)
  }
}
