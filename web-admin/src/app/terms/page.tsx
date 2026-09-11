import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | شروط الاستخدام - xpharma',
  description: 'Terms of Service for xpharma pharmaceutical platform.',
};

export default function TermsOfServicePage() {
  return (
    <main className='min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto'>
      <div className='border-b pb-6 mb-8'>
        <h1 className='text-3xl font-bold tracking-tight mb-2'>شروط الاستخدام (Terms of Service)</h1>
        <p className='text-sm text-muted-foreground'>آخر تحديث: 11 سبتمبر 2026</p>
      </div>

      <div className='prose dark:prose-invert space-y-6 text-sm leading-relaxed'>
        <section>
          <h2 className='text-xl font-semibold mb-2'>1. شروط القبول</h2>
          <p>
            باستخدامك لتطبيقات ومنصة <strong>xpharma</strong>، فإنك توافق على الالتزام بجميع بنود وشروط هذه الاتفاقية. إذا كنت لا توافق على هذه الشروط، يرجى عدم استخدام خدماتنا.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>2. الحسابات والأمان</h2>
          <p>
            يتحمل المستخدم مسؤولية الحفاظ على سرية بيانات تسجيل الدخول وتوكنات الربط الخاصة بالصيدلية أو المخزن، وإبلاغ إدارة المنصة فوراً عن أي استخدام غير مصرح به.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>3. الاشتراكات وسداد الرسوم</h2>
          <p>
            تخضع خدمات المنصة لاشتراكات دورية (شهرية/سنوية). يتم تفعيل الاشتراكات بعد تأكيد استلام الدفع عبر الوسائل المعتمدة (مثل InstaPay) واعتمادها من قبل المشرف.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>4. حدود المسؤولية</h2>
          <p>
            تعمل المنصة على توفير البيانات كما هي مستخرجة من قاعدة بيانات المخزن دون تعديل. لا تتحمل المنصة مسؤولية أي خطأ في الإدخال اليدوي داخل برنامج المخزن المحلي.
          </p>
        </section>

        <section>
          <h2 className='text-xl font-semibold mb-2'>5. اتصل بنا</h2>
          <p>
            لأي استفسارات قانونية أو فنية:
            <br />
            <strong>البريد الإلكتروني:</strong> <a href='mailto:kerd2sy@gmail.com' className='text-primary underline'>kerd2sy@gmail.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
