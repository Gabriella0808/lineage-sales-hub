import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface CollectionRow {
  label: string   // "SW" | "FIN" | "LUX" | "HOSP" | "MISC"
  amount: number
}

interface DailyPerformanceReportProps {
  reportingDate?: string        // "August 19, 2026"
  totalInvoiced?: number
  totalBookings?: number
  invoicedRows?: CollectionRow[]
  bookingRows?: CollectionRow[]
  portalUrl?: string
}

const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`

// ── Sub-component ─────────────────────────────────────────────────────────────

function CollectionTable({ rows, total }: { rows: CollectionRow[]; total: number }) {
  return (
    <table style={rowTable} cellPadding={0} cellSpacing={0}>
      <thead>
        <tr>
          <th style={th}>Collection</th>
          <th style={thNum}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td style={tdName}>{r.label}</td>
            <td style={tdNum}>{fmt(r.amount)}</td>
          </tr>
        ))}
        <tr>
          <td style={tdTotalName}>Total</td>
          <td style={tdTotalNum}>{fmt(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const DailyPerformanceReportEmail = ({
  reportingDate = 'Today',
  totalInvoiced = 0,
  totalBookings = 0,
  invoicedRows = [],
  bookingRows = [],
  portalUrl = 'https://www.lineage-collections-portal.com/',
}: DailyPerformanceReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Daily Performance {reportingDate} · Invoices {fmt(totalInvoiced)} · Bookings {fmt(totalBookings)}
    </Preview>
    <Body style={main}>
      <Container style={container}>

        {/* Eyebrow + title */}
        <Text style={eyebrow}>LINEAGE COLLECTIONS</Text>
        <Heading style={h1}>Daily Performance Report</Heading>
        <Text style={dateLine}>{reportingDate}</Text>

        {/* Summary cards */}
        <table
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 28px' }}
        >
          <tbody>
            <tr>
              <td style={card}>
                <Text style={cardLabel}>Daily Invoices</Text>
                <Text style={cardValue}>{fmt(totalInvoiced)}</Text>
              </td>
              <td style={{ width: '12px' }} />
              <td style={card}>
                <Text style={cardLabel}>Daily Bookings</Text>
                <Text style={cardValue}>{fmt(totalBookings)}</Text>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Invoiced breakdown */}
        <Text style={sectionHead}>Daily Invoices by Collection</Text>
        <Section style={detailsBox}>
          <CollectionTable rows={invoicedRows} total={totalInvoiced} />
        </Section>

        {/* Bookings breakdown */}
        <Text style={sectionHead}>Daily Bookings by Collection</Text>
        <Section style={detailsBox}>
          <CollectionTable rows={bookingRows} total={totalBookings} />
        </Section>

        {/* CTA */}
        {portalUrl && (
          <Section style={{ margin: '24px 0' }}>
            <table
              cellPadding={0}
              cellSpacing={0}
              role="presentation"
              style={{ margin: '0 auto', borderCollapse: 'separate' }}
            >
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#c9a44c', borderRadius: '8px' }}>
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={ctaButton}
                    >
                      View in Portal
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          Sent automatically from the {SITE_NAME} Admin Workspace.
        </Text>
      </Container>
    </Body>
  </Html>
)

// ── Template export ───────────────────────────────────────────────────────────

export const template = {
  component: DailyPerformanceReportEmail,
  subject: (data: Record<string, any>) => {
    const d = data?.reportingDate ? ` · ${data.reportingDate}` : ''
    return `Lineage Daily Performance${d}`
  },
  displayName: 'Daily Performance Report',
  previewData: {
    reportingDate: 'August 19, 2026',
    totalInvoiced: 85605,
    totalBookings: 27170,
    invoicedRows: [
      { label: 'SW',   amount: 42800 },
      { label: 'FIN',  amount: 29400 },
      { label: 'LUX',  amount: 10605 },
      { label: 'MISC', amount: 2800  },
    ],
    bookingRows: [
      { label: 'SW',   amount: 15000 },
      { label: 'FIN',  amount: 7890  },
      { label: 'LUX',  amount: 3110  },
      { label: 'HOSP', amount: 1170  },
    ],
    portalUrl: 'https://www.lineage-collections-portal.com/',
  },
} satisfies TemplateEntry

// ── Styles ────────────────────────────────────────────────────────────────────

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"DM Sans", Arial, sans-serif',
}
const container = {
  padding: '36px 28px',
  maxWidth: '560px',
  margin: '0 auto',
}
const eyebrow = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: '#c9a44c',
  margin: '0 0 14px',
}
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  fontWeight: 400,
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 4px',
}
const dateLine = {
  fontSize: '14px',
  color: 'hsl(220, 10%, 50%)',
  margin: '0 0 28px',
}
const card = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  verticalAlign: 'top' as const,
  width: '50%',
}
const cardLabel = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'hsl(220, 10%, 50%)',
  margin: '0 0 6px',
}
const cardValue = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '24px',
  fontWeight: 400,
  color: 'hsl(220, 35%, 22%)',
  margin: '0',
  fontVariantNumeric: 'tabular-nums' as const,
}
const sectionHead = {
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'hsl(220, 10%, 40%)',
  margin: '4px 0 6px',
}
const detailsBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '0 0 24px',
}
const rowTable = {
  width: '100%',
  borderCollapse: 'collapse' as const,
}
const th = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'hsl(220, 10%, 50%)',
  padding: '6px 8px 6px 0',
  textAlign: 'left' as const,
  borderBottom: '1px solid hsl(220, 13%, 88%)',
  fontWeight: 600,
}
const thNum: typeof th = { ...th, textAlign: 'right' as const, padding: '6px 0 6px 8px' }
const tdName = {
  fontSize: '14px',
  color: '#1a1a1a',
  fontWeight: 500,
  padding: '9px 8px 9px 0',
}
const tdNum = {
  fontSize: '14px',
  color: '#1a1a1a',
  fontWeight: 600,
  padding: '9px 0 9px 8px',
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
}
const tdTotalName = {
  ...tdName,
  borderTop: '1px solid hsl(220, 13%, 88%)',
  fontWeight: 700,
}
const tdTotalNum = {
  ...tdNum,
  borderTop: '1px solid hsl(220, 13%, 88%)',
  fontWeight: 700,
}
const hr = {
  borderColor: 'hsl(220, 13%, 90%)',
  margin: '28px 0 16px',
}
const footer = {
  fontSize: '12px',
  color: '#999',
  margin: '0',
}
const ctaButton = {
  display: 'inline-block' as const,
  backgroundColor: '#c9a44c',
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: '8px',
  padding: '12px 28px',
  fontFamily: '"DM Sans", Arial, sans-serif',
}
