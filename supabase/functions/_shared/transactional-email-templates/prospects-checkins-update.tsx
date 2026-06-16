import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface Props {
  recipientName?: string
}

const UpdateEmail = ({ recipientName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New updates to Prospects & Field Check-ins</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Prospects & Field Check-ins — Updates</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'} here is a quick
          summary of the latest changes to the Prospects and Field Check-ins
          experience.
        </Text>

        <Section style={detailsBox}>
          <Text style={bulletTitle}>1. Prospect pins now show dual colour</Text>
          <Text style={bulletText}>
            On the Field Check-ins map, prospect accounts keep their charcoal
            outline while also displaying their last-visit recency colour (green
            for ≤2 weeks, yellow for ≤1 month, red for ≤3 months). This means
            you can spot both that an account is a prospect and how recently
            it was visited at a glance.
          </Text>

          <Text style={bulletTitle}>2. Filter matching improved</Text>
          <Text style={bulletText}>
            Prospect pins with a recent check-in now appear when you select
            <strong> either </strong> the recency colour filter (e.g., ≤2 weeks)
            <strong> or </strong> the Prospect charcoal filter. Previously, a
            prospect that had been checked-in recently could be hidden under
            the wrong filter selection.
          </Text>

          <Text style={bulletTitle}>3. Prospect-to-dealer colour transition</Text>
          <Text style={bulletText}>
            When a prospect account is converted to a full dealer, the charcoal
            ring is automatically removed and the pin switches to the standard
            recency-based colour only. This makes the status change immediately
            visible on the map.
          </Text>

          <Text style={bulletTitle}>4. Last contacted auto-updates from check-ins</Text>
          <Text style={bulletText}>
            Every time a field check-in is logged for an account, the
            <strong> Last contacted </strong> column in the CRM Prospects list
            now updates automatically — no manual note entry required.
          </Text>

          <Text style={bulletTitle}>5. Rep name updated</Text>
          <Text style={bulletText}>
            Justin Jeangerard has been replaced by Kate Jones across Field
            Check-ins, the Prospects page, and Visit Analytics. All new
            check-ins and reporting will attribute visits to Kate.
          </Text>
        </Section>

        <Text style={text}>
          These changes are live now. If you spot anything that looks off,
          just reply and let us know.
        </Text>

        <Text style={footer}>— The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: UpdateEmail,
  subject: 'Updates to Prospects & Field Check-ins',
  displayName: 'Prospects & check-ins update',
  previewData: {
    recipientName: 'Will',
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
  padding: '20px 20px',
  margin: '20px 0',
}
const bulletTitle = {
  fontSize: '14px',
  fontWeight: 700,
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 8px',
}
const bulletText = {
  fontSize: '14px',
  color: '#333',
  lineHeight: '1.6',
  margin: '0 0 18px',
}
const footer = { fontSize: '12px', color: '#888', margin: '24px 0 0' }
