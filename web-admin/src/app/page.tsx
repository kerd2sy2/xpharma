import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Page() {
  const cookieStore = await cookies();
  const session = cookieStore.get('xpharma_session');

  if (session && session.value) {
    redirect('/dashboard/overview');
  } else {
    redirect('/login');
  }
}
