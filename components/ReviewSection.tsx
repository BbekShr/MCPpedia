'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface Review {
  id: string
  rating_overall: number
  rating_ease_of_setup: number | null
  rating_reliability: number | null
  rating_documentation: number | null
  used_with: string | null
  use_case: string | null
  body: string
  pros: string | null
  cons: string | null
  helpful_count: number
  created_at: string
  profile: { username: string; avatar_url: string | null } | null
}

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < count ? 'text-yellow' : 'text-border'}>&#9733;</span>
      ))}
    </span>
  )
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-muted w-32 shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n <= value}
            className={`text-lg ${n <= value ? 'text-yellow' : 'text-border'} hover:text-yellow transition-colors`}
          >
            &#9733;
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ReviewSection({ serverId }: { serverId: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    rating_overall: 0,
    rating_ease_of_setup: 0,
    rating_reliability: 0,
    rating_documentation: 0,
    used_with: '',
    use_case: '',
    body: '',
    pros: '',
    cons: '',
  })

  const supabase = createClient()

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('*, profile:profiles(username, avatar_url)')
      .eq('server_id', serverId)
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) setReviews(data as Review[])
  }, [serverId, supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    // Initial load is a subscription-like fetch of server data — legitimate
    // effect use even though the handler updates state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReviews()
  }, [supabase.auth, fetchReviews])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || form.rating_overall === 0 || form.body.length < 50) return
    setSubmitting(true)

    const { error } = await supabase.from('reviews').insert({
      server_id: serverId,
      user_id: user.id,
      ...form,
      rating_ease_of_setup: form.rating_ease_of_setup || null,
      rating_reliability: form.rating_reliability || null,
      rating_documentation: form.rating_documentation || null,
      used_with: form.used_with || null,
      use_case: form.use_case || null,
      pros: form.pros || null,
      cons: form.cons || null,
    })

    if (!error) {
      setShowForm(false)
      setForm({ rating_overall: 0, rating_ease_of_setup: 0, rating_reliability: 0, rating_documentation: 0, used_with: '', use_case: '', body: '', pros: '', cons: '' })
      fetchReviews()
    }
    setSubmitting(false)
  }

  return (
    <div>
      {/* Review summary */}
      {reviews.length > 0 && (
        <div className="flex items-center gap-3 mb-4 text-sm">
          <Stars count={Math.round(reviews.reduce((s, r) => s + r.rating_overall, 0) / reviews.length)} />
          <span className="text-text-muted">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length > 0 ? (
        <div className="space-y-4 mb-6">
          {reviews.map(r => (
            <div key={r.id} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    @{r.profile?.username || 'anonymous'}
                  </span>
                  <Stars count={r.rating_overall} />
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              {(r.used_with || r.use_case) && (
                <div className="flex gap-3 text-xs text-text-muted mb-2">
                  {r.used_with && <span>Used with: {r.used_with}</span>}
                  {r.use_case && <span>For: {r.use_case}</span>}
                </div>
              )}

              <p className="text-sm text-text-primary mb-2">{r.body}</p>

              {(r.pros || r.cons) && (
                <div className="grid grid-cols-2 gap-3 text-xs mt-2">
                  {r.pros && (
                    <div>
                      <span className="text-green font-medium">Pros: </span>
                      <span className="text-text-muted">{r.pros}</span>
                    </div>
                  )}
                  {r.cons && (
                    <div>
                      <span className="text-red font-medium">Cons: </span>
                      <span className="text-text-muted">{r.cons}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-md p-4 mb-4 bg-bg-secondary">
          <p className="text-sm text-text-primary font-medium mb-1">Have you used this server?</p>
          <p className="text-xs text-text-muted mb-2">Share your experience — it helps other developers decide.</p>
          <div className="flex flex-wrap gap-2 text-xs text-text-muted">
            <span className="px-2 py-0.5 rounded-full bg-bg border border-border">How easy was setup?</span>
            <span className="px-2 py-0.5 rounded-full bg-bg border border-border">Did it work reliably?</span>
            <span className="px-2 py-0.5 rounded-full bg-bg border border-border">How was the documentation?</span>
          </div>
        </div>
      )}

      {/* Write review */}
      {user ? (
        showForm ? (
          <form onSubmit={handleSubmit} className="border border-border rounded-md p-4 space-y-4">
            <h4 className="font-medium text-text-primary">Write a review</h4>

            <RatingInput label="Overall *" value={form.rating_overall} onChange={v => setForm(f => ({ ...f, rating_overall: v }))} />
            <RatingInput label="Ease of setup" value={form.rating_ease_of_setup} onChange={v => setForm(f => ({ ...f, rating_ease_of_setup: v }))} />
            <RatingInput label="Reliability" value={form.rating_reliability} onChange={v => setForm(f => ({ ...f, rating_reliability: v }))} />
            <RatingInput label="Documentation" value={form.rating_documentation} onChange={v => setForm(f => ({ ...f, rating_documentation: v }))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Used with</label>
                <input
                  value={form.used_with}
                  onChange={e => setForm(f => ({ ...f, used_with: e.target.value }))}
                  placeholder="Claude Desktop, Cursor..."
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Use case</label>
                <input
                  value={form.use_case}
                  onChange={e => setForm(f => ({ ...f, use_case: e.target.value }))}
                  placeholder="Code review, data analysis..."
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Review * (min 50 characters)</label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Pros</label>
                <input
                  value={form.pros}
                  onChange={e => setForm(f => ({ ...f, pros: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Cons</label>
                <input
                  value={form.cons}
                  onChange={e => setForm(f => ({ ...f, cons: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || form.rating_overall === 0 || form.body.length < 50}
                className="px-4 py-1.5 text-sm rounded bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? 'Posting...' : 'Submit review'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm text-text-muted hover:text-text-primary">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-accent hover:text-accent-hover"
          >
            Write a review
          </button>
        )
      ) : (
        <p className="text-sm text-text-muted">
          <a href="/login" className="text-accent hover:text-accent-hover">Sign in</a> to write a review.
        </p>
      )}
    </div>
  )
}
