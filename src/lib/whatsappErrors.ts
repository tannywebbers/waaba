// Map WhatsApp Cloud API error codes/messages to user-friendly explanations
export function getWhatsAppErrorExplanation(errorMessage: string): { title: string; description: string; action: string } {
  const lower = errorMessage.toLowerCase();

  // Service window / 24-hour policy
  if (lower.includes('re-engage') || lower.includes('24 hour') || lower.includes('24-hour') || lower.includes('service window') || lower.includes('session') || (lower.includes('template') && lower.includes('require'))) {
    return {
      title: 'Service Window Closed',
      description: 'The 24-hour customer service window has expired. You can only send approved template messages outside this window.',
      action: 'Send a template message to re-engage the customer, or wait for them to message you first.',
    };
  }

  if (lower.includes('insufficient') || lower.includes('balance') || lower.includes('payment')) {
    return {
      title: 'Insufficient Balance',
      description: 'Your Meta/WhatsApp Business account does not have enough balance to send this message.',
      action: 'Top up your Meta Business account balance in the Meta Business Suite.',
    };
  }

  if (lower.includes('block') || lower.includes('spam')) {
    return {
      title: 'Contact Blocked',
      description: 'This contact has blocked your business number or reported it as spam.',
      action: 'You cannot send messages to this contact. They must unblock your number.',
    };
  }

  if (lower.includes('invalid') && (lower.includes('phone') || lower.includes('number') || lower.includes('recipient'))) {
    return {
      title: 'Invalid Phone Number',
      description: 'The phone number format is invalid or the number is not registered on WhatsApp.',
      action: 'Verify the phone number is correct and includes the country code (e.g., +234...).',
    };
  }

  if (lower.includes('not registered') || lower.includes('not a whatsapp') || lower.includes('not on whatsapp')) {
    return {
      title: 'Not on WhatsApp',
      description: 'This contact is not registered on WhatsApp.',
      action: 'Verify the phone number or contact them through another channel.',
    };
  }

  if (lower.includes('template') && (lower.includes('reject') || lower.includes('paused') || lower.includes('disabled'))) {
    return {
      title: 'Template Rejected',
      description: 'This message template has been rejected or paused by Meta.',
      action: 'Check your template status in Meta Business Suite and submit a new template if needed.',
    };
  }

  if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized') || lower.includes('403') || lower.includes('401')) {
    return {
      title: 'Authentication Failed',
      description: 'Your WhatsApp API access token is invalid or expired.',
      action: 'Go to Settings > WhatsApp API and update your access token.',
    };
  }

  if (lower.includes('rate') || lower.includes('limit') || lower.includes('throttl')) {
    return {
      title: 'Rate Limited',
      description: 'Too many messages sent in a short period. WhatsApp has temporarily limited your account.',
      action: 'Wait a few minutes before sending more messages.',
    };
  }

  if (lower.includes('media') && (lower.includes('unsupported') || lower.includes('format') || lower.includes('invalid'))) {
    return {
      title: 'Unsupported Media Format',
      description: 'The file format is not supported by WhatsApp.',
      action: 'Try sending a different file format. WhatsApp supports JPEG, PNG, PDF, MP3, OGG, MP4, WebM.',
    };
  }

  if (lower.includes('too large') || lower.includes('file size') || lower.includes('exceed')) {
    return {
      title: 'File Too Large',
      description: 'The file exceeds WhatsApp\'s maximum file size limit.',
      action: 'Reduce the file size and try again. WhatsApp supports up to 16MB for media.',
    };
  }

  if (lower.includes('parameter') || lower.includes('missing') || lower.includes('required field')) {
    return {
      title: 'Missing Parameters',
      description: 'The message request is missing required fields.',
      action: 'Check your message configuration and try again.',
    };
  }

  if (lower.includes('not configured') || lower.includes('no whatsapp')) {
    return {
      title: 'WhatsApp Not Configured',
      description: 'Your WhatsApp Business API credentials are not set up.',
      action: 'Go to Settings > WhatsApp API to configure your credentials.',
    };
  }

  // Fallback
  return {
    title: 'Message Failed',
    description: errorMessage,
    action: 'Check your WhatsApp API settings and try again. If the issue persists, check Meta Business Suite for account status.',
  };
}