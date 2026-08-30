import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Not a security boundary - the API enforces that already. This exists purely so an
// unauthenticated user gets redirected to /login instead of landing on a page whose
// every API call is guaranteed to fail.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) return true;
  return router.createUrlTree(['/login']);
};
