import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
}

const Email = ({ recipientName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Please disregard the earlier clearance report emails</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Please disregard</Heading>
        <Section>
          <Text style={text}>
            {recipientName ? `Hi ${recipientName},` : 'Hi there,'}
          </Text>
          <Text style={text}>
            You may have received one or more clearance report emails earlier today
            that were sent in error during testing. Please disregard those messages.
          </Text>
          <Text style={text}>
            We apologize for the noise in your inbox. The next legitimate weekly
            clearance report will arrive on its normal Monday schedule.
          </Text>
          <Text style={signoff}>— Lineage Collections</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Please disregard earlier clearance report emails',
  displayName: 'Disregard – Clearance Test',
  previewData: { recipientName: 'Gabriella' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'DM Sans', Arial, sans-serif", color: '#1a2238' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '24px', color: '#1a2238', margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '1.6', color: '#1a2238', margin: '0 0 14px' }
const signoff = { fontSize: '14px', color: '#6b7280', marginTop: '24px' }
