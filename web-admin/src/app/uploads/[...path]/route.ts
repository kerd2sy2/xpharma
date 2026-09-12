import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const cleanPath = pathSegments.join('/');

    // Prevent directory traversal
    if (cleanPath.includes('..')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const filePath = path.join(process.cwd(), 'public', 'uploads', cleanPath);

    try {
      await stat(filePath);
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    const ext = path.extname(cleanPath).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.gif') contentType = 'image/gif';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse('Error loading file', { status: 500 });
  }
}
