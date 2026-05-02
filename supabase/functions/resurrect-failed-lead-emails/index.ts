// Resurrects failed/dlq/rate_limited lead emails by re-invoking
// send-transactional-email. Runs on a cron schedule. Caps attempts at 3.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_NAME = 'new-lead-assigned'
const MAX_ATTEMPTS = 3
const FAILED_STATUSES = ['failed', 'dlq', 'rate_limited', 'bounced']
const LOOKBACK_HOURS = 72

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Pull recent log rows for the lead template, then dedupe in JS to find
  // the latest status per message_id.
  const sinceIso = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString()

  const { data: rows, error: readErr } = await supabase
    .from('email_send_log')
    .select(
      'id, message_id, recipient_email, status, created_at, resurrect_attempts'
    )
    .eq('template_name', TEMPLATE_NAME)
    .gte('created_at', sinceIso)
    .not('message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (readErr) {
    console.error('Failed to read email_send_log', readErr)
    return new Response(JSON.stringify({ error: 'read_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Latest row per message_id
  const latestByMsg = new Map<string, typeof rows[number]>()
  for (const r of rows ?? []) {
    if (!latestByMsg.has(r.message_id!)) latestByMsg.set(r.message_id!, r)
  }

  // Max resurrect_attempts seen for each recipient (across all message_ids)
  const attemptsByEmail = new Map<string, number>()
  for (const r of rows ?? []) {
    const email = r.recipient_email.toLowerCase()
    const prev = attemptsByEmail.get(email) ?? 0
    if ((r.resurrect_attempts ?? 0) > prev) {
      attemptsByEmail.set(email, r.resurrect_attempts ?? 0)
    }
  }

  const candidates = [...latestByMsg.values()].filter(
    (r) => FAILED_STATUSES.includes(r.status) &&
           (attemptsByEmail.get(r.recipient_email.toLowerCase()) ?? 0) < MAX_ATTEMPTS
  )

  console.log(`Found ${candidates.length} lead emails to resurrect`)

  let resurrected = 0
  let skipped = 0
  let errors = 0

  for (const row of candidates) {
    const email = row.recipient_email.toLowerCase()

    // Skip if recipient is now suppressed
    const { data: sup } = await supabase
      .from('suppressed_emails')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (sup) {
      skipped++
      continue
    }

    // Skip if a successful send for this recipient happened AFTER the failure
    const { data: laterSuccess } = await supabase
      .from('email_send_log')
      .select('id')
      .eq('template_name', TEMPLATE_NAME)
      .eq('recipient_email', row.recipient_email)
      .eq('status', 'sent')
      .gt('created_at', row.created_at)
      .limit(1)
      .maybeSingle()
    if (laterSuccess) {
      skipped++
      continue
    }

    const newAttemptCount =
      (attemptsByEmail.get(email) ?? 0) + 1

    // Re-invoke send-transactional-email with a fresh idempotency key
    const idempotencyKey = `resurrect-${row.message_id}-${newAttemptCount}`
    const { error: invokeErr } = await supabase.functions.invoke(
      'send-transactional-email',
      {
        body: {
          templateName: TEMPLATE_NAME,
          recipientEmail: row.recipient_email,
          idempotencyKey,
        },
      }
    )

    if (invokeErr) {
      console.error('Resurrect invoke failed', { email, invokeErr })
      errors++
      await supabase.from('email_send_log').insert({
        message_id: idempotencyKey,
        template_name: TEMPLATE_NAME,
        recipient_email: row.recipient_email,
        status: 'failed',
        error_message: `Resurrect invoke failed: ${invokeErr.message ?? 'unknown'}`,
        resurrect_attempts: newAttemptCount,
        metadata: { resurrected_from: row.message_id },
      })
      continue
    }

    // Mark progress: log a 'resurrected' marker row so attempt counter advances
    await supabase.from('email_send_log').insert({
      message_id: idempotencyKey,
      template_name: TEMPLATE_NAME,
      recipient_email: row.recipient_email,
      status: 'resurrected',
      resurrect_attempts: newAttemptCount,
      metadata: { resurrected_from: row.message_id, attempt: newAttemptCount },
    })

    attemptsByEmail.set(email, newAttemptCount)
    resurrected++
  }

  console.log('Resurrect run complete', { resurrected, skipped, errors })

  return new Response(
    JSON.stringify({ success: true, resurrected, skipped, errors, considered: candidates.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
