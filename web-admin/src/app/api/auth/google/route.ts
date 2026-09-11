import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id_token, access_token } = body;

    let email = '';
    let name = '';
    let picture = '';

    // Verify token with Google identity server
    if (id_token) {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
      if (!resp.ok) {
        return NextResponse.json(
          { success: false, error: 'فشل التحقق من صحة بيانات الدخول عبر Google' },
          { status: 401 }
        );
      }
      const data = await resp.json();
      email = (data.email || '').toLowerCase().trim();
      name = data.name || '';
      picture = data.picture || '';
    } else if (access_token) {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!resp.ok) {
        return NextResponse.json(
          { success: false, error: 'فشل استرجاع بيانات الحساب من Google' },
          { status: 401 }
        );
      }
      const data = await resp.json();
      email = (data.email || '').toLowerCase().trim();
      name = data.name || '';
      picture = data.picture || '';
    } else {
      return NextResponse.json(
        { success: false, error: 'رمز المصادقة غير موجود' },
        { status: 400 }
      );
    }

    // Secure backend verification against environment variable
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();

    if (!superAdminEmail || email !== superAdminEmail) {
      // Intentionally generic error - never leak the authorized email
      return NextResponse.json(
        { success: false, error: 'عذراً، هذا الحساب غير مصرح له بالوصول إلى لوحة التحكم الإدارية' },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: {
        email,
        name: name || 'Admin',
        picture,
        role: 'superadmin'
      }
    });

    response.cookies.set('xpharma_session', 'authenticated', {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      httpOnly: false
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'حدث خطأ في معالجة طلب المصادقة' },
      { status: 500 }
    );
  }
}
