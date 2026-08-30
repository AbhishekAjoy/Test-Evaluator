import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// 401 means the token itself is no longer good (missing, invalid, expired, or the
// account was deactivated - authMiddleware returns 401 for all of these, deliberately
// distinct from 403). That's the one case a global handler can act on safely: the
// session is dead, so clear it and send the user back to /login. 403 is left alone -
// it means "you're authenticated fine, just not permitted for this specific action"
// (wrong role, don't own this resource), which is for the calling component to handle,
// not a reason to force a logout.
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        authService.logout();
        router.navigateByUrl('/login');
      }
      return throwError(() => error);
    })
  );
};
