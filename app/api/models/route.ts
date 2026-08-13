import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({
    object: 'list',
    data: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'o1', name: 'O1 (تفكير عميق)' },
    ],
  });
}
