import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface Props {
  managerName?: string
  weekLabel?: string
  portalUrl?: string
}

const SalesManagerWeeklyReviewMissingEmail = ({
  weekLabel,
  portalUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Sales Manager Weekly Review form has not been completed{weekLabel ? ` for ${weekLabel}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={detailsBox}>
          <Text style={centeredText}>
            Sales Manager Weekly Review form has not been completed for {weekLabel || 'the current week'}.
          </Text>
          <Text style={centeredText}>
            No responses were saved before the Friday 6pm ET cutoff.
          </Text>
        </Section>

        {portalUrl && (
          <Section style={{ margin: '24px 0' }}>
            <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto', borderCollapse: 'separate' }}>
              <tbody>
                <tr>
                  <td bgcolor="#c9a44c" style={{ backgroundColor: '#c9a44c', borderRadius: '8px' }}>
                    <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={ctaButton}>
                      Open Portal
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
  component: SalesManagerWeeklyReviewMissingEmail,
  subject: (data: Record<string, any>) => {
    const manager = data?.managerName || 'Sales Manager'
    const week = data?.weekLabel ? ` · ${data.weekLabel}` : ''
    return `Weekly review NOT completed · ${manager}${week}`
  },
  to: 'gabriella@lineage-collections.com',
  displayName: 'Sales manager weekly review (missing)',
  previewData: {
    managerName: 'Sample Sales Manager',
    weekLabel: '[TEST] Week of Jun 22, 2026',
    portalUrl: 'https://www.lineage-managerhub.com/managers',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 12px' }
const centeredText = { ...text, textAlign: 'center' as const }
const detailsBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px 0',
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
