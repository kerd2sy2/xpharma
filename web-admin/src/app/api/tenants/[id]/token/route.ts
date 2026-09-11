import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

// POST /api/tenants/[id]/token - regenerate warehouse agent API token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawApiKey = `xph_agt_${crypto.randomBytes(24).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    const result = await query(
      `UPDATE public.tenants 
       SET api_key_hash = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, name, slug`,
      [apiKeyHash, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      apiKey: rawApiKey,
      message: 'New Agent API key generated successfully.'
    });
  } catch (error: any) {
    console.error('Error regenerating token:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
