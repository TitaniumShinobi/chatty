import React from 'react'
import LegalMarkdownPage from './LegalMarkdownPage'
import eeccdMarkdown from '../../docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md?raw'

export default function EECCDPage() {
  return <LegalMarkdownPage markdown={eeccdMarkdown} />
}
