import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface TaskAssignedProps {
  recipientName?: string
  assignerName?: string
  taskTitle?: string
  taskDescription?: string
  dueDate?: string
  link?: string
}

const TaskAssignedEmail = ({
  recipientName,
  assignerName,
  taskTitle,
  taskDescription,
  dueDate,
  link,
}: TaskAssignedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {assignerName ? `${assignerName} assigned you a task` : 'A task has been assigned to you'}
      {taskTitle ? `: ${taskTitle}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been assigned a task</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'}{' '}
          {assignerName ? `${assignerName} has` : 'Someone has'} assigned a new task to you
          {dueDate ? ` (due ${dueDate})` : ''}.
        </Text>
        <Text style={taskTitleStyle}>{taskTitle || 'Untitled task'}</Text>
        {taskDescription ? <Text style={quote}>{taskDescription}</Text> : null}
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
  component: TaskAssignedEmail,
  subject: (data: Record<string, any>) =>
    `New task assigned${data?.taskTitle ? `: ${data.taskTitle}` : ''}`,
  displayName: 'Task assigned',
  previewData: {
    recipientName: 'Jessica',
    assignerName: 'Gabriella',
    taskTitle: 'Follow up with High Point dealer',
    taskDescription: 'Confirm shipment dates and confirm next sample order.',
    dueDate: 'May 22, 2026',
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
const taskTitleStyle = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 12px',
}
const quote = {
  fontSize: '14px',
  color: '#555',
  fontStyle: 'italic' as const,
  borderLeft: '3px solid hsl(40, 50%, 55%)',
  padding: '8px 14px',
  backgroundColor: 'hsl(40, 15%, 96%)',
  margin: '0 0 16px',
}
const button = {
  backgroundColor: '#d4a93a',
  color: '#1a1a1a',
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
