import React from 'react'
import LegalMarkdownPage from './LegalMarkdownPage'
import privacyMarkdown from '../../docs/legal/CHATTY_PRIVACY_NOTICE.md?raw'

export default function PrivacyNoticePage() {
  return <LegalMarkdownPage markdown={privacyMarkdown} />
}
