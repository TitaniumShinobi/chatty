import React from 'react'
import LegalMarkdownPage from './LegalMarkdownPage'
import termsMarkdown from '../../docs/legal/CHATTY_TERMS_OF_SERVICE.md?raw'

export default function TermsOfServicePage() {
  return <LegalMarkdownPage markdown={termsMarkdown} />
}
