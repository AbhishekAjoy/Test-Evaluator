import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Sits on the '' (root) and '**' (unmatched) routes. Never actually renders anything -
// always resolves to a redirect, so a bare visit to "/" or a mistyped URL lands a
// logged-in user on their own dashboard and an anonymous one on /login, rather than
// either seeing a blank page or getting bounced to /login while already signed in.
export const homeRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) return router.createUrlTree(['/login']);

  const role = authService.currentUser()!.role;
  return router.createUrlTree([authService.homePathForRole(role)]);
};
