import { createClient } from 'npm:@supabase/supabase-js@2'

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    bounced_at?: string
    complained_at?: string
  }
}

async function verifyResendWebhook(req: Request, secret: string): Promise<ResendWebhookEvent> {
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error('Missing svix headers')
  }

  const body = await req.text()

  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const secretBytes = Uint8Array.from(
    atob(secret.replace(/^whsec_/, '')),
    (c) => c.charCodeAt(0)
  )
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const expectedSigs = svixSignature.split(' ').map((s) => s.replace(/^v1,/, ''))
  const valid = expectedSigs.some((s) => s === computedSig)
  if (!valid) {
    throw new Error('Invalid webhook signature')
  }

  // Replay attack prevention: reject events older than 5 minutes
  const timestampMs = parseInt(svixTimestamp) * 1000
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    throw new Error('Stale webhook timestamp')
  }

  return JSON.parse(body) as ResendWebhookEvent
}

function mapEventToReason(type: string): 'bounce' | 'complaint' | null {
  if (type === 'email.bounced') return 'bounce'
  if (type === 'email.complained') return 'complaint'
  return null
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  let event: ResendWebhookEvent
  try {
    event = await verifyResendWebhook(req, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    console.error('Webhook verification failed', { error: message })
    return jsonResponse({ error: message }, 401)
  }

  const reason = mapEventToReason(event.type)
  if (!reason) {
    // Unhandled event type — acknowledge and ignore
    return jsonResponse({ success: true, ignored: true })
  }

  const recipientEmail = event.data.to?.[0]
  if (!recipientEmail) {
    return jsonResponse({ error: 'No recipient email in payload' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = recipientEmail.toLowerCase()

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: normalizedEmail,
        reason,
        metadata: { email_id: event.data.email_id, event_type: event.type },
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      error: suppressError,
      email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  const sendLogStatus = reason === 'bounce' ? 'bounced' : 'complained'
  const sendLogMessage = reason === 'bounce'
    ? 'Permanent bounce - email address is invalid or rejected'
    : 'Spam complaint - recipient marked email as spam'

  const { error: insertError } = await supabase
    .from('email_send_log')
    .insert({
      message_id: event.data.email_id ?? null,
      template_name: 'system',
      recipient_email: normalizedEmail,
      status: sendLogStatus,
      error_message: sendLogMessage,
      metadata: { event_type: event.type },
    })

  if (insertError) {
    console.warn('Failed to insert email_send_log', { error: insertError })
  }

  console.log('Suppression processed', {
    email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    reason,
    event_type: event.type,
  })

  return jsonResponse({ success: true })
})
