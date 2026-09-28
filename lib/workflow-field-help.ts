import type { ActionField } from "@/lib/schemas/workflows";

export interface FieldHelp {
  question: string;
  explanation: string;
  example: string;
}

const HELP_BY_KEY: Record<string, FieldHelp> = {
  title: {
    question: "What should the calendar event be called?",
    explanation: "This is the event name people will see on the calendar.",
    example: "Study group meeting",
  },
  start: {
    question: "When should the event begin?",
    explanation: "Choose the date, starting time, and time zone for the event.",
    example: "October 5 at 4:00 PM, America/New York",
  },
  end: {
    question: "When should the event finish?",
    explanation: "Choose a time after the event begins so the calendar knows its length.",
    example: "October 5 at 5:00 PM, America/New York",
  },
  attendee_email: {
    question: "Who should be invited?",
    explanation: "Use the email address of the person who should be added to the event.",
    example: "student@example.com",
  },
  channel: {
    question: "Which Slack channel should receive the message?",
    explanation: "Enter the channel where ZapFix should post the message.",
    example: "#homework-help",
  },
  text: {
    question: "What message should ZapFix send?",
    explanation: "This is the message people will read in Slack.",
    example: "The study session starts in 10 minutes.",
  },
  to: {
    question: "Who should receive the email?",
    explanation: "Use the email address of the person who should receive the message.",
    example: "teacher@example.com",
  },
  subject: {
    question: "What should the email subject say?",
    explanation: "This short line tells the recipient what the email is about.",
    example: "Science project update",
  },
  body: {
    question: "What should the email say?",
    explanation: "This is the main message the recipient will read.",
    example: "Our project draft is ready for review.",
  },
  name: {
    question: "What should the new file be called?",
    explanation: "Choose a clear name so the file is easy to recognize later.",
    example: "Weekly study notes",
  },
  content: {
    question: "What should the file contain?",
    explanation: "This is the information ZapFix will place inside the new file.",
    example: "Topics to review: algebra, biology, and history.",
  },
  spreadsheet_id: {
    question: "Which spreadsheet should receive the row?",
    explanation: "Copy the spreadsheet ID from its Google Sheets web address.",
    example: "The text between /d/ and /edit in the spreadsheet address",
  },
  sheet_name: {
    question: "Which sheet tab should receive the row?",
    explanation: "Enter the tab name exactly as it appears at the bottom of the spreadsheet.",
    example: "Responses",
  },
  values: {
    question: "What should each cell in the new row contain?",
    explanation: "Enter one cell value per line. ZapFix appends those lines as one new row.",
    example: "First line: Jordan\nSecond line: Ready\nThird line: September 27",
  },
};

export function helpForActionField(field: ActionField): FieldHelp {
  return HELP_BY_KEY[field.key] ?? {
    question: `What should ZapFix use for ${field.label.toLowerCase()}?`,
    explanation: `Choose the information ZapFix should send as ${field.label.toLowerCase()}.`,
    example: `A typical ${field.label.toLowerCase()} used in this app`,
  };
}
