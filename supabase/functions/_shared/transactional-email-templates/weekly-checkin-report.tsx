import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface TeamRow {
  name: string
  checkIns: number
  placements: number
}

interface WeeklyCheckinReportProps {
  recipientName?: string
  weekLabel?: string
  rows?: TeamRow[]
  totalCheckIns?: number
  totalPlacements?: number
  portalUrl?: string
}

const WeeklyCheckinReportEmail = ({
  recipientName,
  weekLabel,
  rows = [],
  totalCheckIns = 0,
  totalPlacements = 0,
  portalUrl,
}: WeeklyCheckinReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Weekly check-in report{weekLabel ? ` Â· ${weekLabel}` : ''} --- {totalCheckIns} check-ins, {totalPlacements} new placements
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Weekly Check-In Report</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'} here is the field
          check-in summary for {weekLabel || 'last week'}.
        </Text>

        <Section style={detailsBox}>
          <table style={rowTable} cellPadding={0} cellSpacing={0}>
            <thead>
              <tr>
                <th style={th}>Manager</th>
                <th style={thNum}>Check-Ins</th>
                <th style={thNum}>New Placements</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td style={tdName}>{r.name}</td>
                  <td style={tdNum}>{r.checkIns}</td>
                  <td style={tdNum}>{r.placements}</td>
                </tr>
              ))}
              <tr>
                <td style={tdTotalName}>Total</td>
                <td style={tdTotalNum}>{totalCheckIns}</td>
                <td style={tdTotalNum}>{totalPlacements}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Text style={text}>
          View the full breakdown anytime in the portal under
          Field Check-Ins -†’ Visit Analytics.
        </Text>

        {portalUrl && (
          <Section style={{ margin: '24px 0' }}>
            <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto', borderCollapse: 'separate' }}>
              <tbody>
                <tr>
                  <td bgcolor="#c9a44c" style={{ backgroundColor: '#c9a44c', borderRadius: '8px' }}>
                    <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={ctaButton}>
                      View in Portal
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        )}


        <Hr style={hr} />
        <Text style={footer}>--- The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WeeklyCheckinReportEmail,
  subject: (data: Record<string, any>) => {
    const wk = data?.weekLabel ? ` (${data.weekLabel})` : ''
    return `Weekly check-in report${wk}`
  },
  displayName: 'Weekly check-in report',
  previewData: {
    recipientName: 'Scott',
    weekLabel: 'May 25 - May 31, 2026',
    rows: [
      { name: 'Will Grisack', checkIns: 8, placements: 6 },
      { name: 'Mateo De Lisa', checkIns: 5, placements: 1 },
      { name: 'Chris De Lisa', checkIns: 0, placements: 0 },
    ],
    totalCheckIns: 13,
    totalPlacements: 7,
    portalUrl: 'https://www.lineage-managerhub.com/check-ins/analytics',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"DM Sans", Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#333',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const detailsBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const rowTable = { width: '100%', borderCollapse: 'collapse' as const }
const th = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'hsl(220, 10%, 46%)',
  padding: '8px 8px 8px 0',
  textAlign: 'left' as const,
  borderBottom: '1px solid hsl(220, 13%, 88%)',
}
const thNum = { ...th, textAlign: 'right' as const, padding: '8px 0 8px 8px' }
const tdName = {
  fontSize: '14px',
  color: '#222',
  fontWeight: 500,
  padding: '10px 8px 10px 0',
}
const tdNum = {
  fontSize: '14px',
  color: '#222',
  fontWeight: 600,
  padding: '10px 0 10px 8px',
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
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
const ctaButton = {
  display: 'inline-block',
  backgroundColor: '#c9a44c',
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: '8px',
  padding: '12px 28px',
  fontFamily: '"DM Sans", Arial, sans-serif',
}
