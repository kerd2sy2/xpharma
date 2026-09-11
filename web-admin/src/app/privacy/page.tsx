import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | سياسة الخصوصية - xpharma',
  description: 'Privacy policy and data protection terms for xpharma platform.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className='min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto'>
      <div className='border-b pb-6 mb-8'>
        <h1 className='text-3xl font-bold tracking-tight mb-2'>سياسة الخصوصية (Privacy Policy)</h1>
        <p className='text-sm text-muted-foreground'>آخر تحديث: 11 سبتمبر 2026</p>
      </div>

      <div className='prose dark:prose-invert space-y-6 text-sm leading-relaxed'>
        <section>
          <h2 className='text-xl font-semibold mb-2'>1. مقدمة</h2>
          <p>
            تلتزم منصة <strong>xpharma</strong> (المشار إليها بـ "نحن" أو "المنصة") بحماية خصوصية بيانات عملائها من مخازن الأدوية والصيدليات المشتركة. توضح هذه السياسة كيفية جمع واستخدام وتأمين البيانات عند استخدام خدمات المنصة وتطبيقاتها.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>2. البيانات التي نقوم بجمعها</h2>
          <ul className='list-disc list-inside space-y-1 text-muted-foreground'>
            <li><strong>بيانات الحساب:</strong> الاسم، البريد الإلكتروني (عبر تسجيل الدخول بجوجل Google OAuth)، ورقم الهاتف للتواصل والدعم.</li>
            <li><strong>بيانات الفواتير والعمليات:</strong> سجلات فواتير المبيعات، المرتجعات، سندات القبض، وكشوفات الحساب التراكمية التي يتم مزامنتها تلقائياً من برنامج المخزن.</li>
            <li><strong>بيانات الاستخدام:</strong> سجلات الدخول ونبضات الاتصال الخاصة بوكيل المزامنة (Agent Heartbeats).</li>
          </ul>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>3. الغرض من استخدام البيانات</h2>
          <p>
            تُستخدم البيانات حصرياً لتمكين الصيدلي من الاطلاع على حسابه وفواتيره لدى المخزن، وتسهيل التحقق من العمليات وسداد الاشتراكات. لا نقوم ببيع أو مشاركة أي بيانات تجارية مع أي طرف ثالث لأغراض إعلانية.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>4. حماية وأمن البيانات</h2>
          <p>
            تعتمد المنصة معمارية عزل متعددة المستأجرين (Schema-per-Tenant)، وتشفير كامل للاتصالات عبر بروتوكول HTTPS المشفر، مع تشفير كلمات المرور ومفاتيح المصادقة بتجزئة SHA-256.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>5. التواصل والدعم</h2>
          <p>
            لأي استفسارات بخصوص سياسة الخصوصية أو لحذف حسابك وبياناتك، يمكنك مراسلتنا على:
            <br />
            <strong>البريد الإلكتروني:</strong> <a href='mailto:kerd2sy@gmail.com' className='text-primary underline'>kerd2sy@gmail.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
