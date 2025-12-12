/**
 * Template Variable Substitution
 *
 * Replaces placeholder variables in template content with actual values.
 * This is LOCAL substitution - no WhatsApp API involvement.
 *
 * Supported variables:
 * - {contact_name} - Contact's display name
 * - {contact_phone} - Contact's phone number
 * - {first_name} - Contact's first name (first word of name)
 * - {agent_name} - Current agent's name
 * - {date} - Current date (e.g., "Dec 9, 2025")
 * - {time} - Current time (e.g., "2:30 PM")
 * - {day} - Day of week (e.g., "Monday")
 */

export interface TemplateContext {
  contactName?: string;
  contactPhone?: string;
  agentName?: string;
}

/**
 * Replace template variables with actual values
 */
export function substituteTemplateVariables(
  content: string,
  context: TemplateContext
): string {
  if (!content) return content;

  const now = new Date();

  // Build replacements map
  const replacements: { [key: string]: string } = {
    // Contact variables
    '{contact_name}': context.contactName || 'Customer',
    '{contact_phone}': context.contactPhone || '',
    '{first_name}': context.contactName?.split(' ')[0] || 'Customer',

    // Agent variables
    '{agent_name}': context.agentName || 'Agent',

    // Date/time variables
    '{date}': now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    '{time}': now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    '{day}': now.toLocaleDateString('en-US', { weekday: 'long' }),
  };

  // Perform replacements (case-insensitive)
  let result = content;
  for (const [variable, value] of Object.entries(replacements)) {
    // Create case-insensitive regex
    const regex = new RegExp(variable.replace(/[{}]/g, '\\$&'), 'gi');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Get list of available template variables for UI display
 */
export function getAvailableVariables(): { variable: string; description: string }[] {
  return [
    { variable: '{contact_name}', description: 'Contact\'s full name' },
    { variable: '{first_name}', description: 'Contact\'s first name' },
    { variable: '{contact_phone}', description: 'Contact\'s phone number' },
    { variable: '{agent_name}', description: 'Your name' },
    { variable: '{date}', description: 'Today\'s date' },
    { variable: '{time}', description: 'Current time' },
    { variable: '{day}', description: 'Day of the week' },
  ];
}

/**
 * Check if a template contains any variables
 */
export function hasTemplateVariables(content: string): boolean {
  return /\{(contact_name|first_name|contact_phone|agent_name|date|time|day)\}/i.test(content);
}
