import React from 'react'
import R from '../runtime/render'

export const TestRenderHarness: React.FC = () => {
    const cases = [
        {
            title: 'Short JSON (No Scale)',
            packet: {
                op: 'answer.v1',
                payload: '```json\n{ "key": "value" }\n```'
            }
        },
        {
            title: 'Long String (Should Compress)',
            packet: {
                op: 'answer.v1',
                payload: '```\nThisIsAJustRidiculouslyLongStringThatHasAbsolutelyNoSpacesAndShouldIdeallyBeCompressedQuiteABitToFitOnTheScreenWithoutScrollingOrWrappingIdeally.ThisIsAJustRidiculouslyLongStringThatHasAbsolutelyNoSpacesAndShouldIdeallyBeCompressedQuiteABitToFitOnTheScreenWithoutScrollingOrWrappingIdeally\n```'
            }
        },
        {
            title: 'Technical Markdown (Syntax Highlighted)',
            packet: {
                op: 'answer.v1',
                payload: '```typescript\nfunction superComplexFunction<T extends object>(input: T, options: RenderOptions): Promise<RenderResult<T>> { return input.map(i => process(i)).filter(Boolean) }\n```'
            }
        }
    ]

    return (
        <div className="max-w-2xl mx-auto p-8 space-y-12 bg-[#ffffeb] min-h-screen">
            <h1 className="text-2xl font-bold mb-8 text-[#3A2E14]">Compressed Code Block Harness</h1>

            {cases.map((c, i) => (
                <div key={i} className="space-y-2">
                    <h2 className="text-lg font-semibold text-[#3A2E14] opacity-80">{c.title}</h2>
                    <div className="p-4 border border-[#ADA587] rounded-xl bg-[#ffffd7]">
                        <R packets={[c.packet]} />
                    </div>
                </div>
            ))}
        </div>
    )
}
