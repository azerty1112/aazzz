import { NextResponse } from 'next/server';

export async function GET() {
  const models = [
    { id: 'gpt-4o', name: 'GPT-4o (الأحدث)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (سريع واقتصادي)' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'text-davinci-002-render-sha', name: 'GPT-3.5 Legacy' },
  ];
  return NextResponse.json({ object: 'list', data: models });
}
