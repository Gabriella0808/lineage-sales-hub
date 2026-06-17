import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface TaskMentionProps {
  recipientName?: string
  mentionerName?: string
  taskTitle?: string
  boardName?: string
  updateBody?: string
  link?: string
}

const TaskMentionEmail = ({
  recipientName,
  mentionerName,
  taskTitle,
  boardName,
  updateBody,
  link,
}: TaskMentionProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {mentionerName ? `${mentionerName} mentioned you` : 'You were mentioned'}
      {taskTitle ? ` on "${taskTitle}"` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You were mentioned</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'}{' '}
          {mentionerName ? <strong>{mentionerName}</strong> : 'Someone'} mentioned you in an update
          {taskTitle ? <> on <strong>{taskTitle}</strong></> : null}
          {boardName ? <> in the <em>{boardName}</em> board</> : null}.
        </Text>
        {updateBody ? <Text style={quote}>{updateBody}</Text> : null}
        {link ? (
          <Button href={link} style={button}>
            Open task
          </Button>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>— The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskMentionEmail,
  subject: (data: Record<string, any>) =>
    `${data?.mentionerName ?? 'Someone'} mentioned you${data?.taskTitle ? ` on "${data.taskTitle}"` : ''}`,
  displayName: 'Task mention',
  previewData: {
    recipientName: 'Gabriella',
    mentionerName: 'Andrew',
    taskTitle: 'Add weekly reviews to manager cards',
    boardName: 'Portal Tasks',
    updateBody: '@Gabriella can you take a look at the dealer onboarding section before Friday?',
    link: 'https://www.lineage-portal.com/tasks',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const quote = {
  fontSize: '14px',
  color: '#444',
  borderLeft: '3px solid hsl(214, 80%, 36%)',
  padding: '10px 14px',
  backgroundColor: 'hsl(214, 40%, 97%)',
  margin: '0 0 20px',
  whiteSpace: 'pre-wrap' as const,
}
const button = {
  backgroundColor: 'hsl(214, 80%, 36%)',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 4px',
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
