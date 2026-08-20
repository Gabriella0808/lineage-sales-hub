import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface CollectionRow {
  label: string   // "SW" | "FIN" | "LUX" | "HOSP" | "MISC"
  amount: number
}

interface DailyPerformanceReportProps {
  invoiceDate?: string       // "August 18, 2026" — yesterday
  bookingDate?: string       // "August 19, 2026" — today
  invoiceDateShort?: string  // "Aug 18" — used in section headings
  bookingDateShort?: string  // "Aug 19" — used in section headings
  totalInvoiced?: number
  totalBookings?: number
  invoicedRows?: CollectionRow[]
  bookingRows?: CollectionRow[]
  portalUrl?: string
}

const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`

// ── Collection table ──────────────────────────────────────────────────────────

function CollectionTable({ rows, total }: { rows: CollectionRow[]; total: number }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
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

// ── Section box with colored heading bar ──────────────────────────────────────

interface SectionBoxProps {
  headingText: string
  headingBg: string
  headingColor: string
  borderColor: string
  children: React.ReactNode
}

function SectionBox({ headingText, headingBg, headingColor, borderColor, children }: SectionBoxProps) {
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0',
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        marginBottom: '24px',
      }}
    >
      <tbody>
        {/* Colored heading bar */}
        <tr>
          <td
            style={{
              backgroundColor: headingBg,
              color: headingColor,
              padding: '12px 20px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: '"DM Sans", Arial, sans-serif',
              borderRadius: '6px 6px 0 0',
              borderBottom: `1px solid ${borderColor}`,
            }}
          >
            {headingText}
          </td>
        </tr>
        {/* White body */}
        <tr>
          <td
            style={{
              backgroundColor: '#ffffff',
              padding: '6px 20px 18px',
              borderRadius: '0 0 6px 6px',
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const DailyPerformanceReportEmail = ({
  invoiceDate = '',
  bookingDate = '',
  invoiceDateShort = '',
  bookingDateShort = '',
  totalInvoiced = 0,
  totalBookings = 0,
  invoicedRows = [],
  bookingRows = [],
  portalUrl = 'https://lineage-collections-portal.com/company-wide',
}: DailyPerformanceReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Daily Performance · Invoices {fmt(totalInvoiced)} ({invoiceDateShort}) · Bookings {fmt(totalBookings)} ({bookingDateShort})
    </Preview>
    <Body style={main}>
      <Container style={container}>

        {/* Eyebrow + title — no single date; each card shows its own */}
        <Text style={eyebrow}>LINEAGE COLLECTIONS</Text>
        <Heading style={h1}>Daily Performance Report</Heading>

        {/* ── Summary cards ─────────────────────────────────────────────── */}
        <table
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 28px' }}
        >
          <tbody>
            <tr>

              {/* Invoices card — gold accent */}
              <td style={{ width: '48%', verticalAlign: 'top' }}>
                <table cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {/* Gold accent strip */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: '#c9a44c',
                          height: '5px',
                          lineHeight: '5px',
                          fontSize: '1px',
                          borderRadius: '8px 8px 0 0',
                          borderLeft: '2px solid #c9a44c',
                          borderRight: '2px solid #c9a44c',
                          borderTop: '2px solid #c9a44c',
                        }}
                      >&nbsp;</td>
                    </tr>
                    {/* Card body */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: '#fdf8ec',
                          borderLeft: '2px solid #c9a44c',
                          borderRight: '2px solid #c9a44c',
                          borderBottom: '2px solid #c9a44c',
                          borderRadius: '0 0 8px 8px',
                          padding: '16px 20px 20px',
                        }}
                      >
                        <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8a6a2f', margin: '0 0 8px', fontFamily: '"DM Sans", Arial, sans-serif' }}>
                          Daily Invoices
                        </p>
                        <p style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '26px', fontWeight: 400, color: '#1e2d47', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(totalInvoiced)}
                        </p>
                        {invoiceDate ? <p style={{ fontSize: '12px', color: '#999', margin: '0', fontFamily: '"DM Sans", Arial, sans-serif' }}>{invoiceDate}</p> : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* Gap */}
              <td style={{ width: '4%' }}>&nbsp;</td>

              {/* Bookings card — dark accent */}
              <td style={{ width: '48%', verticalAlign: 'top' }}>
                <table cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {/* Dark accent strip */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: '#1e2d47',
                          height: '5px',
                          lineHeight: '5px',
                          fontSize: '1px',
                          borderRadius: '8px 8px 0 0',
                          borderLeft: '2px solid #1e2d47',
                          borderRight: '2px solid #1e2d47',
                          borderTop: '2px solid #1e2d47',
                        }}
                      >&nbsp;</td>
                    </tr>
                    {/* Card body */}
                    <tr>
                      <td
                        style={{
                          backgroundColor: '#f4f0eb',
                          borderLeft: '2px solid #b9914d',
                          borderRight: '2px solid #b9914d',
                          borderBottom: '2px solid #b9914d',
                          borderRadius: '0 0 8px 8px',
                          padding: '16px 20px 20px',
                        }}
                      >
                        <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1e2d47', margin: '0 0 8px', fontFamily: '"DM Sans", Arial, sans-serif' }}>
                          Daily Bookings
                        </p>
                        <p style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '26px', fontWeight: 400, color: '#1e2d47', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(totalBookings)}
                        </p>
                        {bookingDate ? <p style={{ fontSize: '12px', color: '#999', margin: '0', fontFamily: '"DM Sans", Arial, sans-serif' }}>{bookingDate}</p> : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>

            </tr>
          </tbody>
        </table>

        {/* ── Invoiced breakdown ────────────────────────────────────────── */}
        <SectionBox
          headingText={invoiceDateShort ? `Daily Invoices by Collection · ${invoiceDateShort}` : 'Daily Invoices by Collection'}
          headingBg="#c9a44c"
          headingColor="#1a1a1a"
          borderColor="#c9a44c"
        >
          <CollectionTable rows={invoicedRows} total={totalInvoiced} />
        </SectionBox>

        {/* ── Bookings breakdown ────────────────────────────────────────── */}
        <SectionBox
          headingText={bookingDateShort ? `Daily Bookings by Collection · ${bookingDateShort}` : 'Daily Bookings by Collection'}
          headingBg="#1e2d47"
          headingColor="#ffffff"
          borderColor="#1e2d47"
        >
          <CollectionTable rows={bookingRows} total={totalBookings} />
        </SectionBox>

        {/* CTA */}
        {portalUrl && (
          <table
            cellPadding={0}
            cellSpacing={0}
            role="presentation"
            style={{ margin: '24px auto 0', borderCollapse: 'collapse' }}
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
    const inv = data?.invoiceDateShort ?? ''
    const bk  = data?.bookingDateShort ?? ''
    const parts = [inv ? `Invoices ${inv}` : '', bk ? `Bookings ${bk}` : ''].filter(Boolean)
    return parts.length ? `Lineage Daily Performance · ${parts.join(' · ')}` : 'Lineage Daily Performance'
  },
  displayName: 'Daily Performance Report',
  previewData: {
    invoiceDate: 'August 18, 2026',
    bookingDate: 'August 19, 2026',
    invoiceDateShort: 'Aug 18',
    bookingDateShort: 'Aug 19',
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
    portalUrl: 'https://lineage-collections-portal.com/company-wide',
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

// ── Collection table ──────────────────────────────────────────────────────────

const th = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: '#888888',
  padding: '8px 8px 8px 0',
  textAlign: 'left' as const,
  borderBottom: '1px solid #e4e0da',
  fontWeight: 600,
  fontFamily: '"DM Sans", Arial, sans-serif',
}

const thNum: typeof th = { ...th, textAlign: 'right' as const, padding: '8px 0 8px 8px' }

const tdName = {
  fontSize: '14px',
  color: '#1a1a1a',
  fontWeight: 500,
  padding: '10px 8px 10px 0',
  fontFamily: '"DM Sans", Arial, sans-serif',
}

const tdNum = {
  fontSize: '14px',
  color: '#1a1a1a',
  fontWeight: 600,
  padding: '10px 0 10px 8px',
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  fontFamily: '"DM Sans", Arial, sans-serif',
}

const tdTotalName = {
  ...tdName,
  borderTop: '2px solid #d6d0c8',
  fontWeight: 700,
}

const tdTotalNum = {
  ...tdNum,
  borderTop: '2px solid #d6d0c8',
  fontWeight: 700,
}

// ── CTA + footer ──────────────────────────────────────────────────────────────

const hr = {
  borderColor: '#e8e3db',
  margin: '32px 0 16px',
}

const footer = {
  fontSize: '12px',
  color: '#999999',
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
