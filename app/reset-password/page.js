import { Suspense } from 'react';
import ResetPasswordForm from './ResetPasswordForm';
import { MobileMenuButton } from '../components/MobileNavigation';

export default function ResetPasswordPage() {
  return (
    <>
      <MobileMenuButton style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 60, color: '#ffffff', background: '#141414', borderColor: '#2a2a2a' }} />
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#ffffff' }}>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}