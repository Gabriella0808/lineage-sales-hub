import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface Field {
  key: string
  label: string
  hint?: string
}

interface MetricSection {
  key: string
  label: string
  actual?: string
  goal?: string
}

interface ReviewSection {
  title: string
  fields?: Field[]
  metrics?: MetricSection[]
}

interface SalesManagerWeeklyReviewProps {
  managerName?: string
  weekLabel?: string
  sections?: ReviewSection[]
  portalUrl?: string
}

const SalesManagerWeeklyReviewEmail = ({
  managerName,
  weekLabel,
  sections = [],
  portalUrl,
}: SalesManagerWeeklyReviewProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Sales manager weekly review{managerName ? ` · ${managerName}` : ''}{weekLabel ? ` · ${weekLabel}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Sales Manager Weekly Review</Heading>
        <Text style={text}>
          {managerName ? `${managerName}'s` : 'Sales manager'} weekly review for {weekLabel || 'the current week'}.
        </Text>

        {sections.map((section) => (
          <Section key={section.title} style={detailsBox}>
            <Heading as="h2" style={h2}>{section.title}</Heading>

            {section.metrics && section.metrics.length > 0 && (
              <table style={rowTable} cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th style={th}>Metric</th>
                    <th style={thNum}>Actual</th>
                    <th style={thNum}>Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {section.metrics.map((m) => (
                    <tr key={m.key}>
                      <td style={tdName}>{m.label}</td>
                      <td style={tdNum}>{m.actual ?? '-'}</td>
                      <td style={tdNum}>{m.goal ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {section.fields && section.fields.length > 0 && (
              <div>
                {section.metrics && section.metrics.length > 0 && (
                  <Hr style={sectionDivider} />
                )}
                {section.fields.map((f) => (
                  <div key={f.key} style={fieldBlock}>
                    <Text style={fieldLabel}>{f.label}</Text>
                    {f.hint && <Text style={fieldHint}>{f.hint}</Text>}
                    <Text style={fieldValue}>{f.value ?? '-'}</Text>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ))}

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
  component: SalesManagerWeeklyReviewEmail,
  subject: (data: Record<string, any>) => {
    const manager = data?.managerName ? ` · ${data.managerName}` : ''
    const week = data?.weekLabel ? ` · ${data.weekLabel}` : ''
    return `Sales manager weekly review${manager}${week}`
  },
  to: 'gabriella@lineage-collections.com',
  displayName: 'Sales manager weekly review',
  previewData: {
    managerName: 'Mateo De Lisa',
    weekLabel: 'Week of Jun 22, 2026',
    portalUrl: 'https://www.lineage-managerhub.com/sales-managers',
    sections: [
      {
        title: 'Weekly Metrics',
        metrics: [
          { key: 'bookings', label: 'Bookings', actual: '4', goal: '6' },
          { key: 'daily_checkins', label: 'Daily Check-Ins', actual: '12', goal: '15' },
          { key: 'placements', label: 'Placements', actual: '3', goal: '5' },
        ],
      },
      {
        title: 'Travel Review',
        fields: [
          { key: 'travel_efficient', label: 'Was travel efficient?', value: 'Yes, the midwest route was well planned.' },
          { key: 'travel_next_4_6_weeks', label: 'What is lined up for the next 4-6 weeks?', value: 'Texas and Florida territory visits.' },
        ],
      },
    ],
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
const h2 = {
  fontFamily: '"DM Sans", Arial, sans-serif',
  fontSize: '14px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 16px',
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
  padding: '20px',
  margin: '20px 0',
}
const sectionDivider = {
  borderColor: 'hsl(220, 13%, 88%)',
  margin: '20px 0',
}
const fieldBlock = {
  margin: '0 0 16px',
}
const fieldLabel = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#222',
  margin: '0 0 4px',
}
const fieldHint = {
  fontSize: '11px',
  color: '#888',
  margin: '0 0 6px',
}
const fieldValue = {
  fontSize: '14px',
  color: '#333',
  lineHeight: '1.5',
  margin: '0',
  whiteSpace: 'pre-line' as const,
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
