import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Reads the allowed roles from the route's `data.roles`, e.g.:
//   { path: 'admin', canActivate: [authGuard, roleGuard], data: { roles: ['admin'] }, ... }
// A logged-in user hitting a section that isn't theirs goes to their OWN home, not
// /login - they're already authenticated, just in the wrong place.
export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) return router.createUrlTree(['/login']);

  const allowedRoles = (route.data['roles'] as string[]) ?? [];
  const role = authService.currentUser()!.role;

  if (allowedRoles.includes(role)) return true;
  return router.createUrlTree([authService.homePathForRole(role)]);
};
