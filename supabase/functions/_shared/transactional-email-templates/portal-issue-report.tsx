import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface PortalIssueReportProps {
  issueType?: string
  title?: string
  priority?: string
  reporterName?: string
  reporterEmail?: string
  role?: string
  pageLabel?: string
  submittedAt?: string
  description?: string
  url?: string
  filterContextText?: string
  userAgent?: string
  viewport?: string
  screenshotUrl?: string
}

// A single "Label: value" metadata line. Kept as plain Text rows (not a
// table) so the plain-text rendering used for the email's text part stays
// readable — react-email escapes all interpolated values by default since
// these are JSX children, never raw string concatenation.
const MetaRow = ({ label, value }: { label: string; value?: string }) => {
  if (!value) return null
  return (
    <Text style={metaRow}>
      <span style={metaLabel}>{label}:</span> {value}
    </Text>
  )
}

const PortalIssueReportEmail = ({
  issueType,
  title,
  priority,
  reporterName,
  reporterEmail,
  role,
  pageLabel,
  submittedAt,
  description,
  url,
  filterContextText,
  userAgent,
  viewport,
  screenshotUrl,
}: PortalIssueReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`[Portal Issue] ${issueType || 'Issue'} — ${title || 'Untitled report'}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>LINEAGE PORTAL ISSUE REPORT</Text>
        <Heading style={h1}>{title || 'Untitled report'}</Heading>

        <Section style={metaBlock}>
          <MetaRow label="Issue" value={title} />
          <MetaRow label="Type" value={issueType} />
          <MetaRow label="Priority" value={priority} />
          <MetaRow label="Reported by" value={reporterName} />
          <MetaRow label="Email" value={reporterEmail} />
          <MetaRow label="Portal role" value={role} />
          <MetaRow label="Page" value={pageLabel} />
          <MetaRow label="Submitted" value={submittedAt} />
        </Section>

        <Hr style={hr} />

        <Text style={sectionHeading}>Description</Text>
        <Text style={bodyText}>{description || '(none provided)'}</Text>

        <Text style={sectionHeading}>Current Context</Text>
        <MetaRow label="URL" value={url} />
        <MetaRow label="Active filters" value={filterContextText} />
        <MetaRow label="Browser" value={userAgent} />
        <MetaRow label="Screen" value={viewport} />

        {screenshotUrl ? (
          <Section style={{ margin: '24px 0 4px' }}>
            <Button href={screenshotUrl} style={button}>
              View attached screenshot →
            </Button>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>--- The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PortalIssueReportEmail,
  subject: (data: Record<string, any>) =>
    `[Portal Issue] ${data?.issueType || 'Issue'} — ${data?.title || 'Untitled report'}`,
  to: 'gabriella@lineage-collections.com',
  displayName: 'Portal issue report',
  previewData: {
    issueType: "Data looks incorrect",
    title: 'Bookings total looks incorrect',
    priority: 'High',
    reporterName: 'Jessica Kim',
    reporterEmail: 'jessica@lineage-collections.com',
    role: 'manager',
    pageLabel: 'Labor Day Promo',
    submittedAt: 'September 15, 2026 at 2:14 PM ET',
    description: 'The dealer total shows $0 even though I can see bookings in the table below it.',
    url: 'https://lineage-collections-portal.com/promotions/labor-day-promo',
    filterContextText: 'Rep: all, Dealer: all, Date range: 2026-08-25 to 2026-09-15',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    viewport: '1440 × 900',
    screenshotUrl: 'https://example.supabase.co/storage/v1/object/sign/issue-report-attachments/example.png',
  },
} satisfies TemplateEntry

// ── Styles ────────────────────────────────────────────────────────────────────

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const eyebrow = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
  color: '#c9a44c', margin: '0 0 10px',
}
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '24px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const metaBlock = {
  backgroundColor: 'hsl(40, 15%, 97%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '10px',
  padding: '14px 16px 6px',
  margin: '0 0 8px',
}
const metaRow = { fontSize: '13px', color: '#333', lineHeight: '1.6', margin: '0 0 8px' }
const metaLabel = { color: 'hsl(220, 10%, 46%)', fontWeight: 600 }
const sectionHeading = {
  fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const,
  letterSpacing: '0.06em', color: 'hsl(220, 10%, 46%)', margin: '20px 0 6px',
}
const bodyText = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 4px', whiteSpace: 'pre-wrap' as const }
const button = {
  backgroundColor: '#d4a93a',
  color: '#1a1a1a',
  padding: '12px 22px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
