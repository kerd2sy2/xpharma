import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'يرجى اختيار صورة لرفعها' }, { status: 400 });
    }

    // Validate mime type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'الملف المختار يجب أن يكون صورة' }, { status: 400 });
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'حجم الصورة يجب ألا يتعدى 5 ميجابايت' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save under public/uploads/logos
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name) || '.png';
    const cleanName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, cleanName);

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/logos/${cleanName}`;
    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: error.message || 'فشل رفع الملف' }, { status: 500 });
  }
}
