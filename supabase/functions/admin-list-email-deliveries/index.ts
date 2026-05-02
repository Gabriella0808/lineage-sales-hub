import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Authenticate caller using their JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  // Verify the caller is an admin
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!roleRow) return json({ error: 'Forbidden' }, 403)

  // Parse query params
  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 1), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // Fetch recent log rows (we'll dedupe by message_id in JS)
  const { data: rows, error } = await admin
    .from('email_send_log')
    .select('id, message_id, template_name, recipient_email, status, error_message, metadata, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) return json({ error: error.message }, 500)

  // Dedupe: keep latest row per message_id; rows w/o message_id stay as-is
  const seen = new Set<string>()
  const deduped: typeof rows = []
  for (const r of rows ?? []) {
    if (r.message_id) {
      if (seen.has(r.message_id)) continue
      seen.add(r.message_id)
    }
    deduped.push(r)
  }

  // Suppression list (current bounces/complaints/unsubscribes)
  const { data: suppressed } = await admin
    .from('suppressed_emails')
    .select('email, reason, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)

  return json({ deliveries: deduped, suppressed: suppressed ?? [] })
})
